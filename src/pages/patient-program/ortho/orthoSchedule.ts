import dayjs, { type Dayjs } from "dayjs";

import { ageMonths } from "./orthoNorms";

/**
 * Сроки осмотров ортопеда по приказу МЗ РФ 211н (ТЗ §3.6). В КР обязательной
 * сетки нет — клиника берёт эту как рекомендуемую. Окна — в месяцах возраста.
 */
export interface ScheduleItem {
  key: string;
  label: string;
  note: string;
  from: number;
  to: number;
}

export const ORTHO_SCHEDULE: ReadonlyArray<ScheduleItem> = [
  { key: "1m", label: "1 мес", note: "УЗИ суставов, кривошея, стопы", from: 0, to: 2 },
  { key: "3m", label: "3 мес", note: "созревание суставов, кривошея", from: 2.5, to: 4.5 },
  { key: "12m", label: "12 мес", note: "начало ходьбы, оси ног, стопы", from: 11, to: 15 },
  { key: "6y", label: "6 лет", note: "осанка, тест Адамса, стопы, оси ног", from: 66, to: 78 },
  { key: "12y", label: "12 лет", note: "сколиоз, кифоз, стопы", from: 138, to: 150 },
  { key: "15y", label: "15 лет", note: "сколиоз, кифоз, колени и бёдра", from: 174, to: 186 },
  { key: "17y", label: "17 лет", note: "итог перед взрослой сетью", from: 198, to: 210 },
];

/** `nodata` — срок прошёл до первого осмотра в книжке: ребёнка могли смотреть в другом месте. */
export type ScheduleState = "done" | "missed" | "due" | "upcoming" | "nodata";

export interface ScheduleRow extends ScheduleItem {
  state: ScheduleState;
  /** Дата осмотра, которым срок закрыт. */
  doneAt: string | null;
}

/** Состояние каждого срока по датам проведённых осмотров. */
export function scheduleRows(
  examDates: ReadonlyArray<string>,
  birthDate: string | null,
  today: Dayjs = dayjs(),
): ScheduleRow[] {
  const nowMonths = ageMonths(birthDate, today);
  const firstMonths = examDates
    .map((at) => ageMonths(birthDate, at))
    .filter((months): months is number => months != null)
    .reduce<number | null>((min, months) => (min == null || months < min ? months : min), null);
  return ORTHO_SCHEDULE.map((item) => {
    const done = examDates.find((at) => {
      const months = ageMonths(birthDate, at);
      return months != null && months >= item.from && months <= item.to;
    });
    let state: ScheduleState = "upcoming";
    if (done) state = "done";
    else if (nowMonths != null && nowMonths > item.to) state = firstMonths == null || item.to < firstMonths ? "nodata" : "missed";
    else if (nowMonths != null && nowMonths >= item.from) state = "due";
    return { ...item, state, doneAt: done ?? null };
  });
}
