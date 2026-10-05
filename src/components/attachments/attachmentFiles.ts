/**
 * attachmentFiles.ts — что фронт знает о файлах карточки до отправки на бэк.
 *
 * Список форматов и лимит повторяют server/common/attachments.py
 * (`ATTACHMENT_FORMATS`, `MAX_ATTACHMENT_BYTES`): проверяем заранее, чтобы не
 * гнать по сети файл, который бэк всё равно отклонит. Содержимое файла
 * окончательно проверяет сервер — переименованный .exe он не пропустит.
 */
import dayjs from "dayjs";

import type { CardAttachment } from "../../api/attachments";
import { PHOTO_SOURCE_MAX_BYTES } from "../../utility/imageCompression";

export const ATTACHMENT_MAX_MB = 20;
export const ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_MB * 1024 * 1024;

/** Группа формата: по ней выбираются значок и цвет в списке. */
export type AttachmentCategory = "image" | "pdf" | "word" | "sheet" | "slides" | "text" | "other";

const CATEGORY_BY_EXTENSION: Record<string, AttachmentCategory> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  heic: "image",
  heif: "image",
  pdf: "pdf",
  doc: "word",
  docx: "word",
  odt: "word",
  rtf: "word",
  txt: "text",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  ppt: "slides",
  pptx: "slides",
};

export const ATTACHMENT_EXTENSIONS = Object.keys(CATEGORY_BY_EXTENSION);

/** Для `<input accept>`: только то, что примет бэк. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export const ATTACHMENT_FORMATS_HINT = `PDF, Word, Excel, фото и сканы — до ${ATTACHMENT_MAX_MB} МБ`;

/** Расширение в нижнем регистре; у «.bashrc» и «README» его нет. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function attachmentCategory(name: string): AttachmentCategory {
  return CATEGORY_BY_EXTENSION[fileExtension(name)] ?? "other";
}

/** Подпись формата в строке файла: «PDF», «DOCX». */
export function attachmentFormatLabel(name: string): string {
  const ext = fileExtension(name);
  return ext ? ext.toUpperCase() : "Файл";
}

/** «820 Б», «1,4 МБ», «12 МБ» — как в проводнике. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("ru-RU")} ${units[unit]}`;
}

/**
 * Почему файл нельзя отправить; `null` — можно. Снимки перед отправкой
 * ужимаются (api/uploads.ts), поэтому для них предел — размер исходника,
 * который вообще берётся в работу.
 */
export function attachmentRejectReason(file: Pick<File, "name" | "size">): string | null {
  const category = attachmentCategory(file.name);
  if (category === "other") return `«${file.name}» — такой формат не принимается`;
  if (file.size <= 0) return `«${file.name}» — файл пустой`;
  const limit = category === "image" ? PHOTO_SOURCE_MAX_BYTES : ATTACHMENT_MAX_BYTES;
  if (file.size > limit) {
    return `«${file.name}» — больше ${Math.round(limit / (1024 * 1024))} МБ`;
  }
  return null;
}

/** «PDF · 1,4 МБ · 05.10.2026, 14:30 · Айгуль» — одна строка под именем. */
export function attachmentMeta(attachment: Pick<CardAttachment, "name" | "sizeBytes" | "createdAt" | "uploadedByName">): string {
  return [
    attachmentFormatLabel(attachment.name),
    formatFileSize(attachment.sizeBytes),
    dayjs(attachment.createdAt).format("DD.MM.YYYY, HH:mm"),
    attachment.uploadedByName,
  ]
    .filter(Boolean)
    .join(" · ");
}
