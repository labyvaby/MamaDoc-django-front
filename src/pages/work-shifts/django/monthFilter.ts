import dayjs, { type Dayjs } from "dayjs";

/**
 * Быстрый выбор периода по месяцам для СКУД.
 *
 * Поля «От»/«До» остаются источником правды — селектор только переставляет их
 * на границы календарного месяца. Так журнал смен листается за один клик
 * (типовой запрос табельщика — «весь сентябрь»), а произвольный период
 * по-прежнему набирается руками.
 *
 * Названия месяцев зашиты, а не берутся из локали dayjs: `dayjs.locale("ru")`
 * в проекте включается побочным эффектом импорта в случайных модулях, поэтому
 * на неё нельзя опираться — подписи должны быть одинаковыми всегда.
 */
const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

/** Ключ месяца в формате `YYYY-MM`. */
export type MonthKey = string;

export interface MonthOption {
  value: MonthKey;
  label: string;
}

/** Сколько месяцев показываем в селекторе, считая текущий. */
export const MONTH_OPTIONS_COUNT = 12;

/** «Сентябрь 2026» для ключа `2026-09`. */
export function formatMonthLabel(month: MonthKey): string {
  const d = dayjs(`${month}-01`);
  if (!d.isValid()) return month;
  return `${MONTH_NAMES[d.month()]} ${d.year()}`;
}

/** Границы календарного месяца в том же формате, что хранят «От»/«До». */
export function rangeForMonth(month: MonthKey): { startDate: string; endDate: string } {
  const d = dayjs(`${month}-01`).startOf("month");
  return {
    startDate: d.format("YYYY-MM-DD"),
    endDate: d.endOf("month").format("YYYY-MM-DD"),
  };
}

/**
 * Ключ месяца, если период — ровно один календарный месяц.
 * Для любого другого диапазона возвращает null: селектор покажет «Свой период».
 */
export function monthKeyForRange(startDate: string, endDate: string): MonthKey | null {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid()) return null;
  if (!start.isSame(start.startOf("month"), "day")) return null;
  if (!end.isSame(start.endOf("month"), "day")) return null;
  return start.format("YYYY-MM");
}

/**
 * Последние `count` месяцев, новые сверху. Выбранный месяц добавляется, даже
 * если он вне окна: период мог прийти из «От»/«До» за прошлый год, и селектор
 * не должен показывать пустое значение при непустом фильтре.
 */
export function buildMonthOptions(
  selected: MonthKey | null,
  count: number = MONTH_OPTIONS_COUNT,
  today: Dayjs = dayjs(),
): MonthOption[] {
  const base = today.startOf("month");
  const keys = new Set<MonthKey>();
  for (let i = 0; i < count; i += 1) {
    keys.add(base.subtract(i, "month").format("YYYY-MM"));
  }
  if (selected) keys.add(selected);
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatMonthLabel(value) }));
}
