import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { ScheduleException, ScheduleRule } from "../../../api/scheduling";

dayjs.extend(isoWeek);

export interface DayOccurrence {
  employeeId: number;
  employeeName: string;
  startTime: string; // HH:mm
  endTime: string;
  kind: "rule" | "extra" | "override";
  /** ruleId для правила, exceptionId для точечного исключения. */
  sourceId: number;
  /**
   * Обеденный перерыв внутри смены, уже обрезанный по её границам.
   * У точечных смен (extra/override) всегда null: полей обеда в контракте
   * `ScheduleException` нет.
   */
  lunch: { start: string; end: string } | null;
}

/**
 * Пересечение обеда со сменой, обрезанное по её границам.
 *
 * Смену на два куска не режем: разрыв в полосе читается как две разные смены
 * («ушёл и вернулся»), а обед — перерыв внутри одной. Календарь рисует его
 * вырезом поверх цельной полосы.
 * Времена в формате "HH:MM" сравниваются лексикографически (= хронологически).
 */
function lunchWithin(
  start: string,
  end: string,
  lunchStart: string | null,
  lunchEnd: string | null,
): { start: string; end: string } | null {
  if (!lunchStart || !lunchEnd || lunchStart >= lunchEnd) return null;
  const from = lunchStart > start ? lunchStart : start;
  const to = lunchEnd < end ? lunchEnd : end;
  return from < to ? { start: from, end: to } : null;
}

/** Подпись перерыва для тултипов и списков: «обед 13:00–14:00» либо "". */
export function lunchNote(occ: DayOccurrence): string {
  return occ.lunch ? `обед ${occ.lunch.start}–${occ.lunch.end}` : "";
}

/**
 * Рабочие отрезки смены: обед делит её на «до» и «после».
 *
 * Полосу календаря обед по-прежнему не режет (см. lunchWithin), но в тексте
 * человеку нужно именно рабочее время — «09:00–13:00, 14:00–17:00», а не
 * «09:00–17:00» с перерывом отдельной строкой. Обед, примыкающий к краю смены,
 * оставляет один отрезок; съевший смену целиком — отдаём смену как есть, чтобы
 * подпись не оказалась пустой.
 */
export function workingSpans(occ: DayOccurrence): { start: string; end: string }[] {
  const whole = { start: occ.startTime, end: occ.endTime };
  if (!occ.lunch) return [whole];
  const spans: { start: string; end: string }[] = [];
  if (occ.startTime < occ.lunch.start) spans.push({ start: occ.startTime, end: occ.lunch.start });
  if (occ.lunch.end < occ.endTime) spans.push({ start: occ.lunch.end, end: occ.endTime });
  return spans.length > 0 ? spans : [whole];
}

/**
 * Подпись рабочего времени смены: «09:00–13:00, 14:00–17:00».
 * `formatTime` — форматтер конкретного экрана (в календаре часы без ведущего
 * нуля), по умолчанию время выводится как есть.
 */
export function shiftTimeLabel(
  occ: DayOccurrence,
  formatTime: (time: string) => string = (time) => time,
): string {
  return workingSpans(occ)
    .map((span) => `${formatTime(span.start)}–${formatTime(span.end)}`)
    .join(", ");
}

/** "HH:MM" → минуты от полуночи. Некорректное время считаем полуночью. */
const minutesOf = (t: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
};

/** Длительность смены в минутах; смена «через полночь» считается до конца суток. */
export function shiftMinutes(occ: DayOccurrence): number {
  const start = minutesOf(occ.startTime);
  const end = minutesOf(occ.endTime);
  return (end <= start ? 24 * 60 : end) - start;
}

/** Минуты обеда внутри смены (0, если перерыва нет). */
export function lunchMinutes(occ: DayOccurrence): number {
  if (!occ.lunch) return 0;
  return Math.max(minutesOf(occ.lunch.end) - minutesOf(occ.lunch.start), 0);
}

/** Рабочее время смены без обеда, минуты. */
export function netShiftMinutes(occ: DayOccurrence): number {
  return Math.max(shiftMinutes(occ) - lunchMinutes(occ), 0);
}

/** Человеческая длительность: «8 ч», «7 ч 30 мин», «45 мин». */
export function formatDuration(minutes: number): string {
  const total = Math.max(Math.round(minutes), 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/**
 * Полная подпись смены для тултипа: рабочие часы, длительность и обед.
 * Длительность — всегда чистая: «09:00–13:00, 14:00–17:00 · 8 ч» противоречило
 * бы само себе.
 */
export function occurrenceNote(occ: DayOccurrence): string {
  const parts = [shiftTimeLabel(occ), formatDuration(netShiftMinutes(occ))];
  if (occ.lunch) parts.push(lunchNote(occ));
  if (occ.kind !== "rule") parts.push("точечная смена");
  return parts.join(" · ");
}

/**
 * Вычисляет фактические смены на конкретный день из недельных правил
 * с учётом исключений (day_off/vacation отменяют смену по правилу,
 * extra добавляет отдельную смену, override заменяет правило на дату). Правил и исключений на бэке нет
 * как готового "расписания на день" — материализуем на фронте.
 * Обеденный перерыв остаётся полем смены (`lunch`), а не разрывает её.
 */
export function computeDayOccurrences(
  day: Dayjs,
  rules: ScheduleRule[],
  exceptions: ScheduleException[],
): DayOccurrence[] {
  const dateStr = day.format("YYYY-MM-DD");
  const weekday = day.isoWeekday() - 1; // 0=Пн…6=Вс — как ScheduleRule.weekdays

  const exceptionsToday = exceptions.filter((e) => e.date === dateStr);
  const cancelledEmployeeIds = new Set(
    exceptionsToday
      .filter((e) => e.kind === "day_off" || e.kind === "vacation" || e.kind === "override")
      .map((e) => e.employeeId),
  );

  const occurrences: DayOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (cancelledEmployeeIds.has(rule.employeeId)) continue;
    if (day.isBefore(rule.dateFrom, "day") || day.isAfter(rule.dateTo, "day")) continue;
    if (!rule.weekdays.includes(weekday)) continue;

    occurrences.push({
      employeeId: rule.employeeId,
      employeeName: rule.employeeName,
      startTime: rule.startTime,
      endTime: rule.endTime,
      kind: "rule",
      sourceId: rule.id,
      lunch: lunchWithin(rule.startTime, rule.endTime, rule.lunchStart, rule.lunchEnd),
    });
  }

  for (const exc of exceptionsToday) {
    if (exc.kind !== "extra" && exc.kind !== "override") continue;
    occurrences.push({
      employeeId: exc.employeeId,
      employeeName: exc.employeeName,
      startTime: exc.startTime ?? "00:00",
      endTime: exc.endTime ?? "23:59",
      kind: exc.kind,
      sourceId: exc.id,
      lunch: null,
    });
  }

  return occurrences;
}
