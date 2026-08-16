/**
 * invoicePhotos.ts
 * Фото накладных (1–2 шт) у операций прихода.
 *
 * Одна и та же тройка эндпоинтов у трёх сущностей — партия вакцины, движение
 * склада, расход. Контракт согласуется тикетом
 * `MamaDoc/backend_ticket_invoice_photos.md`; до релиза бэка вся ветка выключена
 * флагом INVOICE_PHOTOS_ENABLED (UI просто не показывает поле).
 *
 * ⚠ Пока флаг выключен, контракт — предложение фронта, а не факт из ответа бэка:
 * имя поля multipart (`image`), плоский массив в ответе, `detail` при превышении
 * лимита. Проверять curl-ом до включения (см. §4 тикета).
 */
import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

/** Включить после релиза бэка (см. тикет). */
export const INVOICE_PHOTOS_ENABLED = false;

/** Заказчик просил «1–2 шт» — больше двух не даём приложить. */
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
