import type { Theme } from "@mui/material";

import type { ChipTone } from "../vision/visionUi";
import type { OrthoStatus } from "./orthoNorms";

export { pairGridSx, toggleIn } from "../vision/visionUi";

/** Цвет статуса из темы: так рисунки и чипы читаются и в светлой, и в тёмной. */
export function orthoColor(theme: Theme, status: OrthoStatus): string {
  if (status === "ok") return theme.palette.success.main;
  if (status === "warn") return theme.palette.warning.main;
  if (status === "bad") return theme.palette.error.main;
  return theme.palette.grey[500];
}

/** Цвет текста статуса на фоне: в тёмной теме светлее, в светлой — темнее. */
export function orthoTextColor(theme: Theme, status: OrthoStatus): string {
  const palette =
    status === "ok" ? theme.palette.success : status === "warn" ? theme.palette.warning : status === "bad" ? theme.palette.error : null;
  if (!palette) return theme.palette.text.secondary;
  return theme.palette.mode === "dark" ? palette.light : palette.dark;
}

export const STATUS_WORD: Record<OrthoStatus, string> = {
  ok: "норма",
  warn: "пограничное",
  bad: "отклонение",
  unknown: "нет оценки",
};

export const STATUS_TONE: Record<OrthoStatus, ChipTone> = { ok: "success", warn: "warning", bad: "error", unknown: "primary" };
