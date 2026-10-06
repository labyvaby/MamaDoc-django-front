import { alpha, darken, lighten, type Theme } from "@mui/material/styles";

/**
 * Цвета отметок табеля. Код хранит один цвет (#RRGGBB), а заливку и цвет
 * буквы выводим из него — так отметка читается и в светлой, и в тёмной теме.
 */

/** Цвет буквы отметки. */
export function codeInk(theme: Theme, color: string): string {
  return theme.palette.mode === "dark" ? lighten(color, 0.28) : darken(color, 0.32);
}

/** Заливка ячейки отметки; `strength` усиливает или ослабляет тон. */
export function codeFill(theme: Theme, color: string, strength = 1): string {
  return alpha(color, (theme.palette.mode === "dark" ? 0.26 : 0.17) * strength);
}
