/**
 * Отсутствие как строка сетки «День»/«Неделя».
 *
 * Отметка выходного ничего не отменяет (решение заказчика 10.09.2026): судьбу
 * каждой записи выбирает человек в `AbsenceConflictsDrawer`. Значит расписание
 * обязано показывать, где остались записанные пациенты — иначе выходной просто
 * убирает врача из сетки вместе с его приёмами: строка-ресурс рисуется только
 * для тех, у кого в периоде есть смены (`useResourceGroups`), а отсутствие смен
 * не порождает.
 */
import type { ScheduleException, ScheduleExceptionKind } from "../../../api/scheduling";

/** Виды отсутствия, которые показываем в сетке отдельной плиткой. */
export const ABSENCE_LABELS: Partial<Record<ScheduleExceptionKind, string>> = {
  vacation: "Отпуск",
  day_off: "Выходной",
};

const FALLBACK_LABEL = "Отсутствие";

export interface AbsenceCell {
  employeeId: number;
  /** Имя из исключения — сотрудника может не быть в справочнике филиала. */
  employeeName: string;
  /** «Выходной» / «Отпуск». */
  label: string;
  /** Записанные пациенты, оставшиеся без разбора. */
  count: number;
}

export interface AbsenceIndex {
  /** `${date}_${employeeId}` → отсутствие с неразобранными записями. */
  cells: Map<string, AbsenceCell>;
  /** Кому нужна строка в сетке, даже если смен в периоде нет. */
  employeeIds: Set<number>;
  /** Имена для сотрудников вне справочника — для synthesizeEmployee. */
  names: Map<number, string>;
}

const EMPTY_INDEX: AbsenceIndex = {
  cells: new Map(),
  employeeIds: new Set(),
  names: new Map(),
};

/**
 * Собирает отсутствия с записями по датам сетки.
 *
 * `countsByDate` — то же, что кормит красный маркер месячного вида
 * (`useAbsenceConflicts.dayEmployees`): дата → сколько записей у каждого
 * отсутствующего. Строку показываем только там, где есть что разбирать:
 * плитка «Выходной» без записей рисуется и так, а лишние пустые строки в день
 * с десятком выходных — шум.
 */
export function buildAbsenceIndex(
  exceptions: ScheduleException[] | undefined,
  countsByDate: Map<string, { employeeId: number; count: number }[]> | undefined,
  dates: string[],
): AbsenceIndex {
  if (!countsByDate || countsByDate.size === 0) return EMPTY_INDEX;

  const byKey = new Map<string, ScheduleException>();
  for (const exc of exceptions ?? []) {
    if (!ABSENCE_LABELS[exc.kind]) continue;
    byKey.set(`${exc.date}_${exc.employeeId}`, exc);
  }

  const cells = new Map<string, AbsenceCell>();
  const employeeIds = new Set<number>();
  const names = new Map<number, string>();

  for (const date of dates) {
    for (const entry of countsByDate.get(date) ?? []) {
      if (entry.count <= 0) continue;
      const key = `${date}_${entry.employeeId}`;
      // Исключения грузятся своим периодом, а конфликты — своим: если строки
      // исключения под рукой нет, отсутствие всё равно показываем, просто
      // без уточнения «выходной или отпуск».
      const exc = byKey.get(key);
      cells.set(key, {
        employeeId: entry.employeeId,
        employeeName: exc?.employeeName ?? "",
        label: (exc && ABSENCE_LABELS[exc.kind]) || FALLBACK_LABEL,
        count: entry.count,
      });
      employeeIds.add(entry.employeeId);
      if (exc?.employeeName) names.set(entry.employeeId, exc.employeeName);
    }
  }

  return { cells, employeeIds, names };
}

/** «3 записи» — подпись маркера. */
export function absenceCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} запись`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} записи`;
  return `${count} записей`;
}
