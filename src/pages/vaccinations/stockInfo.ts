import dayjs from "dayjs";

import type { BatchProgram, VaccineBatch } from "../../api/vaccinations";

export type Tone = "error" | "warning" | "default";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Сколько осталось до конца срока словами и тон: истёк — красный, < 3 мес. — оранжевый. */
export function expiryInfo(expiresAt: string, today = dayjs()): { text: string; tone: Tone } {
  const end = dayjs(expiresAt);
  const days = end.startOf("day").diff(today.startOf("day"), "day");
  if (days < 0) {
    const ago = -days;
    return { text: `истёк ${ago} ${plural(ago, "день", "дня", "дней")} назад`, tone: "error" };
  }
  if (days === 0) return { text: "истекает сегодня", tone: "error" };
  const months = end.diff(today, "month");
  const text =
    months >= 1
      ? `ещё ${months} ${plural(months, "месяц", "месяца", "месяцев")}`
      : `ещё ${days} ${plural(days, "день", "дня", "дней")}`;
  return { text, tone: days < 90 ? "warning" : "default" };
}

export const PROGRAM_LABEL: Record<BatchProgram, string> = {
  commercial: "платная",
  state_planned: "гос., плановая",
  state_catchup: "гос., наверстывающая",
};

/** Использовано доз = пришло − осталось − списано (не меньше нуля). */
export function batchUsed(b: Pick<VaccineBatch, "quantityInitial" | "remaining" | "writtenOff">): number {
  return Math.max(0, b.quantityInitial - b.remaining - (b.writtenOff ?? 0));
}

/** Сводка партий одной вакцины для таблицы «Вакцины». */
export interface VaccineStock {
  batches: number;
  remaining: number;
  /** Ближайший срок среди непустых и неистёкших партий. */
  nearestExpiry: string | null;
}

export function stockByVaccine(batches: VaccineBatch[], today = dayjs()): Map<number, VaccineStock> {
  const map = new Map<number, VaccineStock>();
  for (const b of batches) {
    const s = map.get(b.vaccineId) ?? { batches: 0, remaining: 0, nearestExpiry: null };
    s.batches += 1;
    s.remaining += b.remaining;
    const usable = b.remaining > 0 && !dayjs(b.expiresAt).isBefore(today, "day");
    if (usable && (s.nearestExpiry == null || b.expiresAt < s.nearestExpiry)) s.nearestExpiry = b.expiresAt;
    map.set(b.vaccineId, s);
  }
  return map;
}

/** «2 партии», «83 дозы». */
export function countText(n: number, one: string, few: string, many: string): string {
  return `${n.toLocaleString("ru-RU")} ${plural(n, one, few, many)}`;
}
