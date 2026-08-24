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

/**
 * Нейтральная волосяная линия для разделителей ВНУТРИ блока.
 *
 * `theme.palette.divider` окрашен акцентом организации (см. theme.ts), и на
 * плотном списке из десятка строк он превращается в цветную «зебру». Для
 * внешних границ карточек и секций divider уместен, для построчных — нет.
 */
export const subtleBorder = (t: Theme): string =>
  t.palette.mode === "dark" ? alpha("#ffffff", 0.08) : alpha("#0b0d0f", 0.07);

/**
 * Подсветка поля «просим заполнить, но не обязаны» — янтарный тон, тот же,
 * которым помечена сама бронь (тумблер «Бронирование без пациента»).
 *
 * Отличается от обязательного поля намеренно: красный контур `error` означает
 * «сохранить нельзя», а этот — «лучше заполни». Поэтому не трогаем состояние
 * валидации, только цвета.
 */
export const attentionFieldSx = {
  "& .MuiOutlinedInput-root": {
    bgcolor: "warning.lighter",
    "& fieldset": { borderColor: "warning.light" },
    "&:hover fieldset": { borderColor: "warning.main" },
    "&.Mui-focused fieldset": { borderColor: "warning.main", borderWidth: 2 },
  },
  "& .MuiFormHelperText-root": { color: "warning.onSurface" },
} as const;
