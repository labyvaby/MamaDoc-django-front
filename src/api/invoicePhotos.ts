/**
 * invoicePhotos.ts
 * Фото накладных (1–2 шт) у операций прихода.
 *
 * Одна и та же тройка эндпоинтов у трёх сущностей — партия вакцины, движение
 * склада, расход. Бэк выкатил их 17.08.2026
 * (`backend_ticket_cashless_methods_usage_and_invoice_photos.md`), флаг
 * INVOICE_PHOTOS_ENABLED включён.
 *
 * Проверено на проде 17.08.2026: GET отдаёт плоский массив; у движения не типа
 * `receipt` — 400 «Фото накладной доступны только для прихода»; лимит 2 файла,
 * до 25 МБ, jpg/jpeg/png/webp/heic/heif (мы всё равно жмём и переводим в jpg —
 * см. api/uploads.ts).
 *
 * ⚠ Известный баг бэка: у расхода с прежним одиночным чеком (`photoUrl`) GET
 * `/finance/expenses/{id}/invoices/` отвечает 500 — тот самый случай
 * «совместимости», где старое фото должно приходить первым элементом.
 * Обходим в useInvoicePhotos (`legacyPhotoUrl`), тикет бэку отправлен.
 *
 * ⚠ Имена полей элемента (`url`, `fileName`, …) на живых данных ещё не видели —
 * все проверенные операции без фото. Первую загрузку сверить с ответом.
 */
import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

/** Раскатка: обратно в false — штатный откат, данные бэка не трогаются. */
export const INVOICE_PHOTOS_ENABLED = true;

/** Заказчик просил «1–2 шт», бэк режет тем же числом. */
export const INVOICE_PHOTOS_MAX = 2;

/** Сущность, к которой крепится накладная. */
export type InvoicePhotoTarget = "vaccinationBatch" | "stockMovement" | "expense";

export interface InvoicePhoto {
  id: number;
  /** Абсолютная ссылка на изображение. */
  url: string;
  fileName?: string;
  sizeBytes?: number;
  uploadedByName?: string | null;
  createdAt?: string;
}

function basePath(target: InvoicePhotoTarget, entityId: number): string {
  switch (target) {
    case "vaccinationBatch":
      return `/vaccinations/batches/${entityId}/invoices/`;
    case "stockMovement":
      return `/warehouse/movements/${entityId}/invoices/`;
    case "expense":
      return `/finance/expenses/${entityId}/invoices/`;
  }
}

/** organizationId query-параметром — суперпользователю обязателен. */
function withOrg(path: string, organizationId?: number | null): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

/**
 * Ссылку на файл разные ручки бэка называют по-разному (`photoUrl` у расхода,
 * `fileUrl`/`image` у загрузок знаний), а на живых данных элемент списка мы ещё
 * не видели — все проверенные операции без фото. Плитка без `url` не
 * отрисовалась бы вовсе, поэтому принимаем любое из привычных имён.
 */
function normalizePhoto(photo: InvoicePhoto): InvoicePhoto {
  const raw = photo as InvoicePhoto & Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return {
    ...photo,
    url: str(raw.url) ?? str(raw.fileUrl) ?? str(raw.photoUrl) ?? str(raw.image) ?? "",
    fileName: raw.fileName ?? str(raw.name),
  };
}

export function getInvoicePhotos(
  target: InvoicePhotoTarget,
  entityId: number,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<InvoicePhoto[]> {
  return apiRequest<{ results: InvoicePhoto[] } | InvoicePhoto[]>(
    withOrg(basePath(target, entityId), organizationId),
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results).map(normalizePhoto));
}

/**
 * Загрузка одного фото. Снимок с телефона ужимаем и переводим в jpg — см.
 * api/uploads.ts (бэк режет тяжёлые файлы, HEIC не показать в превью).
 */
export async function uploadInvoicePhoto(
  target: InvoicePhotoTarget,
  entityId: number,
  file: File,
  organizationId?: number | null,
): Promise<InvoicePhoto> {
  const formData = new FormData();
  formData.append("image", await preparePhotoOrThrow(file));
  return withUploadErrors(() =>
    apiRequest<InvoicePhoto>(withOrg(basePath(target, entityId), organizationId), {
      method: "POST",
      formData,
    }).then(normalizePhoto),
  );
}

export function deleteInvoicePhoto(
  target: InvoicePhotoTarget,
  entityId: number,
  photoId: number,
  organizationId?: number | null,
): Promise<void> {
  return apiRequest<void>(
    withOrg(`${basePath(target, entityId)}${photoId}/`, organizationId),
    { method: "DELETE" },
  );
}
