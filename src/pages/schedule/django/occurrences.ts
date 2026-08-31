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
