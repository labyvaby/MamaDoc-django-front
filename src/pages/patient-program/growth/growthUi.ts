import type { Theme } from "@mui/material";

import type { GrowthStatus } from "./growthNorms";

/** Цвет оценки: норма — зелёный, погранично — жёлтый, внимание — красный. */
export function growthColor(theme: Theme, status: GrowthStatus): string {
  if (status === "ok") return theme.palette.success.main;
  if (status === "borderline") return theme.palette.warning.main;
  if (status === "attention") return theme.palette.error.main;
  return theme.palette.grey[400];
}

/**
 * Где в поле 24×24 у силуэтов Material Icons макушка и пятки:
 * `BoyRounded`/`GirlRounded` — 4 и 20, `AccessibilityNewRounded` — 2 и 21.
 */
export const FIGURE_BOUNDS = {
  child: { top: 4, bottom: 20 },
  neutral: { top: 2, bottom: 21 },
} as const;

/** 24 → «24», 24.5 → «24,5», 15.86 при одном знаке → «15,9». */
export function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",").replace(/,0+$/, "");
}

function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (count % 10 === 1) return one;
  if (count % 10 >= 2 && count % 10 <= 4) return few;
  return many;
}

/** Подпись оси возраста: до 2 лет — месяцы, целые годы — «5 лет», иначе «4,5 г.». */
export function ageTick(months: number): string {
  if (months < 24) return `${Math.round(months)} мес.`;
  if (Math.abs(months % 12) < 1e-9) {
    const years = months / 12;
    return `${years} ${plural(years, "год", "года", "лет")}`;
  }
  return `${formatNumber(months / 12, 1)} г.`;
}

/** Деления оси возраста: через 3, 6 или 12 месяцев — по длине периода. */
export function ageTicks(from: number, to: number): number[] {
  const span = to - from;
  const step = span <= 18 ? 3 : span <= 48 ? 6 : 12;
  const ticks: number[] = [];
  for (let month = Math.ceil(from / step) * step; month <= to + 1e-9; month += step) ticks.push(month);
  return ticks;
}
