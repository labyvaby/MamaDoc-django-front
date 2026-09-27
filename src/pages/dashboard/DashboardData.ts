import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DASHBOARD_ALL_SECTIONS,
  DASHBOARD_LIVE_SECTIONS,
  getDashboardSummary,
  isDashboardSummaryV2,
  type DashboardBranchRow,
  type DashboardSections,
} from "../../api/dashboard";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { chartRangeFor, previousRange, type PeriodKey, type PeriodRange } from "./period";
import { FULL_REFRESH_MS, LIVE_REFRESH_MS } from "./refresh";

type SectionKey = keyof DashboardSections | "branches";

/** Сервер отвечает первой версией агрегата — показывать её данные нельзя. */
export const DASHBOARD_OUTDATED_MESSAGE =
  "Сервер отдаёт устаревшую версию сводки. Обновите бэкенд — данные появятся без перезагрузки фронта.";

/**
 * Данные сводки для всех блоков разом — агрегат `/dashboard/summary/` v2,
 * один запрос на экран. Блоки читают его из контекста и своих запросов не
 * делают; раздела без права сервер не отдаёт, и блок его не рисует.
 */
export interface DashboardData {
  /**
   * `pending` — ответа ещё нет; `outdated` — на сервере первая версия
   * агрегата (86d4563b): фронт выкладывается на прод только после бэка v2, но
   * если порядок нарушат, блоки покажут ошибку, а не цифры другой формы.
   */
  source: "aggregate" | "pending" | "outdated";
  range: PeriodRange;
  periodKey: PeriodKey;
  /** База сравнения — её подпись («тот же день неделю назад») идёт в дельты. */
  prev: PeriodRange;
  /** Окно графика записей. */
  chartRange: PeriodRange;
  sections: DashboardSections;
  /** Срез по всем доступным филиалам — от активного филиала не зависит. */
  branches?: DashboardBranchRow[];
  branchTotal: number;
  /** Время расчёта на сервере. */
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

const EMPTY: DashboardSections = {};

export function useDashboardDataSource({
  range,
  periodKey,
  scope,
}: {
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
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
    refetchInterval: FULL_REFRESH_MS,
  });

  const isV2 = !!full.data && isDashboardSummaryV2(full.data);
  const source: DashboardData["source"] = isV2 ? "aggregate" : full.data ? "outdated" : "pending";

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

  const aggregate = isV2 ? full.data : undefined;

  const sections = React.useMemo<DashboardSections>(() => {
    if (!aggregate) return EMPTY;
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

  const outdatedError = React.useMemo(() => new Error(DASHBOARD_OUTDATED_MESSAGE), []);

  return {
    source,
    range,
    periodKey,
    prev,
    chartRange,
    sections,
    branches: aggregate?.branches,
    branchTotal: aggregate?.branches?.length ?? 1,
    generatedAt: aggregate?.generatedAt,
    isLoading: () => source === "pending" && !full.isError,
    error: () =>
      source === "outdated" ? outdatedError : full.isError && !full.data ? full.error : undefined,
  };
}
