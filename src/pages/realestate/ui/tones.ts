import { alpha, type Theme } from "@mui/material/styles";
import type { OfferTone, UnitStatus } from "../../../api/realestate";
import { subtleBg } from "../../../theme/uiHelpers";

/**
 * Цвета статусов квартиры из токенов темы: свободна — success, бронь — warning,
 * продана — нейтральный серый. В прототипе были свои хексы (#22a06b/#f59e0b/#858b82),
 * здесь те же оттенки берутся из палитры, поэтому работают тёмная тема и смена акцента.
 */
export function statusTone(t: Theme, status: UnitStatus) {
  const dark = t.palette.mode === "dark";
  if (status === "sold") {
    const main = dark ? t.palette.grey[500] : t.palette.grey[600];
    return {
      main,
      text: t.palette.text.secondary,
      bg: subtleBg(t, true),
      border: alpha(main, 0.55),
      solid: dark ? t.palette.grey[600] : t.palette.grey[400],
      solidText: t.palette.getContrastText(dark ? t.palette.grey[600] : t.palette.grey[400]),
    };
  }
  const color = status === "free" ? t.palette.success : t.palette.warning;
  return {
    main: color.main,
    text: color.onSurface,
    bg: alpha(color.main, dark ? 0.16 : 0.09),
    border: alpha(color.main, status === "reserved" ? 0.7 : 0.35),
    solid: color.main,
    solidText: color.contrastText,
  };
}

/** Тона карточек акций: в прототипе зелёный/оранжевый/фиолетовый/синий. */
export function offerTone(t: Theme, tone: OfferTone) {
  const color =
    tone === "green"
      ? t.palette.success
      : tone === "orange"
        ? t.palette.warning
        : tone === "violet"
          ? t.palette.purple
          : t.palette.info;
  const dark = t.palette.mode === "dark";
  return {
    bg: alpha(color.main, dark ? 0.1 : 0.05),
    border: alpha(color.main, 0.35),
    iconBg: alpha(color.main, dark ? 0.22 : 0.14),
    iconText: dark ? color.light : color.dark,
  };
}

/** Надпись-«бровь» над заголовками карточки (в прототипе — капсом оливковым). */
export const eyebrowSx = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "primary.onSurface",
  mb: 0.75,
} as const;

/** Секция карточки квартиры: плоская рамка на токенах темы. */
export const sectionSx = {
  mt: 2,
  p: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: "14px",
  bgcolor: "background.paper",
} as const;
