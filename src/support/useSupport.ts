import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { getSupportSummary, type SupportSummary } from "../api/support";
import { usePermissions } from "../hooks/usePermissions";

/** Как часто пересчитывается бейдж «Поддержка» (и сводка на странице). */
const SUMMARY_POLL_MS = 30_000;

export interface SupportAccess {
  /** Страница, свои обращения, бейдж — `support.view`. */
  canView: boolean;
  /** Отправка обращения (жук в шапке, кнопка после сбоя) — `support.create`. */
  canCreate: boolean;
}

/**
 * Доступ к поддержке — как у любого модуля: модуль `support` включён у
 * организации и у роли есть право. Разработчик платформы (суперпользователь)
 * видит поддержку всегда: обращения ему пишут и из организаций, где модуль
 * потом выключили.
 */
export function useSupportAccess(): SupportAccess {
  const { canAccess, isPlatformAdmin, loading } = usePermissions();
  if (loading) return { canView: false, canCreate: false };
  const dev = Boolean(isPlatformAdmin);
  return {
    canView: dev || canAccess("support.view"),
    canCreate: dev || canAccess("support.create"),
  };
}

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
  const summary = useSupportSummary(useSupportAccess().canView).data;
  if (!summary) return { count: 0, color: "primary" };
  const queue = summary.isStaff ? (summary.needsAttention ?? 0) : 0;
  return { count: summary.unread + queue, color: queue > 0 ? "error" : "primary" };
}
