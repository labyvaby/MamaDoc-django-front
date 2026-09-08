import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getServiceAssignments } from "../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { usePermissions } from "./usePermissions";
import { useCan } from "./useCan";

const EMPTY = new Map<number, number>();

export interface ServiceAssignmentCounts {
  /** serviceId → сколько сотрудников её оказывают; услуги без пар в карте нет. */
  countByService: Map<number, number>;
  isLoading: boolean;
  /** Данные загружены — до этого «0 исполнителей» ещё ничего не значит. */
  isReady: boolean;
}

/**
 * Сколько сотрудников оказывает каждую услугу.
 *
 * Один запрос `/api/appointments/service-assignments/` отдаёт всю матрицу пар
 * «услуга ↔ сотрудник» (196 пар на орг «Мама Доктор»), поэтому счётчик в списке
 * услуг стоит ровно одного запроса, а не одного на строку. Право —
 * `appointments.view`; филиал сужает пары до пригодных в нём, как и при
 * сохранении приёма.
 */
export function useServiceAssignmentCounts(enabled: boolean = true): ServiceAssignmentCounts {
  const canView = useCan("appointments.view");
  const { activeBranch } = usePermissions();
  const active = enabled && canView;

  const query = useQuery({
    queryKey: djangoQueryKeys.appointments.serviceAssignments(activeBranch?.id ?? null),
    queryFn: ({ signal }) => getServiceAssignments(activeBranch?.id ?? undefined, signal),
    enabled: active,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const countByService = React.useMemo(() => {
    if (!query.data) return EMPTY;
    const counts = new Map<number, number>();
    for (const pair of query.data) {
      counts.set(pair.serviceId, (counts.get(pair.serviceId) ?? 0) + 1);
    }
    return counts;
  }, [query.data]);

  return {
    countByService,
    isLoading: active && query.isLoading,
    isReady: active && query.data != null,
  };
}

export default useServiceAssignmentCounts;
