import type { Theme } from "@mui/material";

import type { GrowthStatus } from "./growthNorms";

/** Цвет оценки: норма — зелёный, погранично — жёлтый, внимание — красный. */
export function growthColor(theme: Theme, status: GrowthStatus): string {
  if (status === "ok") return theme.palette.success.main;
  if (status === "borderline") return theme.palette.warning.main;
  if (status === "attention") return theme.palette.error.main;
  return theme.palette.grey[400];
}

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

/**
 * Окно графика по возрасту замеров (3 мес. до первого, 6 после последнего);
 * коридоры ВОЗ — только в пределах таблицы (`tableEnd`, месяцы), null — без них.
 */
export function chartRange(
  ages: ReadonlyArray<number>,
  tableEnd: number | null,
): { from: number; to: number; curveTo: number | null } {
  const from = Math.max(0, Math.floor(Math.min(...ages) - 3));
  const to = Math.ceil(Math.max(...ages) + 6);
  const curveTo = tableEnd == null ? null : Math.min(tableEnd, to);
  return { from, to, curveTo: curveTo != null && curveTo > from ? curveTo : null };
}

/**
 * Пределы оси значений: коридор ВОЗ и замеры вместе, с небольшим запасом —
 * иначе одна странная точка прячет нормы за краем графика.
 */
const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100];

export function valueAxis(values: ReadonlyArray<number>): { domain: [number, number]; ticks: number[] } | null {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const wanted = Math.max((max - min) / 6, 0.5);
  const step = NICE_STEPS.find((item) => item >= wanted) ?? 100;
  // Круглые деления и запас в пятую часть шага, чтобы линии не упирались в край.
  const low = Math.max(0, Math.floor((min - step * 0.2) / step) * step);
  const high = Math.ceil((max + step * 0.2) / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + 1e-9; value += step) ticks.push(Math.round(value * 100) / 100);
  return { domain: [low, high], ticks };
}

/** Деления оси возраста: через 3, 6 или 12 месяцев — по длине периода. */
export function ageTicks(from: number, to: number): number[] {
  const span = to - from;
  const step = span <= 18 ? 3 : span <= 48 ? 6 : 12;
  const ticks: number[] = [];
  for (let month = Math.ceil(from / step) * step; month <= to + 1e-9; month += step) ticks.push(month);
  return ticks;
}
