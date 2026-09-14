import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getServiceAssignments } from "../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { usePermissions } from "./usePermissions";
import { useCan } from "./useCan";

const EMPTY = new Map<number, number>();
const EMPTY_IDS = new Map<number, number[]>();

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

  const employeeIdsByService = React.useMemo(() => {
    if (!query.data) return EMPTY_IDS;
    // Считаем сотрудников, а не пары: один сотрудник может прийти дважды
    // (проверено на проде 09.09.2026 — в выдаче без филиала сотрудник 20
    // встречается у услуги 10 два раза), иначе счётчик завышен.
    const seen = new Map<number, Set<number>>();
    for (const pair of query.data) {
      const set = seen.get(pair.serviceId) ?? new Set<number>();
      set.add(pair.employeeId);
      seen.set(pair.serviceId, set);
    }
    const byService = new Map<number, number[]>();
    for (const [serviceId, set] of seen) byService.set(serviceId, [...set]);
    return byService;
  }, [query.data]);

  const countByService = React.useMemo(() => {
    if (employeeIdsByService === EMPTY_IDS) return EMPTY;
    const counts = new Map<number, number>();
    for (const [serviceId, ids] of employeeIdsByService) {
      counts.set(serviceId, ids.length);
    }
    return counts;
  }, [employeeIdsByService]);

  return {
    countByService,
    isLoading: active && query.isLoading,
    isReady: active && query.data != null,
  };
}

export default useServiceAssignmentCounts;
