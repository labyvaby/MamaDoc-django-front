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

  /**
   * Тот же фильтр, но по сотруднику, а не по смене: строке отсутствия смены
   * не с чем сопоставить, а прятать её при активном фильтре всё равно нужно.
   * Имя передаётся отдельно — сотрудника может не быть в справочнике филиала.
   */
  const matchesEmployee = React.useCallback(
    (employeeId: number, employeeName?: string): boolean => {
      if (filters.mine && currentEmployeeId != null && employeeId !== currentEmployeeId) {
        return false;
      }
      const employee = employeesById.get(employeeId);
      if (filters.role !== "all" && employee?.clinicalRole !== filters.role) return false;
      if (filters.spec && !employee?.specializations.some((s) => s.name === filters.spec)) {
        return false;
      }
      const q = filters.name.trim().toLowerCase();
      if (q && !(employeeName ?? employee?.fullName ?? "").toLowerCase().includes(q)) return false;
      return true;
    },
    [filters, currentEmployeeId, employeesById],
  );

  return { filters, set, reset, apply, matchesEmployee };
}
