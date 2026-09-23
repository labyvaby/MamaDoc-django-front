import dayjs from "dayjs";

import { getDayCounts } from "../../api/appointments";
import { getBookings } from "../../api/bookings";
import { getCashboxSummary } from "../../api/cashbox";
import { getDealsSummary } from "../../api/deals";
import { getMonthlyReport } from "../../api/reports";
import { getReviewStats } from "../../api/reviews";
import { getAvailabilitySummary } from "../../api/scheduling";
import { getTasksSummary } from "../../api/tasks";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import type { ActiveScope } from "../../hooks/useActiveScope";
import type { PeriodRange } from "./period";

/**
 * Описания запросов сводки — в одном месте.
 *
 * Одни и те же данные нужны нескольким блокам: «Пульс» берёт кассу и записи,
 * «Требует внимания» — брони, задачи, отзывы и кассу. Если бы каждый блок
 * собирал ключ сам, одна опечатка в ключе превращалась бы в дубль запроса.
 * Здесь ключ и функция загрузки собраны один раз — react-query отдаёт кэш.
 *
 * `enabled` передаёт вызывающий: права у каждого блока свои.
 */

type Signal = { signal?: AbortSignal };

export const cashboxSummaryQuery = (scope: ActiveScope, r: PeriodRange, enabled = true) => ({
  queryKey: djangoQueryKeys.cashbox.summary({
    view: "dashboard",
    organizationId: scope.organizationId ?? null,
    branchId: scope.branchId ?? null,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
  }),
  queryFn: ({ signal }: Signal) =>
    getCashboxSummary(
      {
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
      },
      signal,
    ),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});

export const dayCountsQuery = (scope: ActiveScope, r: PeriodRange, enabled = true) => ({
  queryKey: djangoQueryKeys.appointments.list({
    view: "dashboardDayCounts",
    organizationId: scope.organizationId ?? null,
    branchId: scope.branchId ?? null,
    dateFrom: r.dateFrom,
    dateTo: r.dateTo,
  }),
  queryFn: ({ signal }: Signal) =>
    getDayCounts({ dateFrom: r.dateFrom, dateTo: r.dateTo, branchId: scope.branchId }, signal),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});

export const monthlyReportQuery = (scope: ActiveScope, month: string, enabled = true) => ({
  queryKey: djangoQueryKeys.reports.monthly({
    view: "dashboard",
    organizationId: scope.organizationId ?? null,
    branchId: scope.branchId ?? null,
    month,
  }),
  queryFn: ({ signal }: Signal) =>
    getMonthlyReport(
      { month, branchId: scope.branchId, organizationId: scope.organizationId },
      signal,
    ),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});

/** Загрузка специалистов на сегодня — вопрос всегда про «сейчас», периода нет. */
export const availabilityTodayQuery = (scope: ActiveScope, enabled = true) => {
  const today = dayjs().format("YYYY-MM-DD");
  return {
    queryKey: djangoQueryKeys.scheduling.availabilitySummary({
      view: "dashboard",
      organizationId: scope.organizationId ?? null,
      branchId: scope.branchId ?? null,
      date: today,
    }),
    queryFn: ({ signal }: Signal) =>
      getAvailabilitySummary(
        { date: today, branchId: scope.branchId, organizationId: scope.organizationId },
        signal,
      ),
    enabled: scope.orgReady && enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  };
};

/**
 * Неподтверждённые брони: все ждущие и просроченные (дата визита прошла).
 *
 * ⚠ Окно ровно то же, что у бейджа «Брони» в сайдбаре (месяц назад — 90 дней
 * вперёд): со «сегодня + 30» сводка показывала 0 при бейдже 1.
 */
export const pendingBookingsQuery = (
  scope: ActiveScope,
  kind: "pending" | "overdue",
  enabled = true,
) => {
  const today = dayjs();
  const dateFrom = today.subtract(30, "day").format("YYYY-MM-DD");
  const dateTo =
    kind === "pending"
      ? today.add(90, "day").format("YYYY-MM-DD")
      : today.subtract(1, "day").format("YYYY-MM-DD");
  return {
    queryKey: djangoQueryKeys.bookings.list({
      view: `dashboard-${kind}`,
      organizationId: scope.organizationId ?? null,
      branchId: scope.branchId ?? null,
      dateFrom,
      dateTo,
    }),
    queryFn: ({ signal }: Signal) =>
      getBookings(
        {
          dateFrom,
          dateTo,
          status: "pending",
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          page: 1,
          // Нужен только счётчик: заявки целиком не тянем.
          pageSize: 1,
        },
        signal,
      ),
    enabled: scope.orgReady && enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  };
};

export const tasksSummaryQuery = (scope: ActiveScope, enabled = true) => ({
  queryKey: djangoQueryKeys.tasks.summary(scope.organizationId),
  queryFn: ({ signal }: Signal) => getTasksSummary(scope.organizationId, signal),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});

export const dealsSummaryQuery = (scope: ActiveScope, enabled = true) => ({
  queryKey: djangoQueryKeys.deals.summary({ organizationId: scope.organizationId }),
  queryFn: ({ signal }: Signal) =>
    getDealsSummary({ organizationId: scope.organizationId }, signal),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});

export const reviewStatsQuery = (scope: ActiveScope, r: PeriodRange, enabled = true) => ({
  queryKey: djangoQueryKeys.reviews.stats({
    view: "dashboard",
    organizationId: scope.organizationId ?? null,
    from: r.dateFrom,
    to: r.dateTo,
  }),
  queryFn: ({ signal }: Signal) =>
    getReviewStats({ from: r.dateFrom, to: r.dateTo, organizationId: scope.organizationId }, signal),
  enabled: scope.orgReady && enabled,
  staleTime: DJANGO_DETAIL_STALE_TIME_MS,
});
