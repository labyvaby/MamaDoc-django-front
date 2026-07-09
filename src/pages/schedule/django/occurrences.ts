import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { ScheduleException, ScheduleRule } from "../../../api/scheduling";

dayjs.extend(isoWeek);

export interface DayOccurrence {
  employeeId: number;
  employeeName: string;
  startTime: string; // HH:mm
  endTime: string;
  kind: "rule" | "extra";
  /** ruleId для kind="rule", exceptionId для kind="extra" — чтобы открыть источник. */
  sourceId: number;
}

/**
 * Обед делит смену на две части: если [lunchStart, lunchEnd] лежит строго
 * внутри [start, end], возвращаем два сегмента, иначе одну смену целиком.
 * Времена в формате "HH:MM" сравниваются лексикографически (= хронологически).
 */
function splitByLunch(
  start: string,
  end: string,
  lunchStart: string | null,
  lunchEnd: string | null,
): { start: string; end: string }[] {
  if (lunchStart && lunchEnd && lunchStart > start && lunchEnd < end && lunchStart < lunchEnd) {
    return [
      { start, end: lunchStart },
      { start: lunchEnd, end },
    ];
  }
  return [{ start, end }];
}

/**
 * Вычисляет фактические смены на конкретный день из недельных правил
 * с учётом исключений (day_off/vacation отменяют смену по правилу,
 * extra добавляет отдельную смену). Правил и исключений на бэке нет
 * как готового "расписания на день" — материализуем на фронте.
 * Обеденный перерыв разрезает смену на два сегмента.
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
    exceptionsToday.filter((e) => e.kind === "day_off" || e.kind === "vacation").map((e) => e.employeeId),
  );

  const occurrences: DayOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (cancelledEmployeeIds.has(rule.employeeId)) continue;
    if (day.isBefore(rule.dateFrom, "day") || day.isAfter(rule.dateTo, "day")) continue;
    if (!rule.weekdays.includes(weekday)) continue;

    for (const seg of splitByLunch(rule.startTime, rule.endTime, rule.lunchStart, rule.lunchEnd)) {
      occurrences.push({
        employeeId: rule.employeeId,
        employeeName: rule.employeeName,
        startTime: seg.start,
        endTime: seg.end,
        kind: "rule",
        sourceId: rule.id,
      });
    }
  }

  for (const exc of exceptionsToday) {
    if (exc.kind !== "extra") continue;
    occurrences.push({
      employeeId: exc.employeeId,
      employeeName: exc.employeeName,
      startTime: exc.startTime ?? "00:00",
      endTime: exc.endTime ?? "23:59",
      kind: "extra",
      sourceId: exc.id,
    });
  }

  return occurrences;
}
