import dayjs from "dayjs";

export type PeriodMode = "month" | "year";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** «Сентябрь 2026» для месяца, «2026 год» для года. */
export function periodLabel(month: string, mode: PeriodMode): string {
  const d = dayjs(`${month}-01`);
  return mode === "year" ? `${d.year()} год` : `${MONTHS[d.month()]} ${d.year()}`;
}

/** Сдвиг периода на шаг (месяц или год) — значение всегда «YYYY-MM». */
export function shiftPeriod(month: string, mode: PeriodMode, step: -1 | 1): string {
  return dayjs(`${month}-01`).add(step, mode).format("YYYY-MM");
}

/** Можно ли шагнуть вперёд: будущие периоды отчёту не нужны. */
export function canGoForward(month: string, mode: PeriodMode, today = dayjs()): boolean {
  const next = dayjs(`${shiftPeriod(month, mode, 1)}-01`).startOf(mode);
  return !next.isAfter(today.startOf(mode));
}

/** Границы периода «YYYY-MM» как дат: весь месяц или весь год. */
export function periodBounds(month: string, mode: PeriodMode): { from: string; to: string } {
  const d = dayjs(`${month}-01`);
  return {
    from: d.startOf(mode).format("YYYY-MM-DD"),
    to: d.endOf(mode).format("YYYY-MM-DD"),
  };
}
