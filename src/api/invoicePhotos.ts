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
 * Прежний одиночный чек расхода (`photoUrl`) приходит первым элементом списка с
 * отрицательным `id` (`-expense.pk`) — по нему же работает и DELETE. 500 на
 * таких расходах бэк починил 18.08.2026 (`bb15e58`), обход на фронте снят.
 *
 * Форма элемента подтверждена бэком на живых данных (18.08.2026): ссылка
 * называется `url`, синонимов (`fileUrl`/`photoUrl`/`image`) нет.
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

export function getInvoicePhotos(
  target: InvoicePhotoTarget,
  entityId: number,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<InvoicePhoto[]> {
  return apiRequest<{ results: InvoicePhoto[] } | InvoicePhoto[]>(
    withOrg(basePath(target, entityId), organizationId),
    { signal },
  ).then((data) => (Array.isArray(data) ? data : data.results));
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
    }),
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
