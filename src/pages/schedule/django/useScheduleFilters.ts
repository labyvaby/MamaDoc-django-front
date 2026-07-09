import React from "react";
import type { ClinicalRole, DjangoEmployeeListItem } from "../../../api/staff";
import type { DayOccurrence } from "./occurrences";

export interface ScheduleFiltersState {
  role: ClinicalRole | "all";
  spec: string | null;
  name: string;
  mine: boolean;
}

const EMPTY: ScheduleFiltersState = { role: "all", spec: null, name: "", mine: false };

/**
 * Состояние фильтров календаря + готовый предикат для смен.
 * Держим отдельно от разметки, чтобы виды не тащили лишнее.
 */
export function useScheduleFilters(
  employeesById: Map<number, DjangoEmployeeListItem>,
  currentEmployeeId?: number | null,
) {
  const [filters, setFilters] = React.useState<ScheduleFiltersState>(EMPTY);

  const set = React.useCallback(
    <K extends keyof ScheduleFiltersState>(key: K, value: ScheduleFiltersState[K]) =>
      setFilters((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const reset = React.useCallback(
    () => setFilters((prev) => ({ ...prev, role: "all", spec: null })),
    [],
  );

  const apply = React.useCallback(
    (occs: DayOccurrence[]): DayOccurrence[] => {
      let result = occs;
      if (filters.mine && currentEmployeeId != null) {
        result = result.filter((o) => o.employeeId === currentEmployeeId);
      }
      if (filters.role !== "all") {
        result = result.filter((o) => employeesById.get(o.employeeId)?.clinicalRole === filters.role);
      }
      if (filters.spec) {
        result = result.filter((o) =>
          employeesById.get(o.employeeId)?.specializations.some((s) => s.name === filters.spec),
        );
      }
      const q = filters.name.trim().toLowerCase();
      if (q) result = result.filter((o) => o.employeeName.toLowerCase().includes(q));
      return result;
    },
    [filters, currentEmployeeId, employeesById],
  );

  return { filters, set, reset, apply };
}
