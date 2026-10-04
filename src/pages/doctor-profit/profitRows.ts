import type { ProfitRow } from "../../api/doctorProfit";

export type ProfitSortKey =
  | "fullName"
  | "totalMinutes"
  | "revenue"
  | "salary"
  | "cost"
  | "profitDirect"
  | "overhead"
  | "profit"
  | "marginPct";

export type SortDir = "asc" | "desc";

/** Decimal-строка бэка → число (пусто — 0). */
export const toNumber = (value: string | number | null | undefined): number => Number(value ?? 0) || 0;

/** Подпись строки: у позиций без врача имени нет. */
export const rowLabel = (row: ProfitRow): string => (row.employeeId == null ? "Без врача" : row.fullName);

/** «3 ч 15 мин»; меньше часа — только минуты. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m > 0) return `${m} мин`;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/** «2026-10» → «октябрь 2026». */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${year}` : month;
}

/** Маржа «12,5 %»; без выручки — прочерк. */
export const formatMargin = (value: number | null): string =>
  value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`;

/**
 * Сортировка таблицы. «Без врача» всегда внизу; пустая маржа (нет выручки)
 * внизу в обоих направлениях.
 */
export function sortRows(rows: ProfitRow[], key: ProfitSortKey, dir: SortDir): ProfitRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if ((a.employeeId == null) !== (b.employeeId == null)) return a.employeeId == null ? 1 : -1;
    if (key === "fullName") return sign * rowLabel(a).localeCompare(rowLabel(b), "ru");
    if (key === "marginPct") {
      if (a.marginPct == null || b.marginPct == null) {
        if (a.marginPct == null && b.marginPct == null) return 0;
        return a.marginPct == null ? 1 : -1;
      }
      return sign * (a.marginPct - b.marginPct);
    }
    const av = key === "totalMinutes" ? a.totalMinutes : toNumber(a[key]);
    const bv = key === "totalMinutes" ? b.totalMinutes : toNumber(b[key]);
    return sign * (av - bv);
  });
}
