import React from "react";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { DayOccurrence } from "./occurrences";

/** Сотрудник как строка-ресурс в видах «День» и «Неделя». */
export interface ResourceRow {
  employee: DjangoEmployeeListItem;
  /** Специализация, по которой сотрудник попал в группу. */
  groupKey: string;
}

export interface ResourceGroup {
  key: string;
  label: string;
  rows: ResourceRow[];
}

const NO_SPEC = "__no_spec__";
const NO_SPEC_LABEL = "Без специализации";

/**
 * Группирует сотрудников по специализации. Сотрудник с несколькими
 * специализациями попадает в первую (по алфавиту) — строка одна, иначе
 * смены дублировались бы в разных группах.
 */
export function useResourceGroups(
  employees: DjangoEmployeeListItem[],
  /** Показывать только сотрудников, у которых есть смены в периоде. */
  employeeIdsWithShifts: Set<number>,
): ResourceGroup[] {
  return React.useMemo(() => {
    const byKey = new Map<string, ResourceGroup>();

    for (const employee of employees) {
      if (!employeeIdsWithShifts.has(employee.id)) continue;

      const spec = [...employee.specializations].sort((a, b) => a.name.localeCompare(b.name))[0];
      const key = spec ? String(spec.id) : NO_SPEC;
      const label = spec ? spec.name : NO_SPEC_LABEL;

      if (!byKey.has(key)) byKey.set(key, { key, label, rows: [] });
      byKey.get(key)!.rows.push({ employee, groupKey: key });
    }

    const groups = [...byKey.values()];
    groups.forEach((g) => g.rows.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)));
    // «Без специализации» — всегда последней группой.
    return groups.sort((a, b) => {
      if (a.key === NO_SPEC) return 1;
      if (b.key === NO_SPEC) return -1;
      return a.label.localeCompare(b.label);
    });
  }, [employees, employeeIdsWithShifts]);
}

/** Свёрнутые группы: набор ключей. */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const toggle = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

/** Смены сотрудника за конкретный день, отсортированные по началу. */
export function occurrencesOf(occs: DayOccurrence[], employeeId: number): DayOccurrence[] {
  return occs
    .filter((o) => o.employeeId === employeeId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
