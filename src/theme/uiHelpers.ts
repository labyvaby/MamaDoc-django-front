import { alpha, type Theme } from "@mui/material/styles";

/**
 * Лёгкая подложка, чуть отличная от фона карточки (для плиток, иконок, ховеров).
 * В тёмной теме — светлее на пару процентов, в светлой — чуть темнее.
 * Единый источник правды для «edge-on-edge» поверхностей нового стиля.
 *
 * См. docs/ui-style-guide.md §2.
 */
export const subtleBg = (t: Theme, strong = false): string =>
  t.palette.mode === "dark"
    ? alpha("#ffffff", strong ? 0.06 : 0.03)
    : alpha("#0b0d0f", strong ? 0.04 : 0.018);
