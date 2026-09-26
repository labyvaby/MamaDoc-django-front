/**
 * useAbsenceConflicts — сколько пациентов остались с приёмом в дни отсутствия.
 *
 * Отметка отсутствия ничего не делает с уже записанными приёмами (так решено
 * в тикете: судьбу приёма выбирает человек). Поэтому расписание должно само
 * показывать, где дыра: день с выходным, на который записаны пациенты.
 *
 * Считаем через `exceptions/conflicts/` — один запрос на сотрудника за весь
 * видимый период, а не по дню: отпуск на две недели иначе дал бы 14 запросов.
 * Ручка отдаёт приёмы по всем филиалам, доступным пользователю, и не знает про
 * исключения; к отсутствию приём относим здесь — по дате, интервалу и филиалу.
 *
 * Филиал — как в движке доступности бэка (`_in_branch_scope`): исключение с
 * филиалом закрывает только его, без филиала — все. Выходной в «Плюсе» у врача,
 * который в этот день ведёт смену в «Мама Доктор», не делает его приёмы там
 * записями без разбора: врач на месте, пациентов предупреждать не о чем.
 *
 * В счётчики попадают только приёмы БЕЗ отметки разбора (`absenceReviewedAt`):
 * маркер обязан гаснуть и тогда, когда приём осознанно оставили как есть, —
 * иначе «оставить как есть» пришлось бы имитировать отменой.
 */
import React from "react";
import { useQueries } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  getScheduleConflicts,
  type ScheduleConflictAppointment,
  type ScheduleException,
} from "../../../api/scheduling";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";

// Предикат отсутствия живёт в occurrences.ts (там же разбор частичных
// интервалов); реэкспорт — чтобы не менять импорты страницы.
import { isAbsenceKind } from "./occurrences";

export { isAbsenceKind };

export interface AbsenceDayEntry {
  employeeId: number;
  count: number;
}

/** Интервал отсутствия; оба поля времени пустые — отсутствие на весь день. */
export interface AbsenceInterval {
  startTime: string | null;
  endTime: string | null;
  /** Филиал исключения; пусто (`null`/не задан) — любой филиал организации. */
  branchId?: number | null;
}

/**
 * Мешает ли отсутствие этому приёму.
 *
 * Сначала филиал: отсутствие с филиалом задевает только приёмы этого филиала
 * (приём без филиала отнести к другому нельзя — считаем задетым). Дальше время:
 * целодневное забирает весь день; частичное (гайд бэка §1) — только приёмы,
 * пересекающие интервал: если врач уходит с 14:00, утренние записи разбирать
 * не нужно. Времена сравниваем как "HH:MM" (лексикографически = хронологически),
 * приём без длительности считаем точкой.
 */
export function appointmentHitsAbsence(
  appt: ScheduleConflictAppointment,
  interval: AbsenceInterval,
): boolean {
  const { startTime, endTime, branchId } = interval;
  if (branchId != null && appt.branchId != null && appt.branchId !== branchId) return false;
  if (!startTime || !endTime || startTime >= endTime) return true;
  const start = dayjs(appt.startsAt);
  if (!start.isValid()) return true;
  const end = dayjs(appt.endsAt);
  const from = start.format("HH:mm");
  const to = end.isValid() && end.isAfter(start) ? end.format("HH:mm") : from;
  return to === from ? from >= startTime && from < endTime : from < endTime && to > startTime;
}

/** Приём ещё не разобран — только такие попадают в счётчики и маркеры. */
export function isUnreviewed(appt: ScheduleConflictAppointment): boolean {
  return appt.absenceReviewedAt == null;
}

/**
 * Дни отсутствия с их интервалами: `employeeId:date` → интервалы (пустые
 * времена = весь день) с филиалом исключения.
 *
 * Нужны, потому что запрос конфликтов идёт одним диапазоном на сотрудника:
 * между двумя выходными попадают рабочие дни, и без этой карты календарь
 * пометил бы их «записи без разбора».
 */
export function buildAbsenceDays(exceptions: ScheduleException[]): Map<string, AbsenceInterval[]> {
  const map = new Map<string, AbsenceInterval[]>();
  for (const exc of exceptions) {
    if (!isAbsenceKind(exc.kind)) continue;
    const key = `${exc.employeeId}:${exc.date}`;
    const list = map.get(key) ?? [];
    list.push({ startTime: exc.startTime, endTime: exc.endTime, branchId: exc.branchId });
    map.set(key, list);
  }
  return map;
}

/**
 * Приёмы, которые задевает отсутствие: `employeeId:date` → приёмы этого дня,
 * попавшие хотя бы в один его интервал (см. `appointmentHitsAbsence`).
 *
 * `appointmentsByEmployee` — ответ `exceptions/conflicts/` по каждому
 * сотруднику: все его открытые приёмы за период, по всем филиалам.
 */
export function collectAbsenceConflicts(
  absenceDays: Map<string, AbsenceInterval[]>,
  appointmentsByEmployee: Iterable<readonly [number, ScheduleConflictAppointment[]]>,
): Map<string, ScheduleConflictAppointment[]> {
  const map = new Map<string, ScheduleConflictAppointment[]>();
  for (const [employeeId, appointments] of appointmentsByEmployee) {
    for (const appt of appointments) {
      const date = dayjs(appt.startsAt).format("YYYY-MM-DD");
      const key = `${employeeId}:${date}`;
      const intervals = absenceDays.get(key);
      if (!intervals) continue;
      if (!intervals.some((interval) => appointmentHitsAbsence(appt, interval))) continue;
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
  }
  return map;
}

export interface AbsenceConflictsResult {
  /** Приёмы конкретного сотрудника в конкретный день (включая разобранные). */
  forDay: (employeeId: number, date: string) => ScheduleConflictAppointment[];
  /** Сколько неразобранных приёмов у сотрудника за дни его пачки/дня. */
  countForDays: (employeeId: number, dates: string[]) => number;
  /** Сколько неразобранных записей в этот день — для маркера на календаре. */
  dayTotals: Map<string, number>;
  /** Кто именно и сколько записей — для тултипа и дровера дня. */
  dayEmployees: Map<string, AbsenceDayEntry[]>;
  isLoading: boolean;
}

const EMPTY: ScheduleConflictAppointment[] = [];

export function useAbsenceConflicts(
  exceptions: ScheduleException[],
  orgId: number | null | undefined,
  enabled: boolean,
): AbsenceConflictsResult {
  // Один интервал на сотрудника: от первого до последнего дня его отсутствия
  // в загруженном периоде.
  const ranges = React.useMemo(() => {
    const byEmployee = new Map<number, { dateFrom: string; dateTo: string }>();
    for (const exc of exceptions) {
      if (!isAbsenceKind(exc.kind)) continue;
      const current = byEmployee.get(exc.employeeId);
      if (!current) {
        byEmployee.set(exc.employeeId, { dateFrom: exc.date, dateTo: exc.date });
      } else {
        if (exc.date < current.dateFrom) current.dateFrom = exc.date;
        if (exc.date > current.dateTo) current.dateTo = exc.date;
      }
    }
    return Array.from(byEmployee.entries()).map(([employeeId, range]) => ({
      employeeId,
      ...range,
    }));
  }, [exceptions]);

  const queries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: djangoQueryKeys.scheduling.conflicts({
        employeeId: range.employeeId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        orgId: orgId ?? null,
      }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getScheduleConflicts(
          {
            employeeId: range.employeeId,
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
            organizationId: orgId,
          },
          signal,
        ),
      enabled,
      // 30 с, как у списков: страница расписания без realtime-подписки, а
      // приёмы могут отменить с другой страницы — маркеры не должны врать
      // дольше. Шторма это не даёт: правка исключения conflicts не сбрасывает
      // (scheduleInvalidation.ts), по staleTime рефетч идёт только при
      // возврате на страницу.
      staleTime: DJANGO_LIST_STALE_TIME_MS,
      // Права на приёмы могут быть не выданы — тогда маркеров просто не будет,
      // а расписание должно работать как раньше.
      retry: false,
    })),
  });

  const absenceDays = React.useMemo(() => buildAbsenceDays(exceptions), [exceptions]);

  const stamp = queries.map((q) => q.dataUpdatedAt).join(",");
  const byEmployeeDay = React.useMemo(
    () =>
      collectAbsenceConflicts(
        absenceDays,
        ranges.map((range, index) => [range.employeeId, queries[index]?.data ?? []] as const),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queries пересоздаётся каждый рендер; штамп dataUpdatedAt отражает реальные изменения
    [stamp, ranges, absenceDays],
  );

  const { dayTotals, dayEmployees } = React.useMemo(() => {
    const totals = new Map<string, number>();
    const employees = new Map<string, AbsenceDayEntry[]>();
    for (const [key, list] of byEmployeeDay) {
      const [rawEmployeeId, date] = key.split(":");
      const count = list.filter(isUnreviewed).length;
      if (count === 0) continue;
      totals.set(date, (totals.get(date) ?? 0) + count);
      const entries = employees.get(date) ?? [];
      entries.push({ employeeId: Number(rawEmployeeId), count });
      employees.set(date, entries);
    }
    return { dayTotals: totals, dayEmployees: employees };
  }, [byEmployeeDay]);

  return React.useMemo(
    () => ({
      forDay: (employeeId, date) => byEmployeeDay.get(`${employeeId}:${date}`) ?? EMPTY,
      countForDays: (employeeId, dates) =>
        dates.reduce(
          (sum, date) =>
            sum +
            (byEmployeeDay.get(`${employeeId}:${date}`)?.filter(isUnreviewed).length ?? 0),
          0,
        ),
      dayTotals,
      dayEmployees,
      isLoading: queries.some((q) => q.isLoading),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. stamp выше
    [byEmployeeDay, dayTotals, dayEmployees, stamp],
  );
}

export default useAbsenceConflicts;
