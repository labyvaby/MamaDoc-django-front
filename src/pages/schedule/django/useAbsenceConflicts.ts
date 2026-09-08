/**
 * useAbsenceConflicts — сколько пациентов остались с приёмом в дни отсутствия.
 *
 * Отметка отсутствия ничего не делает с уже записанными приёмами (так решено
 * в тикете: судьбу приёма выбирает человек). Поэтому расписание должно само
 * показывать, где дыра: день с выходным, на который записаны пациенты.
 *
 * Считаем через `exceptions/conflicts/` — один запрос на сотрудника за весь
 * видимый период, а не по дню: отпуск на две недели иначе дал бы 14 запросов.
 * Ручка отдаёт приёмы по всем филиалам, доступным пользователю — это важно:
 * исключение ставится на один филиал, а записи бывают в обоих.
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

/** Отсутствие = выходной или отпуск; `extra`/`override` — рабочие смены. */
export function isAbsenceKind(kind: ScheduleException["kind"]): boolean {
  return kind === "day_off" || kind === "vacation";
}

export interface AbsenceDayEntry {
  employeeId: number;
  count: number;
}

export interface AbsenceConflictsResult {
  /** Приёмы конкретного сотрудника в конкретный день (YYYY-MM-DD). */
  forDay: (employeeId: number, date: string) => ScheduleConflictAppointment[];
  /** Сколько приёмов у сотрудника за весь период отсутствия его пачки/дня. */
  countForDays: (employeeId: number, dates: string[]) => number;
  /** Сколько записей всего в этот день — для маркера на календаре. */
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
      staleTime: DJANGO_LIST_STALE_TIME_MS,
      // Права на приёмы могут быть не выданы — тогда маркеров просто не будет,
      // а расписание должно работать как раньше.
      retry: false,
    })),
  });

  const stamp = queries.map((q) => q.dataUpdatedAt).join(",");
  const byEmployeeDay = React.useMemo(() => {
    const map = new Map<string, ScheduleConflictAppointment[]>();
    ranges.forEach((range, index) => {
      for (const appt of queries[index]?.data ?? []) {
        const date = dayjs(appt.startsAt).format("YYYY-MM-DD");
        const key = `${range.employeeId}:${date}`;
        const list = map.get(key) ?? [];
        list.push(appt);
        map.set(key, list);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queries пересоздаётся каждый рендер; штамп dataUpdatedAt отражает реальные изменения
  }, [stamp, ranges]);

  const { dayTotals, dayEmployees } = React.useMemo(() => {
    const totals = new Map<string, number>();
    const employees = new Map<string, AbsenceDayEntry[]>();
    for (const [key, list] of byEmployeeDay) {
      const [rawEmployeeId, date] = key.split(":");
      totals.set(date, (totals.get(date) ?? 0) + list.length);
      const entries = employees.get(date) ?? [];
      entries.push({ employeeId: Number(rawEmployeeId), count: list.length });
      employees.set(date, entries);
    }
    return { dayTotals: totals, dayEmployees: employees };
  }, [byEmployeeDay]);

  return React.useMemo(
    () => ({
      forDay: (employeeId, date) => byEmployeeDay.get(`${employeeId}:${date}`) ?? EMPTY,
      countForDays: (employeeId, dates) =>
        dates.reduce(
          (sum, date) => sum + (byEmployeeDay.get(`${employeeId}:${date}`)?.length ?? 0),
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
