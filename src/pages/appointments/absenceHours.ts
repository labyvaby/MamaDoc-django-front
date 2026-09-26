/**
 * Отсутствие врача для вкладки «Окна».
 *
 * `availability` знает только флаг `dayOff` на весь день: частичное отсутствие
 * (выходной с 14:00, см. PARTIAL_ABSENCE_ENABLED) бэк отражает тем, что просто
 * не отдаёт слоты этого интервала. В «Окнах» это выглядело как «всё занято» —
 * регистратор не мог отличить занятое время от времени, когда врача не будет.
 * Поэтому часы отсутствия берём из `/scheduling/exceptions/` и показываем сами.
 */
import type { ScheduleException, ScheduleExceptionKind } from "../../api/scheduling";

/** Интервал отсутствия внутри дня, "HH:MM". */
export interface AbsenceRange {
  start: string;
  end: string;
}

export interface DayAbsence {
  /** Отпуск важнее выходного: при совпадении в подписи побеждает он. */
  kind: Extract<ScheduleExceptionKind, "day_off" | "vacation">;
  /** Отсутствие на весь день — интервалов нет. */
  fullDay: boolean;
  ranges: AbsenceRange[];
}

/** Ключ — `${employeeId}_${date}`. */
export type AbsenceByDay = Map<number | string, DayAbsence>;

const isAbsence = (kind: ScheduleExceptionKind): kind is DayAbsence["kind"] =>
  kind === "day_off" || kind === "vacation";

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** Слипшиеся и пересекающиеся интервалы — один: «10–12 и 12–14» читается как «10–14». */
function mergeRanges(ranges: AbsenceRange[]): AbsenceRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const result: AbsenceRange[] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && toMinutes(range.start) <= toMinutes(last.end)) {
      if (toMinutes(range.end) > toMinutes(last.end)) last.end = range.end;
    } else {
      result.push({ ...range });
    }
  }
  return result;
}

export function absenceKey(employeeId: number, date: string): string {
  return `${employeeId}_${date}`;
}

/**
 * Отсутствия по дням: несколько строк исключений на один день сливаются в одну
 * запись. Целодневное перебивает часы — если врача нет весь день, интервалы
 * второго исключения ничего не добавляют.
 */
export function buildDayAbsences(exceptions: ScheduleException[] | undefined): AbsenceByDay {
  const map: AbsenceByDay = new Map();
  for (const exc of exceptions ?? []) {
    if (!isAbsence(exc.kind)) continue;
    const key = absenceKey(exc.employeeId, exc.date);
    const current = map.get(key);
    const hasHours = Boolean(exc.startTime && exc.endTime && exc.startTime < exc.endTime);
    if (!current) {
      map.set(key, {
        kind: exc.kind,
        fullDay: !hasHours,
        ranges: hasHours ? [{ start: exc.startTime!, end: exc.endTime! }] : [],
      });
      continue;
    }
    if (exc.kind === "vacation") current.kind = "vacation";
    if (!hasHours) {
      current.fullDay = true;
      current.ranges = [];
    } else if (!current.fullDay) {
      current.ranges = mergeRanges([...current.ranges, { start: exc.startTime!, end: exc.endTime! }]);
    }
  }
  return map;
}

export function absenceForDay(
  map: AbsenceByDay | undefined,
  employeeId: number,
  date: string,
): DayAbsence | undefined {
  return map?.get(absenceKey(employeeId, date));
}

/** «14:00–18:00» или «10:00–12:00, 14:00–18:00» — тире длинное, как в остальных диапазонах. */
export function formatAbsenceRanges(ranges: AbsenceRange[]): string {
  return ranges.map((r) => `${r.start}–${r.end}`).join(", ");
}

/** Попадает ли время приёма/окна в часы отсутствия. */
export function hitsAbsence(absence: DayAbsence, start: string, end?: string): boolean {
  if (absence.fullDay) return true;
  const from = toMinutes(start);
  const to = end ? toMinutes(end) : from;
  return absence.ranges.some((r) => {
    const rs = toMinutes(r.start);
    const re = toMinutes(r.end);
    return to === from ? from >= rs && from < re : from < re && to > rs;
  });
}
