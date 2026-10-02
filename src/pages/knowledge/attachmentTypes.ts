/**
 * Форматы файлов, которые можно приложить к статье базы знаний.
 *
 * Один реестр на всё: фильтр перетаскивания/вставки, `accept` у выбора файла,
 * лимит размера до отправки, метка на карточке и решение «карточка или плеер»
 * на странице статьи. Добавить формат — дописать строку сюда (и попросить бэк
 * разрешить его на `POST /knowledge/attachments/`, см.
 * MamaDoc/backend_ticket_knowledge_attachment_types.md).
 *
 * Сознательно НЕ входят: html/htm/svg/xml (скрипты с нашего домена — XSS),
 * исполняемые файлы, офисные файлы с макросами (docm/xlsm/pptm), архивы.
 */

export type AttachmentKind = "pdf" | "document" | "sheet" | "slides" | "text" | "audio" | "video";

interface AttachmentType {
  ext: string;
  mime: string;
  kind: AttachmentKind;
}

const TYPES: AttachmentType[] = [
  { ext: "pdf", mime: "application/pdf", kind: "pdf" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
  { ext: "doc", mime: "application/msword", kind: "document" },
  { ext: "odt", mime: "application/vnd.oasis.opendocument.text", kind: "document" },
  { ext: "rtf", mime: "application/rtf", kind: "document" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "sheet" },
  { ext: "xls", mime: "application/vnd.ms-excel", kind: "sheet" },
  { ext: "ods", mime: "application/vnd.oasis.opendocument.spreadsheet", kind: "sheet" },
  { ext: "csv", mime: "text/csv", kind: "sheet" },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "slides" },
  { ext: "ppt", mime: "application/vnd.ms-powerpoint", kind: "slides" },
  { ext: "odp", mime: "application/vnd.oasis.opendocument.presentation", kind: "slides" },
  { ext: "txt", mime: "text/plain", kind: "text" },
  { ext: "mp3", mime: "audio/mpeg", kind: "audio" },
  { ext: "m4a", mime: "audio/mp4", kind: "audio" },
  { ext: "mp4", mime: "video/mp4", kind: "video" },
];

/**
 * Лимиты размера, МБ. ⚠ Предположение фронта, а не факт от бэка — названы в
 * тикете как предложение; после ответа выровнять с реальными числами.
 */
const MAX_MB: Record<AttachmentKind, number> = {
  pdf: 25,
  document: 25,
  sheet: 25,
  slides: 25,
  text: 25,
  audio: 50,
  video: 100,
};

const BY_EXT = new Map(TYPES.map((t) => [t.ext, t]));

/** Расширение из имени файла или URL (query/hash игнорируем), в нижнем регистре. */
export function extOf(nameOrUrl: string): string {
  const path = nameOrUrl.trim().split(/[?#]/)[0];
  const last = path.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : "";
}

/**
 * Вид вложения по имени файла/URL; для файла с диска смотрим ещё MIME — у
 * перетащенного файла расширение бывает любым, а тип проставлен браузером.
 * null — формат не из списка.
 */
export function attachmentKindOf(file: Pick<File, "name" | "type"> | string): AttachmentKind | null {
  if (typeof file === "string") return BY_EXT.get(extOf(file))?.kind ?? null;
  const byExt = BY_EXT.get(extOf(file.name));
  if (byExt) return byExt.kind;
  return TYPES.find((t) => t.mime === file.type)?.kind ?? null;
}

export const attachmentMaxMb = (kind: AttachmentKind): number => MAX_MB[kind];

/** Метка формата на карточке: «DOCX», «MP3»… Для ссылки без расширения — «ФАЙЛ». */
export function attachmentLabel(nameOrUrl: string): string {
  const ext = extOf(nameOrUrl);
  return BY_EXT.has(ext) ? ext.toUpperCase() : "ФАЙЛ";
}

/** `accept` для выбора файла: и расширения, и MIME (часть пикеров смотрит только на одно). */
export const ATTACHMENT_ACCEPT = [
  ...TYPES.map((t) => `.${t.ext}`),
  ...Array.from(new Set(TYPES.map((t) => t.mime))),
].join(",");

/** Человеческий список форматов для подсказки в диалоге. */
export const ATTACHMENT_FORMATS_HINT =
  "PDF, Word, Excel, PowerPoint, OpenDocument, RTF, TXT, CSV, MP3, M4A, MP4";
