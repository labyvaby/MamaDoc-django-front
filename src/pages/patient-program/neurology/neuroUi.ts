import type { Theme } from "@mui/material";

import type { ChipTone } from "../vision/visionUi";
import type { NeuroLevel } from "./neuroNorms";

export { pairGridSx, toggleIn } from "../vision/visionUi";

/**
 * Цвета уровней раздела «Неврология и развитие» — из темы, как в «Зрении» и
 * «Опорно-двигательной»: зелёный, жёлтый, красный, серый. «Срочно» — тот же
 * красный с пометкой.
 */

export function levelColor(theme: Theme, level: NeuroLevel): string {
  if (level === "ok") return theme.palette.success.main;
  if (level === "warn") return theme.palette.warning.main;
  if (level === "bad" || level === "urgent") return theme.palette.error.main;
  return theme.palette.grey[500];
}

/** Цвет текста уровня на фоне: в тёмной теме светлее, в светлой — темнее. */
export function levelTextColor(theme: Theme, level: NeuroLevel): string {
  const palette =
    level === "ok" ? theme.palette.success : level === "warn" ? theme.palette.warning : level === "bad" || level === "urgent" ? theme.palette.error : null;
  if (!palette) return theme.palette.text.secondary;
  return theme.palette.mode === "dark" ? palette.light : palette.dark;
}

export const LEVEL_TONE: Record<NeuroLevel, ChipTone> = { ok: "success", warn: "warning", bad: "error", urgent: "error", unknown: "primary" };
