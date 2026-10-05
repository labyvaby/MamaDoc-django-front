/**
 * Период отчёта «Прибыли и убытки»: месяц / квартал / год / свои даты.
 * Текущий период обрезается концом текущего месяца — будущие пустые месяцы
 * в таблице не нужны.
 */
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

export type PnlPeriodMode = "month" | "quarter" | "year" | "custom";

export interface PnlPeriod {
  mode: PnlPeriodMode;
  from: Dayjs;
  to: Dayjs;
}

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const QUARTERS = ["I", "II", "III", "IV"];

export function periodFor(mode: Exclude<PnlPeriodMode, "custom">, anchor: Dayjs, today: Dayjs = dayjs()): PnlPeriod {
  const monthStart = anchor.startOf("month");
  let from: Dayjs;
  let to: Dayjs;
  if (mode === "month") {
    from = monthStart;
    to = monthStart.endOf("month");
  } else if (mode === "quarter") {
    from = monthStart.month(Math.floor(monthStart.month() / 3) * 3);
    to = from.add(2, "month").endOf("month");
  } else {
    from = monthStart.startOf("year");
    to = from.endOf("year");
  }
  const limit = today.endOf("month");
  return { mode, from, to: to.isAfter(limit) && !from.isAfter(limit) ? limit : to };
}

export function customPeriod(from: Dayjs, to: Dayjs): PnlPeriod {
  return { mode: "custom", from: from.startOf("day"), to: to.startOf("day") };
}

export function shiftPeriod(period: PnlPeriod, step: 1 | -1, today: Dayjs = dayjs()): PnlPeriod {
  if (period.mode === "custom") return period;
  const anchor =
    period.mode === "year"
      ? period.from.add(step, "year")
      : period.from.add(step * (period.mode === "quarter" ? 3 : 1), "month");
  return periodFor(period.mode, anchor, today);
}

export const toApiDate = (day: Dayjs): string => day.format("YYYY-MM-DD");

/** «сентябрь 2026», «2025», «январь–сентябрь 2026», «01.02.2026–15.03.2026». */
export function describeRange(from: Dayjs, to: Dayjs): string {
  const fullMonths = from.date() === 1 && to.date() === to.daysInMonth();
  if (!fullMonths) return `${from.format("DD.MM.YYYY")}–${to.format("DD.MM.YYYY")}`;
  const sameYear = from.year() === to.year();
  if (sameYear && from.month() === to.month()) return `${MONTHS[from.month()]} ${from.year()}`;
  if (sameYear && from.month() === 0 && to.month() === 11) return String(from.year());
  if (sameYear) return `${MONTHS[from.month()]}–${MONTHS[to.month()]} ${from.year()}`;
  return `${MONTHS[from.month()]} ${from.year()} – ${MONTHS[to.month()]} ${to.year()}`;
}

export function periodTitle(period: PnlPeriod): string {
  if (period.mode === "quarter") {
    return `${QUARTERS[Math.floor(period.from.month() / 3)]} квартал ${period.from.year()}`;
  }
  return describeRange(period.from, period.to);
}

/** "2026-01" → «янв» или «янв 2026». */
export function monthLabel(key: string, withYear = false): string {
  const [year, month] = key.split("-");
  const short = MONTHS_SHORT[Number(month) - 1];
  return withYear ? `${short} ${year}` : short;
}
