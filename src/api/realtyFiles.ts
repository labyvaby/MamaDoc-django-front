import { apiRequest } from "./client";
import type { RealtyScope } from "./realestate";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

/**
 * Файлы ЖК (AIVIO, `frontend-new-modules.md` §1, 07.10.2026): фото и фасад,
 * рендеры интерьера, планы планировок, презентация и «Документы объекта».
 * - список — `GET /api/v2/realty/projects/<id>/files/?kind=&layoutId=`, те же
 *   файлы приходят и без запроса: в ЖК (`coverUrl`, `facadeUrl`, `photos[]`,
 *   `documents[]`, `presentation`), в квартире и планировке (`images[]` — план,
 *   `renders[]`, `media[]` с подписями);
 * - загрузить — multipart `POST .../files/`, удалить — `DELETE .../files/<fid>/`;
 * - смотреть — `realty.view`, загружать и удалять — `realty.catalog.manage`;
 *   ЖК чужого филиала → 404;
 * - ⚠ ссылка `url` защищена (сессия + организация): `<img src>` не годится —
 *   берём blob-ом (`fetchProtectedFile`) и показываем через `URL.createObjectURL`.
 */

export const PROJECT_FILE_KINDS = ["photo", "facade", "render", "plan", "presentation", "document"] as const;
export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];
/** Виды, которые привязываются к планировке (`layoutId`). */
export const LAYOUT_FILE_KINDS: readonly ProjectFileKind[] = ["plan", "render"];
/** Предел бэка на файл. */
export const PROJECT_FILE_MAX_BYTES = 25 * 1024 * 1024;

export interface ProjectFile {
  id: number;
  projectId: number;
  layoutId: number | null;
  layoutCode: string;
  kind: ProjectFileKind | string;
  kindLabel: string;
  title: string;
  note: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  url: string;
  sortOrder: number;
  createdAt: string | null;
}

/** Файлы ЖК в ответе `/projects/` и `/projects/<id>/`. */
export interface ProjectMedia {
  coverUrl: string | null;
  facadeUrl: string | null;
  photos: ProjectFile[];
  documents: ProjectFile[];
  presentation: ProjectFile | null;
}

/** Картинки квартиры и планировки: план, рендеры и они же с подписями. */
export interface UnitMedia {
  images: string[];
  renders: string[];
  media: ProjectFile[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
export const fromRawProjectFile = (raw: any): ProjectFile => ({
  id: Number(raw.id),
  projectId: Number(raw.projectId),
  layoutId: raw.layoutId == null ? null : Number(raw.layoutId),
  layoutCode: raw.layoutCode ?? "",
  kind: raw.kind ?? "",
  kindLabel: raw.kindLabel ?? "",
  title: raw.title ?? "",
  note: raw.note ?? "",
  fileName: raw.fileName ?? "",
  fileSize: Number(raw.fileSize) || 0,
  contentType: raw.contentType ?? "",
  url: raw.url ?? "",
  sortOrder: Number(raw.sortOrder) || 0,
  createdAt: raw.createdAt ?? null,
});

const files = (raw: unknown): ProjectFile[] => (Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object" && (item as { url?: unknown }).url).map(fromRawProjectFile) : []);
const urls = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.length > 0) : []);

export const fromRawProjectMedia = (raw: any): ProjectMedia => ({
  coverUrl: raw?.coverUrl || null,
  facadeUrl: raw?.facadeUrl || null,
  photos: files(raw?.photos),
  documents: files(raw?.documents),
  presentation: raw?.presentation && typeof raw.presentation === "object" && raw.presentation.url ? fromRawProjectFile(raw.presentation) : null,
});

export const fromRawUnitMedia = (raw: any): UnitMedia => ({ images: urls(raw?.images), renders: urls(raw?.renders), media: files(raw?.media) });
/* eslint-enable @typescript-eslint/no-explicit-any */

export const isImageFile = (file: Pick<ProjectFile, "contentType" | "fileName">) => file.contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.fileName);

/** Рендеры квартиры с подписями: из `media[]`, а если его нет — голые ссылки `renders[]`. */
export function unitRenders(media: UnitMedia): { url: string; title: string; note: string }[] {
  const captioned = media.media.filter((f) => f.kind === "render");
  if (captioned.length) return captioned.map((f) => ({ url: f.url, title: f.title, note: f.note }));
  return media.renders.map((url) => ({ url, title: "", note: "" }));
}

/**
 * План планировки: первая картинка `images[]` (или `plan` из `media[]`).
 * С 09.10.2026 план — только JPG / PNG / WEBP; `pdf` — план, загруженный
 * раньше PDF-файлом: его не показать в `<img>`, только скачать.
 */
export function unitPlan(media: UnitMedia): { url: string; title: string; note: string; pdf: boolean } | null {
  const plan = media.media.find((f) => f.kind === "plan");
  if (plan) return { url: plan.url, title: plan.title, note: plan.note, pdf: plan.contentType === "application/pdf" || /\.pdf$/i.test(plan.fileName) };
  return media.images[0] ? { url: media.images[0], title: "", note: "", pdf: false } : null;
}

/** «1,2 МБ» / «820 КБ». */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("ru-RU")} КБ`;
}

// Свой заголовок организации, не `realtyHeaders`: realestate.ts сам импортирует
// разбор картинок квартиры отсюда — без цикла импортов.
const realtyHeaders = (scope?: RealtyScope): Record<string, string> => (scope?.organizationId != null ? { "X-Organization-Id": String(scope.organizationId) } : {});

const filesPath = (projectId: number) => `/v2/realty/projects/${projectId}/files/`;

export async function getProjectFiles(projectId: number, params: { kind?: ProjectFileKind | null; layoutId?: number | null } = {}, scope?: RealtyScope, signal?: AbortSignal): Promise<ProjectFile[]> {
  const query = new URLSearchParams();
  if (params.kind) query.set("kind", params.kind);
  if (params.layoutId != null) query.set("layoutId", String(params.layoutId));
  const qs = query.toString();
  return files(await apiRequest(`${filesPath(projectId)}${qs ? `?${qs}` : ""}`, { headers: realtyHeaders(scope), signal }));
}

export interface ProjectFileInput {
  file: File;
  kind: ProjectFileKind;
  title: string;
  note: string;
  /** Только для `plan` / `render`. */
  layoutId: number | null;
}

/**
 * Загрузка: картинки ужимаем как везде (снимок с телефона весит мегабайты),
 * план — с прозрачностью; PDF и документы — как есть. Ошибка бэка (не тот тип,
 * пусто, больше 25 МБ, подделка) — 400 с `details.fields.file`.
 */
export async function uploadProjectFile(projectId: number, input: ProjectFileInput, scope?: RealtyScope): Promise<ProjectFile> {
  const isImage = input.file.type.startsWith("image/") && input.file.type !== "image/svg+xml";
  const file = isImage && input.kind !== "document" && input.kind !== "presentation" ? await preparePhotoOrThrow(input.file, { keepAlpha: input.kind === "plan" }) : input.file;
  const form = new FormData();
  form.append("file", file);
  form.append("kind", input.kind);
  if (input.title.trim()) form.append("title", input.title.trim());
  if (input.note.trim()) form.append("note", input.note.trim());
  if (input.layoutId != null && LAYOUT_FILE_KINDS.includes(input.kind)) form.append("layoutId", String(input.layoutId));
  return fromRawProjectFile(await withUploadErrors(() => apiRequest(filesPath(projectId), { method: "POST", formData: form, headers: realtyHeaders(scope) })));
}

export async function deleteProjectFile(projectId: number, fileId: number, scope?: RealtyScope): Promise<void> {
  await apiRequest(`${filesPath(projectId)}${fileId}/`, { method: "DELETE", headers: realtyHeaders(scope) });
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyFileKeys = {
  all: ["django", "realty", "files"] as const,
  list: (scope: RealtyScope | undefined, projectId: number) => [...realtyFileKeys.all, ...scopeKey(scope), projectId] as const,
  /** Содержимое защищённого файла (blob) — по ссылке, без скоупа: ссылка уже уникальна. */
  blob: (url: string) => [...realtyFileKeys.all, "blob", url] as const,
};
