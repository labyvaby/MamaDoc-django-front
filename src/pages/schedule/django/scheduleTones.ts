import { alpha, type Theme } from "@mui/material/styles";

/**
 * Цвета смен и проблем вкладки «Настройка» — только токены темы, чтобы
 * работали светлая и тёмная темы и любой акцент из кастомайзера.
 */

/**
 * Текст на тоне акцента (`primary.lighter`): в светлой — тёмный акцент, в
 * тёмной — основной цвет текста. `primary.onSurface` подобран под карточку, а
 * не под тонированную плашку: время смен читалось на 4.9:1, «обед» — на 3.3:1.
 * Сверено по всем 36 пресетам: светлая ≥ 6.4:1, тёмная ≥ 9.2:1.
 */
export const accentFg = (t: Theme) =>
  t.palette.mode === "dark" ? t.palette.text.primary : t.palette.primary.dark;

export const warningFg = (t: Theme) =>
  t.palette.mode === "dark" ? t.palette.warning.light : t.palette.warning.dark;

export const errorFg = (t: Theme) =>
  t.palette.mode === "dark" ? t.palette.error.light : t.palette.error.dark;

/** Фон отсутствия — тинт warning. */
export const absenceBg = (t: Theme) => alpha(t.palette.warning.main, 0.14);

/** Тон столбца «сегодня». */
export const todayBg = (t: Theme) => alpha(t.palette.primary.main, 0.05);

export type IssueToneName = "error" | "warning" | "neutral";

export const issueDotColor = (t: Theme, tone: IssueToneName) =>
  tone === "error" ? t.palette.error.main : tone === "warning" ? t.palette.warning.main : t.palette.text.disabled;
