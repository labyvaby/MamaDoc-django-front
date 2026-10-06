import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getDepartments, personnelKeys } from "../../api/personnel";
import { payrollKeys } from "../../api/salaryPayroll";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";

export function useDepartments(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: personnelKeys.departments(scope),
    queryFn: ({ signal }) => getDepartments(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });
}

/**
 * Кнопки карточки сотрудника: `personnel.manage` **и** MamaDoc-право на
 * сотрудников. Одного `personnel.manage` мало — его получает и прораб от
 * табеля (открытый вопрос бэка №1 в `frontend-hr-ops.md` §7).
 */
export function useCanManageStaff(): boolean {
  const personnel = useCan("personnel.manage");
  const staff = useCan(["staff.update", "staff.create", "staff.manage"]);
  return personnel && staff;
}

/** После кадрового действия перечитать кадры и зарплату (отпуск меняет табель и ведомость). */
export function useRefreshPersonnel() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: personnelKeys.all });
    void queryClient.invalidateQueries({ queryKey: payrollKeys.all });
  }, [queryClient]);
}
