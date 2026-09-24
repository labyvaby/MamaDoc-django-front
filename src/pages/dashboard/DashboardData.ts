import React from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { ApiError } from "../../api/client";
import {
  DASHBOARD_ALL_SECTIONS,
  DASHBOARD_LIVE_SECTIONS,
  getDashboardSummary,
  isDashboardSummaryV2,
  type DashboardBranchRow,
  type DashboardSections,
  type DashboardSummary,
} from "../../api/dashboard";
import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { getBranches } from "../../api/organization";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import type { ActiveScope } from "../../hooks/useActiveScope";
import {
  baselineWindow,
  chartRangeFor,
  previousFullMonth,
  previousRange,
  resolvePeriod,
  type PeriodKey,
  type PeriodRange,
} from "./period";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dayCountsQuery,
  dealsSummaryQuery,
  monthlyReportQuery,
  payrollReportQuery,
  pendingBookingsQuery,
  reviewStatsQuery,
  tasksSummaryQuery,
} from "./queries";
import {
  legacyAppointments,
  legacyBookings,
  legacyBranch,
  legacyDeals,
  legacyLoad,
  legacyMoney,
  legacyMonth,
  legacyReviews,
  legacyStaff,
  legacyTasks,
} from "./legacyData";
import { FULL_REFRESH_MS, LIVE_REFRESH_MS } from "./refresh";

type SectionKey = keyof DashboardSections | "branches";

/**
 * Данные сводки для всех блоков разом.
 *
 * Источник — агрегат `/dashboard/summary/` (один запрос на экран). Если сервер
 * отвечает первой версией агрегата (прод на 24.09.2026) или не знает ручку
 * вовсе, те же данные в том же формате собираются из прежних ручек
 * (`legacyData.ts`). Блоки не знают, откуда пришли цифры: чего нет — того не
 * показывают.
 */
export interface DashboardData {
  /** `pending` — ещё не понятно, какой агрегат на сервере. */
  source: "aggregate" | "legacy" | "pending";
  range: PeriodRange;
  periodKey: PeriodKey;
  /** База сравнения — её подпись («тот же день неделю назад») идёт в дельты. */
  prev: PeriodRange;
  /** Окно графика записей. */
  chartRange: PeriodRange;
  sections: DashboardSections;
  /** Срез по филиалам; на прежних ручках — первые 8 филиалов, без базы. */
  branches?: DashboardBranchRow[];
  /** Всего филиалов у пользователя (на прежних ручках список может быть длиннее среза). */
  branchTotal: number;
  /** Время расчёта на сервере — только у агрегата. */
  generatedAt?: string;
  isLoading: (section: SectionKey) => boolean;
  error: (section: SectionKey) => unknown;
}

export const DashboardDataContext = React.createContext<DashboardData | null>(null);

export function useDashboardData(): DashboardData {
  const ctx = React.useContext(DashboardDataContext);
  if (!ctx) throw new Error("useDashboardData вне DashboardDataContext");
  return ctx;
}

/** Ручки нет вовсе (стенд без агрегата) — тогда тоже прежние ручки. */
const isMissingEndpoint = (err: unknown) =>
  err instanceof ApiError && (err.status === 404 || err.status === 405);

/** Сколько филиалов берём в срез на прежних ручках: по запросу на каждый. */
const LEGACY_BRANCH_LIMIT = 8;

export function useDashboardDataSource({
  range,
  periodKey,
  scope,
  can,
}: {
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
  can: (permission: string | string[]) => boolean;
}): DashboardData {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  const chartRange = React.useMemo(() => chartRangeFor(range, periodKey), [range, periodKey]);

  // Базу сравнения передаём явно, хотя правила у бэка те же: подписи дельт
  // берутся из previousRange, и даты в запросе обязаны им соответствовать.
  const params = {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    compareFrom: prev.dateFrom,
    compareTo: prev.dateTo,
    chartFrom: chartRange.dateFrom,
    chartTo: chartRange.dateTo,
    branchId: scope.branchId ?? null,
    organizationId: scope.organizationId ?? null,
  };

  // ── Агрегат ──────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const liveKey = djangoQueryKeys.dashboard.summary({ ...params, sections: "live" });
  const full = useQuery({
    queryKey: djangoQueryKeys.dashboard.summary({ ...params, sections: "all" }),
    queryFn: async ({ signal }) => {
      const res = await getDashboardSummary({ ...params, sections: DASHBOARD_ALL_SECTIONS }, signal);
      // Полный ответ содержит и «живые» разделы — засеваем ими живой запрос,
      // чтобы он не повторял их сразу после открытия, а ждал своего интервала.
      if (isDashboardSummaryV2(res)) queryClient.setQueryData(liveKey, res);
      return res;
    },
    enabled: scope.orgReady,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    // Первую версию агрегата не опрашиваем: её данные не используются.
    refetchInterval: (q) =>
      q.state.data && !isDashboardSummaryV2(q.state.data) ? false : FULL_REFRESH_MS,
    retry: (count, err) => !isMissingEndpoint(err) && count < 2,
  });

  const isV2 = !!full.data && isDashboardSummaryV2(full.data);
  const legacy = (!!full.data && !isV2) || (full.isError && isMissingEndpoint(full.error));
  const source: DashboardData["source"] = isV2 ? "aggregate" : legacy ? "legacy" : "pending";

  // «Живые» разделы — отдельным лёгким запросом. Кэш засеян полным ответом
  // (см. queryFn выше), поэтому при открытии лишнего запроса нет: первый
  // опрос — через LIVE_REFRESH_MS.
  const live = useQuery({
    queryKey: liveKey,
    queryFn: ({ signal }) =>
      getDashboardSummary({ ...params, sections: DASHBOARD_LIVE_SECTIONS }, signal),
    enabled: scope.orgReady && isV2,
    staleTime: LIVE_REFRESH_MS,
    refetchInterval: LIVE_REFRESH_MS,
  });

  // Срез по филиалам. ⚠ С branchId агрегат кладёт в branches[] только этот
  // филиал (тест, 24.09.2026), хотя ответ бэка обещает «все доступные». А
  // сравнивать надо все: при выбранном филиале берём срез отдельным лёгким
  // запросом без branchId.
  const branchesAll = useQuery({
    queryKey: djangoQueryKeys.dashboard.summary({ ...params, branchId: null, sections: "branches" }),
    queryFn: ({ signal }) =>
      getDashboardSummary({ ...params, branchId: null, sections: ["branches"] }, signal),
    enabled: scope.orgReady && isV2 && scope.branchId != null && can(PAGE_PERMISSIONS.cashbox),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: FULL_REFRESH_MS,
  });
  const aggregateBranches =
    scope.branchId != null ? branchesAll.data?.branches : full.data?.branches;

  // ── Прежние ручки (только в режиме legacy) ────────────────────────────────
  const monthRange = React.useMemo(
    () => resolvePeriod("month", dayjs(range.dateTo)),
    [range.dateTo],
  );
  const lastMonth = React.useMemo(() => previousFullMonth(dayjs(range.dateTo)), [range.dateTo]);
  const historyRange = React.useMemo(() => baselineWindow(chartRange), [chartRange]);

  const canCash = legacy && can(PAGE_PERMISSIONS.cashbox);
  const canAppts = legacy && can(PAGE_PERMISSIONS.appointments);
  const canReports = legacy && can(PAGE_PERMISSIONS.reports);
  const canBookings = legacy && can(PAGE_PERMISSIONS.bookings);
  const canTasks = legacy && can(PAGE_PERMISSIONS.tasks);
  const canDeals = legacy && DEALS_MODULE_ENABLED && can(PAGE_PERMISSIONS.deals);
  const canReviews = legacy && can(PAGE_PERMISSIONS.reviews);
  const canPayroll = legacy && can(PAGE_PERMISSIONS.payroll);
  const canSchedule = legacy && can(PAGE_PERMISSIONS.schedule);

  const cash = useQuery(cashboxSummaryQuery(scope, range, canCash));
  const cashPrev = useQuery(cashboxSummaryQuery(scope, prev, canCash));
  const cashMonth = useQuery(cashboxSummaryQuery(scope, monthRange, canCash));
  const cashLastMonth = useQuery(cashboxSummaryQuery(scope, lastMonth, canCash));
  const report = useQuery(monthlyReportQuery(scope, monthRange.month, canCash && canReports));
  const counts = useQuery(dayCountsQuery(scope, range, canAppts));
  const countsPrev = useQuery(dayCountsQuery(scope, prev, canAppts));
  const countsChart = useQuery(dayCountsQuery(scope, chartRange, canAppts));
  const countsHistory = useQuery(dayCountsQuery(scope, historyRange, canAppts));
  const pending = useQuery(pendingBookingsQuery(scope, "pending", canBookings));
  const overdue = useQuery(pendingBookingsQuery(scope, "overdue", canBookings));
  const tasks = useQuery(tasksSummaryQuery(scope, canTasks));
  const deals = useQuery(dealsSummaryQuery(scope, canDeals));
  const reviews = useQuery(reviewStatsQuery(scope, range, canReviews));
  const reviewsPrev = useQuery(reviewStatsQuery(scope, prev, canReviews));
  const payroll = useQuery(payrollReportQuery(scope, monthRange.month, canPayroll));
  const availability = useQuery(availabilityTodayQuery(scope, canSchedule));

  const branchList = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, scope.organizationId ?? null],
    queryFn: () => getBranches(scope.organizationId),
    enabled: scope.orgReady && canCash,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const legacyBranchList = React.useMemo(
    () =>
      (branchList.data?.length ?? 0) > 1
        ? branchList.data!.slice(0, LEGACY_BRANCH_LIMIT)
        : [],
    [branchList.data],
  );
  const branchCash = useQueries({
    queries: legacyBranchList.map((b) =>
      cashboxSummaryQuery({ ...scope, branchId: b.id }, range, canCash),
    ),
  });

  // ── Сборка ───────────────────────────────────────────────────────────────
  const aggregate: DashboardSummary | undefined = isV2 ? full.data : undefined;

  const aggregateSections = React.useMemo<DashboardSections>(() => {
    if (!aggregate) return {};
    const liveData = live.data;
    // Свежие «живые» разделы поверх полного ответа. Раздел, которого в живом
    // ответе нет (нет права), остаётся из полного — там его тоже нет.
    if (!liveData || live.dataUpdatedAt <= full.dataUpdatedAt || !isDashboardSummaryV2(liveData)) {
      return aggregate.sections;
    }
    const merged: DashboardSections = { ...aggregate.sections };
    for (const key of DASHBOARD_LIVE_SECTIONS) {
      const section = liveData.sections[key as keyof DashboardSections];
      if (section) (merged as Record<string, unknown>)[key] = section;
    }
    return merged;
  }, [aggregate, live.data, live.dataUpdatedAt, full.dataUpdatedAt]);

  const legacySections = React.useMemo<DashboardSections>(() => {
    if (!legacy) return {};
    const s: DashboardSections = {};
    if (cash.data) s.money = legacyMoney(cash.data, cashPrev.data);
    if (cashMonth.data) {
      s.month = legacyMonth(monthRange, cashMonth.data, cashLastMonth.data, lastMonth, report.data);
    }
    if (counts.data) {
      s.appointments = legacyAppointments(
        counts.data,
        countsPrev.data,
        chartRange,
        countsChart.data,
        countsHistory.data,
      );
    }
    if (pending.data && overdue.data) {
      s.bookings = legacyBookings(pending.data.count ?? 0, overdue.data.count ?? 0);
    }
    if (tasks.data) s.tasks = legacyTasks(tasks.data);
    if (deals.data) s.deals = legacyDeals(deals.data);
    if (reviews.data) s.reviews = legacyReviews(reviews.data, reviewsPrev.data);
    if (payroll.data) s.staff = legacyStaff(payroll.data);
    if (availability.data) s.load = legacyLoad(availability.data);
    return s;
  }, [
    legacy,
    cash.data,
    cashPrev.data,
    cashMonth.data,
    cashLastMonth.data,
    report.data,
    counts.data,
    countsPrev.data,
    countsChart.data,
    countsHistory.data,
    pending.data,
    overdue.data,
    tasks.data,
    deals.data,
    reviews.data,
    reviewsPrev.data,
    payroll.data,
    availability.data,
    monthRange,
    lastMonth,
    chartRange,
  ]);

  // Без memo: useQueries отдаёт новый массив на каждый рендер, а строк не больше восьми.
  const legacyBranches: DashboardBranchRow[] | undefined =
    legacy && legacyBranchList.length > 0
      ? legacyBranchList.flatMap((b, i) => {
          const s = branchCash[i]?.data;
          return s ? [legacyBranch(b, scope.organizationId ?? 0, s)] : [];
        })
      : undefined;

  // ── Состояние разделов ───────────────────────────────────────────────────
  const legacyQueries: Record<SectionKey, { isLoading: boolean; error: unknown }[]> = {
    money: [cash, cashPrev],
    month: [cashMonth, cashLastMonth, report],
    appointments: [counts, countsPrev, countsChart],
    bookings: [pending, overdue],
    tasks: [tasks],
    deals: [deals],
    reviews: [reviews],
    staff: [payroll],
    load: [availability],
    branches: [branchList, ...branchCash],
  };

  const aggregateQueries: Partial<Record<SectionKey, { isLoading: boolean; error: unknown }>> = {
    branches: scope.branchId != null ? branchesAll : undefined,
  };

  const isLoading = (section: SectionKey) => {
    if (source === "pending") return !full.isError;
    if (source === "aggregate") return aggregateQueries[section]?.isLoading ?? false;
    return legacyQueries[section].some((q) => q.isLoading);
  };
  const error = (section: SectionKey) => {
    if (source === "pending") return full.isError ? full.error : undefined;
    if (source === "aggregate") return aggregateQueries[section]?.error ?? undefined;
    return legacyQueries[section].find((q) => q.error)?.error;
  };

  return {
    source,
    range,
    periodKey,
    prev,
    chartRange,
    sections: source === "aggregate" ? aggregateSections : legacySections,
    branches: source === "aggregate" ? aggregateBranches : legacyBranches,
    branchTotal:
      source === "aggregate"
        ? (aggregateBranches?.length ?? 1)
        : (branchList.data?.length ?? 1),
    generatedAt: aggregate?.generatedAt,
    isLoading,
    error,
  };
}
