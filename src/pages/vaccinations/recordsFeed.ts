import dayjs from "dayjs";

import type { VaccinationRecord } from "../../api/vaccinations";

/** Сколько записей ленты грузить за раз (бэк отдаёт не больше 200). */
export const RECORDS_PAGE_SIZE = 50;

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export interface RecordsDay {
  /** YYYY-MM-DD */
  day: string;
  /** «Сегодня», «Вчера», «14 сентября 2026». */
  title: string;
  /** «4 прививки». */
  countText: string;
  items: VaccinationRecord[];
}

/** Заголовок дня ленты. */
export function dayTitle(day: string, today = dayjs()): string {
  const d = dayjs(day);
  if (d.isSame(today, "day")) return "Сегодня";
  if (d.isSame(today.subtract(1, "day"), "day")) return "Вчера";
  const year = d.year() === today.year() ? "" : ` ${d.year()}`;
  return `${d.date()} ${MONTHS_GEN[d.month()]}${year}`;
}

/**
 * Лента записей → дни (порядок — как пришло с бэка: новые сверху). Записи
 * одного дня из разных порций догрузки склеиваются в одну группу.
 */
export function groupRecordsByDay(records: VaccinationRecord[], today = dayjs()): RecordsDay[] {
  const days: RecordsDay[] = [];
  for (const r of records) {
    const day = dayjs(r.administeredAt).format("YYYY-MM-DD");
    let group = days[days.length - 1];
    if (!group || group.day !== day) {
      group = { day, title: dayTitle(day, today), countText: "", items: [] };
      days.push(group);
    }
    group.items.push(r);
  }
  for (const g of days) {
    const n = g.items.length;
    g.countText = `${n} ${plural(n, "прививка", "прививки", "прививок")}`;
  }
  return days;
}

/** Возраст пациента на день прививки: «2 мес.», «1 год 3 мес.», «11 лет». */
export function ageAt(birthDate: string | null | undefined, on: string): string | null {
  if (!birthDate) return null;
  const months = dayjs(on).diff(dayjs(birthDate), "month");
  if (months < 0) return null;
  if (months === 0) {
    const days = dayjs(on).diff(dayjs(birthDate), "day");
    return `${days} дн.`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yText = y ? `${y} ${plural(y, "год", "года", "лет")}` : "";
  const mText = m ? `${m} мес.` : "";
  return [yText, mText].filter(Boolean).join(" ");
}
