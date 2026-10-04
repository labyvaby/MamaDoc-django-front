import { alpha, type Theme } from "@mui/material";

import type { Tone } from "./anamnesisTypes";
import type { ChipTone } from "./anamnesisView";

/** Цвета раздела «Анамнез жизни» из темы: статусы, текст на тонированном фоне. */

export function toneColor(theme: Theme, tone: Tone | ChipTone): string {
  if (tone === "ok") return theme.palette.success.main;
  if (tone === "warn") return theme.palette.warning.main;
  if (tone === "bad") return theme.palette.error.main;
  if (tone === "accent") return theme.palette.primary.main;
  return theme.palette.text.secondary;
}

/** Цвет текста на тонированном фоне: в тёмной теме светлее, в светлой — темнее. */
export function toneText(theme: Theme, tone: Tone | ChipTone): string {
  const palette =
    tone === "ok"
      ? theme.palette.success
      : tone === "warn"
        ? theme.palette.warning
        : tone === "bad"
          ? theme.palette.error
          : tone === "accent"
            ? theme.palette.primary
            : null;
  if (!palette) return theme.palette.text.primary;
  return theme.palette.mode === "dark" ? palette.light : palette.dark;
}

/** Подложка «утопленного» блока. */
export const sunkBg = (theme: Theme): string => alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.05 : 0.03);

/** «—» для пустого значения. */
export const orDash = (value: string | number | null | undefined): string => (value == null || value === "" ? "—" : String(value));
