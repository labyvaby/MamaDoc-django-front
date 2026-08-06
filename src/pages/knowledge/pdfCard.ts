import { alpha, type Theme } from "@mui/material/styles";

/**
 * Карточка PDF-вложения — один и тот же вид в редакторе статьи и на странице
 * чтения. Селектор общий: ссылка с меткой `title="pdf"` (см. PdfAttachment),
 * потому что после санитизации на бэке от разметки остаётся только `<a>` с
 * `href`/`title`/`rel` — ни класса, ни обёртки не сохранить.
 */
export const pdfCardStyles = (t: Theme) => ({
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
    content: '"PDF"',
    flexShrink: 0,
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: t.palette.error.main,
    border: `1px solid ${alpha(t.palette.error.main, 0.4)}`,
    borderRadius: "6px",
    padding: t.spacing(0.25, 0.5),
  },
});
