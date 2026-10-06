import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { constructionKeys } from "../../api/construction";
import { estateOpsKeys } from "../../api/estateOps";
import { getEmployees, personnelKeys } from "../../api/personnel";
import { residentAppKeys } from "../../api/residentApp";
import { useRealtyScope } from "../../hooks/useRealtyScope";

/**
 * После действия перечитать эксплуатацию, приложение (push, журнал) и
 * стройконтроль: замечание приёмки и «В стройконтроль» заводят дефект.
 */
export function useRefreshOps() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: estateOpsKeys.all });
    void queryClient.invalidateQueries({ queryKey: residentAppKeys.all });
    void queryClient.invalidateQueries({ queryKey: constructionKeys.all });
  }, [queryClient]);
}

/** Сотрудники для «Менеджер» / «Исполнитель» — работающие, из кадров AIVIO (гайд §4). */
export function useWorkingEmployees(enabled = true) {
  const scope = useRealtyScope();
  const params = React.useMemo(() => ({ status: "working" as const }), []);
  const query = useQuery({
    queryKey: personnelKeys.employees(scope, params),
    queryFn: ({ signal }) => getEmployees(params, scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return React.useMemo(() => query.data ?? [], [query.data]);
}
