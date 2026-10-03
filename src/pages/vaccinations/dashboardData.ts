import dayjs from "dayjs";

import type { RecordsSummary } from "../../api/vaccinations";

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Подсказка при наведении (сумма и т.п.). */
  hint?: string;
  /** Длина полосы, 0…1: доля от целого (если задано) или от максимума. */
  share: number;
  /** Доля от целого «38 %» — когда целое задано. */
  pct?: string;
}

/**
 * Полосы. С total — длина и подпись «%» как доля от целого (сумма полос =
 * 100 %), без — длина относительно максимума.
 */
export function toBars(items: Omit<BarDatum, "share" | "pct">[], total?: number): BarDatum[] {
  if (total != null) {
    return items.map((i) => ({ ...i, share: total > 0 ? i.value / total : 0, pct: percent(i.value, total) }));
  }
  const max = Math.max(0, ...items.map((i) => i.value));
  return items.map((i) => ({ ...i, share: max > 0 ? i.value / max : 0 }));
}

/** 12 месяцев года, даже пустые — чтобы динамика читалась без дыр. */
export function yearMonths(
  year: number,
  byMonth: RecordsSummary["byMonth"],
): { key: string; label: string; count: number; amount: string }[] {
  const found = new Map(byMonth.map((m) => [m.month, m]));
  return Array.from({ length: 12 }, (_, i) => {
    const key = dayjs(new Date(year, i, 1)).format("YYYY-MM");
    const m = found.get(key);
    return { key, label: MONTHS_SHORT[i], count: m?.count ?? 0, amount: m?.amount ?? "0.00" };
  });
}

/** Доля «x из y» в процентах без дробей: 3 из 8 → «38 %». */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : "—";
}
