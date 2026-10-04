import { alpha, darken, lighten, type Theme } from "@mui/material";

import type { FeedingType, FoodGroup } from "../../../api/health";
import { subtleBg } from "../../../theme/uiHelpers";
import type { BannerTone, StatusTone, WarningTone } from "./feedingAdvice";

/**
 * Цвета блока прикорма — только из темы, чтобы читались и в светлой, и в
 * тёмной: статусы (§3.6), группы продуктов, периоды вскармливания.
 */

/** Основной цвет статуса: точки, рамки, линии. */
export function toneColor(theme: Theme, tone: StatusTone): string {
  if (tone === "ok") return theme.palette.success.main;
  if (tone === "bad") return theme.palette.error.main;
  if (tone === "warn") return theme.palette.warning.main;
  if (tone === "on") return theme.palette.primary.main;
  return theme.palette.text.secondary;
}

/** Цвет текста статуса на поверхности (контраст ≈ AA). */
export function toneText(theme: Theme, tone: StatusTone): string {
  if (tone === "ok") return theme.palette.success.onSurface;
  if (tone === "bad") return theme.palette.error.onSurface;
  if (tone === "warn") return theme.palette.warning.onSurface;
  if (tone === "on") return theme.palette.primary.onSurface;
  return theme.palette.text.secondary;
}

/** Мягкая подложка статуса — как чипы макета. */
export function toneBg(theme: Theme, tone: StatusTone): string {
  if (tone === "muted") return subtleBg(theme, true);
  return alpha(toneColor(theme, tone), theme.palette.mode === "dark" ? 0.2 : 0.11);
}

export function bannerTone(tone: BannerTone): StatusTone {
  return tone === "error" ? "bad" : tone === "warning" ? "warn" : "on";
}

export function warningTone(tone: WarningTone): StatusTone {
  return tone === "error" ? "bad" : tone === "warning" ? "warn" : "muted";
}

/** Цвет группы продуктов — точка в журнале и в окне. Красный не берём: он у реакций. */
export function groupColor(theme: Theme, group: FoodGroup): string {
  switch (group) {
    case "vegetables":
      return theme.palette.success.main;
    case "cereals":
      return theme.palette.warning.light;
    case "meat":
      return theme.palette.secondary.main;
    case "fruits":
      return theme.palette.purple.main;
    case "egg":
      return theme.palette.warning.main;
    case "dairy":
      return theme.palette.info.main;
    case "fish":
      return theme.palette.teal.main;
    default:
      return theme.palette.grey[500];
  }
}

/** Цвет периода вскармливания — как у чипов периодов. */
export function feedingTypeColor(theme: Theme, type: FeedingType): string {
  if (type === "breast") return theme.palette.success.main;
  if (type === "general") return theme.palette.info.main;
  return theme.palette.warning.main;
}

/** Текст цветом группы или периода на подложке: в тёмной теме светлее, в светлой — темнее. */
export function readableOn(theme: Theme, color: string): string {
  return theme.palette.mode === "dark" ? lighten(color, 0.35) : darken(color, 0.3);
}
