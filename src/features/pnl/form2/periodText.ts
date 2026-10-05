/**
 * Период формы №2 по-кыргызски и по-русски. Формы «январынан»/«декабрына»
 * взяты из шаблона заказчика, остальные выведены по тому же правилу —
 * сверить с бухгалтером (спека §13).
 */
import type { Dayjs } from "dayjs";

const KY_FROM = [
  "январынан", "февралынан", "мартынан", "апрелинен", "майынан", "июнунан",
  "июлунан", "августунан", "сентябрынан", "октябрынан", "ноябрынан", "декабрынан",
];
const KY_TO = [
  "январына", "февралына", "мартына", "апрелине", "майына", "июнуна",
  "июлуна", "августуна", "сентябрына", "октябрына", "ноябрына", "декабрына",
];
const RU_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function kyrgyzPeriod(from: Dayjs, to: Dayjs): string {
  const toYear = to.year() === from.year() ? "" : `${to.year()}-жылдын `;
  return `${from.year()}-жылдын ${from.date()}-${KY_FROM[from.month()]} ${toYear}${to.date()}-${KY_TO[to.month()]} чейин`;
}

export function russianPeriod(from: Dayjs, to: Dayjs): string {
  return `за период с ${from.date()} ${RU_GENITIVE[from.month()]} ${from.year()} г. по ${to.date()} ${RU_GENITIVE[to.month()]} ${to.year()} г.`;
}

export function isFullYear(from: Dayjs, to: Dayjs): boolean {
  return from.year() === to.year() && from.month() === 0 && from.date() === 1 && to.month() === 11 && to.date() === 31;
}
