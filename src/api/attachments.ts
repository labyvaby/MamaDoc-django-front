/**
 * attachments.ts — файлы в карточке пациента и клиента: документы, сканы, фото.
 *
 * Бэк: `/api/v2/patients/<id>/attachments/` и `/api/v2/clients/<id>/attachments/`
 * (server/common/attachments.py). Файл никогда не отдаётся прямой ссылкой на
 * `/media`: `url`, `downloadUrl` и `thumbnailUrl` указывают на API, который при
 * каждом чтении проверяет доступ к карточке (`patients.view` / `clients.view`).
 * Ссылки клиента уже несут `organizationId` — `<img>` заголовков не шлёт, а
 * организацию бэк должен знать.
 */
import { apiRequest } from "./client";
import { protectedFilePath } from "./protectedFile";
import { preparePhotoIfImage, withUploadErrors } from "./uploads";

export type AttachmentOwner =
  | { kind: "patient"; id: number }
  | { kind: "client"; id: number; organizationId: number };

/** Как файл можно показать: картинкой, во вьювере PDF или только скачать. */
export type AttachmentKind = "image" | "pdf" | "document";

export interface CardAttachment {
  id: number;
  name: string;
  kind: AttachmentKind;
  contentType: string;
  sizeBytes: number;
  url: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

function collectionPath(owner: AttachmentOwner): string {
  return owner.kind === "patient"
    ? `/v2/patients/${owner.id}/attachments/`
    : `/v2/clients/${owner.id}/attachments/`;
}

function withOrganization(path: string, owner: AttachmentOwner): string {
  return owner.kind === "client" ? `${path}?organizationId=${owner.organizationId}` : path;
}

export function listCardAttachments(owner: AttachmentOwner, signal?: AbortSignal): Promise<CardAttachment[]> {
  return apiRequest<CardAttachment[]>(withOrganization(collectionPath(owner), owner), { signal });
}

export async function uploadCardAttachment(owner: AttachmentOwner, file: File): Promise<CardAttachment> {
  const form = new FormData();
  // Фото ужимаем и HEIC переводим в jpg, как во вложениях задач: тяжёлый снимок
  // долго уходит по мобильному интернету, а HEIC показывает только Safari.
  form.append("file", await preparePhotoIfImage(file));
  return withUploadErrors(() =>
    apiRequest<CardAttachment>(withOrganization(collectionPath(owner), owner), {
      method: "POST",
      formData: form,
    }),
  );
}

export function renameCardAttachment(owner: AttachmentOwner, attachmentId: number, name: string): Promise<CardAttachment> {
  return apiRequest<CardAttachment>(withOrganization(`${collectionPath(owner)}${attachmentId}/`, owner), {
    method: "PATCH",
    body: { name },
  });
}

export function deleteCardAttachment(owner: AttachmentOwner, attachmentId: number): Promise<void> {
  return apiRequest<void>(withOrganization(`${collectionPath(owner)}${attachmentId}/`, owner), {
    method: "DELETE",
  });
}

/**
 * Адрес файла для `<img>`, `<iframe>` и ссылки «скачать». Бэк отдаёт путь API;
 * ведём его через тот же базовый адрес, что и остальные запросы, — тогда сессия
 * уходит вместе с ним и в dev (через прокси), и в проде.
 */
export function attachmentSrc(url: string): string {
  return protectedFilePath(url);
}
