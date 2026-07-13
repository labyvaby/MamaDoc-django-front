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
 * Минимальная карточка для сотрудника, которого нет в справочнике: смены
 * приходят по всей организации, а /staff/employees/ скоупится по филиалу —
 * без этого фолбэка такие смены исчезали бы из видов «День»/«Неделя».
 */
function synthesizeEmployee(id: number, fullName: string): DjangoEmployeeListItem {
  return {
    id,
    organizationId: 0,
    branch: null,
    authUserId: null,
    fullName,
    phone: "",
    email: "",
    nickname: "",
    status: "active",
    clinicalRole: "other" as DjangoEmployeeListItem["clinicalRole"],
    photoUrl: null,
    role: null,
    specializations: [],
    operationalBranches: [],
  };
}

/**
 * Группирует сотрудников по специализации. Сотрудник с несколькими
 * специализациями попадает в первую (по алфавиту) — строка одна, иначе
 * смены дублировались бы в разных группах.
 */
export function useResourceGroups(
  employees: DjangoEmployeeListItem[],
  /** Показывать только сотрудников, у которых есть смены в периоде. */
  employeeIdsWithShifts: Set<number>,
  /** Имена из смен — для сотрудников, отсутствующих в справочнике. */
  namesFromShifts?: Map<number, string>,
): ResourceGroup[] {
  return React.useMemo(() => {
    const byKey = new Map<string, ResourceGroup>();
    const known = new Set(employees.map((e) => e.id));

    const rows: DjangoEmployeeListItem[] = employees.filter((e) => employeeIdsWithShifts.has(e.id));
    if (namesFromShifts) {
      for (const [id, name] of namesFromShifts) {
        if (!known.has(id) && employeeIdsWithShifts.has(id)) rows.push(synthesizeEmployee(id, name));
      }
    }

    for (const employee of rows) {
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
  }, [employees, employeeIdsWithShifts, namesFromShifts]);
}

/** Имена сотрудников из смен (для строк, которых нет в справочнике). */
export function namesFromOccurrences(occs: DayOccurrence[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const o of occs) if (!map.has(o.employeeId)) map.set(o.employeeId, o.employeeName);
  return map;
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
