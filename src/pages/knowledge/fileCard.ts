import { alpha, type Theme } from "@mui/material/styles";

import { FILE_LINK_TITLE, PDF_LINK_TITLE } from "../../api/knowledge";
import { attachmentLabel } from "./attachmentTypes";

/** Селектор ссылок-вложений (обе метки, см. articleBlocks.tsx). */
export const FILE_CARD_SELECTOR = `a[title="${PDF_LINK_TITLE}"], a[title="${FILE_LINK_TITLE}"]`;

/**
 * Метка формата на карточке. У `title="pdf"` — всегда «PDF»: старые вложения
 * бывают ссылками без расширения (файл из «Документов»).
 */
export const fileCardLabel = (title: string | null, href: string): string =>
  title === PDF_LINK_TITLE ? "PDF" : attachmentLabel(href);

/**
 * Карточка файла-вложения — один и тот же вид в редакторе статьи и на странице
 * чтения. После санитизации на бэке от разметки остаётся только `<a>` с
 * `href`/`title`/`rel` — ни класса, ни обёртки не сохранить, поэтому метку
 * формата (`data-ext`) проставляем при рендере: нод редактора и
 * processArticleHtml на странице статьи.
 */
export const fileCardStyles = (t: Theme) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: t.spacing(1),
  maxWidth: "100%",
  margin: t.spacing(1.5, 0),
  padding: t.spacing(1, 1.25),
  borderRadius: "10px",
  border: `1px solid ${t.palette.divider}`,
  color: t.palette.text.primary,
  textDecoration: "none",
  fontSize: "0.9rem",
  lineHeight: 1.35,
  wordBreak: "break-word",
  transition: "background-color .15s ease, border-color .15s ease",
  "&:hover": {
    backgroundColor: t.palette.action.hover,
    borderColor: t.palette.text.disabled,
  },
  // Метка формата вместо иконки: карточка собирается из одной ссылки, вложить
  // в неё <svg> нельзя — санитайзер оставит только текст.
  "&::before": {
    content: 'attr(data-ext)',
    flexShrink: 0,
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: t.palette.text.secondary,
    border: `1px solid ${t.palette.divider}`,
    borderRadius: "6px",
    padding: t.spacing(0.25, 0.5),
  },
  // PDF — привычный красный, как у значка PDF-файлов везде.
  [`&[title="${PDF_LINK_TITLE}"]::before`]: {
    color: t.palette.error.main,
    borderColor: alpha(t.palette.error.main, 0.4),
  },
});
