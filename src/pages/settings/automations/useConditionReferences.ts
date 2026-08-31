import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { AutomationCatalogField } from "../../../api/automations";
import { getBranches } from "../../../api/organization";
import { getServices } from "../../../api/catalog";
import { orgWide } from "../../../api/scope";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useAllActiveEmployees } from "../../../hooks/useAllActiveEmployees";

export interface ReferenceOption {
  value: string;
  label: string;
}

export interface ConditionReferences {
  branch: ReferenceOption[];
  service: ReferenceOption[];
  employee: ReferenceOption[];
  /**
   * Справочник уже загружен (или не запрашивался). Нужно, чтобы не спутать
   * «в организации нет сотрудников» с «список ещё едет»: поле условия
   * скрывается только по первому, иначе оно мигало бы при открытии формы.
   */
  loaded: { branch: boolean; service: boolean; employee: boolean };
  isLoading: boolean;
}

const EMPTY: ReferenceOption[] = [];

/**
 * Справочники для полей-ссылок в условиях (`branch`, `service`, `employee`).
 *
 * Каталог автоматизаций отдаёт только тип поля — конкретные ID берём из
 * собственных справочников фронта и отправляем как значения условия. Тип
 * `client` сюда не входит: пациентов десятки тысяч, целиком их тянуть нельзя,
 * поэтому конструктор принимает ID клиента вводом (см. ConditionBuilder).
 *
 * Загружается только когда редактор открыт и в дереве есть такое поле —
 * иначе каждое открытие страницы тянуло бы три справочника впустую.
 */
export function useConditionReferences(
  organizationId: number | undefined,
  needed: { branch: boolean; service: boolean; employee: boolean },
): ConditionReferences {
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, organizationId ?? null],
    queryFn: () => getBranches(organizationId ?? null),
    enabled: needed.branch,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const servicesQuery = useQuery({
    queryKey: djangoQueryKeys.reference.services({ orgId: organizationId ?? null }),
    queryFn: ({ signal }) => getServices(orgWide(organizationId), undefined, signal),
    enabled: needed.service,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const employees = useAllActiveEmployees(needed.employee);
  const loaded = {
    branch: !needed.branch || branchesQuery.isSuccess,
    service: !needed.service || servicesQuery.isSuccess,
    employee: !needed.employee || !employees.isLoading,
  };

  const branch = useMemo<ReferenceOption[]>(
    () =>
      (branchesQuery.data ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({ value: String(item.id), label: item.name })),
    [branchesQuery.data],
  );

  const service = useMemo<ReferenceOption[]>(
    () =>
      (servicesQuery.data ?? [])
        .filter((item) => item.isActive)
        .map((item) => ({ value: String(item.id), label: item.name })),
    [servicesQuery.data],
  );

  const employee = useMemo<ReferenceOption[]>(
    () =>
      employees.employees.map((item) => ({
        value: String(item.id),
        label: item.fullName,
      })),
    [employees.employees],
  );

  return {
    branch: needed.branch ? branch : EMPTY,
    service: needed.service ? service : EMPTY,
    employee: needed.employee ? employee : EMPTY,
    loaded,
    isLoading:
      (needed.branch && branchesQuery.isLoading) ||
      (needed.service && servicesQuery.isLoading) ||
      (needed.employee && employees.isLoading),
  };
}

/**
 * Варианты значения поля события — читаемые названия вместо ID.
 *
 * `select` берёт значения из каталога, поля-ссылки — из справочников
 * организации. `null` означает «выбирать не из чего, нужен свободный ввод»
 * (числа, текст, а также `client`: список пациентов слишком велик для
 * выпадающего списка).
 */
export function fieldOptions(
  spec: AutomationCatalogField | undefined,
  references: ConditionReferences,
): ReferenceOption[] | null {
  switch (spec?.fieldType) {
    case "select":
      return spec.options.map((option) => ({
        value: option.value,
        label: option.label,
      }));
    case "branch":
      return references.branch;
    case "service":
      return references.service;
    case "employee":
      return references.employee;
    default:
      return null;
  }
}

export default useConditionReferences;
