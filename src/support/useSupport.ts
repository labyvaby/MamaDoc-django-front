import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { getSupportSummary, type SupportSummary } from "../api/support";

/** Как часто пересчитывается бейдж «Поддержка» (и сводка на странице). */
const SUMMARY_POLL_MS = 30_000;

/**
 * Счётчики поддержки. Один ключ на приложение: сайдбар, шапка страницы и
 * плитки читают один и тот же кэш. Поллинг и рефетч по возврату на вкладку —
 * чтобы ответ разработчика появился без перезагрузки страницы.
 */
export function useSupportSummary(enabled = true) {
  return useQuery<SupportSummary>({
    queryKey: djangoQueryKeys.support.summary,
    queryFn: ({ signal }) => getSupportSummary(signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: SUMMARY_POLL_MS,
    refetchOnWindowFocus: true,
    // Бейдж — украшение: его сбой не должен выглядеть как сбой приложения.
    retry: 1,
  });
}

export interface SupportBadge {
  count: number;
  color: "error" | "primary";
}

/**
 * Бейдж пункта меню. Автору — число обращений с новым ответом. Разработчику —
 * ещё и очередь обращений, ждущих реакции (красным: ей надо заняться).
 */
export function useSupportBadge(): SupportBadge {
  const summary = useSupportSummary().data;
  if (!summary) return { count: 0, color: "primary" };
  const queue = summary.isStaff ? (summary.needsAttention ?? 0) : 0;
  return { count: summary.unread + queue, color: queue > 0 ? "error" : "primary" };
}
