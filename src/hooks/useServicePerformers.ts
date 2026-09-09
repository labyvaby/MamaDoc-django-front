import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getServiceProviders,
  type ServiceProvider,
} from "../api/appointments";
import { getEmployeeServices } from "../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { useAllActiveEmployees } from "./useAllActiveEmployees";
import { useServiceAssignmentCounts } from "./useServiceAssignmentCounts";
import { usePermissions } from "./usePermissions";
import { useCan } from "./useCan";

const EMPTY: ServicePerformer[] = [];

/** Строка секции «Кто оказывает»: исполнитель услуги + фото, если оно доступно. */
export interface ServicePerformer extends ServiceProvider {
  /**
   * Фото из справочника сотрудников. `/appointments/service-providers/` его не
   * отдаёт, поэтому подмешиваем из уже закешированного справочника — и только
   * когда у зрителя есть `staff.view`. Без фото рисуем инициалы.
   */
  photoUrl: string | null;
  /**
   * Основной филиал сотрудника отличается от активного филиала сессии. Чип
   * филиала показываем только таким: в одном филиале он одинаков у всех строк и
   * ничего не сообщает.
   */
  branchIsForeign: boolean;
}

export interface ServicePerformersResult {
  performers: ServicePerformer[];
  isLoading: boolean;
  isError: boolean;
  /** Право на список исполнителей — без него секция скрывается. */
  canView: boolean;
}

/**
 * Кто оказывает услугу.
 *
 * Два запроса вместо одного, и оба без `serviceId`:
 * `/api/appointments/service-providers/?branchId=` даёт ФИО, специализации и
 * филиал, а состав исполнителей именно этой услуги — матрица
 * `/api/appointments/service-assignments/?branchId=` (тот же кеш, что у
 * счётчика в списке услуг, поэтому счётчик и карточка не могут разойтись).
 *
 * ⚠ Почему не одним запросом: `service-providers/?serviceId=` на проде отдаёт
 * `200 []` для любой услуги и любого филиала — проверено 09.09.2026 (услуги 8,
 * 10, 18, 84 при 11–13 парах в матрице), хотя 27.08.2026 работал. Тикет —
 * `MamaDoc/backend_ticket_service_providers_service_filter_2026-09-09.md`;
 * после починки можно вернуться к одному запросу, но нужды в этом нет.
 *
 * Право — `appointments.view` (не `staff.view`), так что секцию видят и врачи
 * с регистраторами.
 */
export function useServicePerformers(
  serviceId: number | null,
  enabled: boolean = true,
): ServicePerformersResult {
  const canView = useCan("appointments.view");
  const canViewStaff = useCan("staff.view");
  const { activeOrganization, activeBranch } = usePermissions();
  const active = enabled && canView && serviceId != null;

  // Фото — побочное украшение: справочник тянем только если он и так доступен.
  const { employees } = useAllActiveEmployees(active && canViewStaff);

  const query = useQuery({
    queryKey: djangoQueryKeys.appointments.serviceProvidersInBranch(
      activeOrganization?.id ?? null,
      activeBranch?.id ?? null,
    ),
    queryFn: ({ signal }) =>
      getServiceProviders({ branchId: activeBranch?.id ?? undefined }, signal),
    enabled: active,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const {
    employeeIdsByService,
    isLoading: matrixLoading,
    isError: matrixError,
  } = useServiceAssignmentCounts(active);

  const performers = React.useMemo(() => {
    if (!query.data || serviceId == null) return EMPTY;
    const assigned = employeeIdsByService.get(serviceId);
    if (!assigned || assigned.length === 0) return EMPTY;
    const assignedIds = new Set(assigned);
    const photoById = new Map(employees.map((e) => [e.id, e.photoUrl]));
    return query.data
      .filter((provider) => assignedIds.has(provider.id))
      .map((provider) => ({
        ...provider,
        photoUrl: photoById.get(provider.id) ?? null,
        branchIsForeign:
          provider.branch != null &&
          activeBranch?.id != null &&
          provider.branch.id !== activeBranch.id,
      }));
  }, [query.data, employeeIdsByService, serviceId, employees, activeBranch?.id]);

  return {
    performers,
    isLoading: active && (query.isLoading || matrixLoading),
    isError: query.isError || matrixError,
    canView,
  };
}

/**
 * Персональные цена и длительность сотрудника у этой услуги — то, чего нет в
 * `service-providers`. Ходим точечно, только за видимыми строками секции и
 * только по `staff.view`; ответ кешируется на сотрудника и переиспользуется
 * между услугами.
 */
export function useEmployeeServiceOverride(
  employeeId: number,
  serviceId: number | null,
  enabled: boolean = true,
): { priceOverride: string | null; durationOverrideMinutes: number | null } {
  const canViewStaff = useCan("staff.view");
  const { activeOrganization } = usePermissions();

  const query = useQuery({
    queryKey: djangoQueryKeys.staff.employeeServices(
      activeOrganization?.id ?? null,
      employeeId,
    ),
    queryFn: ({ signal }) => getEmployeeServices(employeeId, signal),
    enabled: enabled && canViewStaff && employeeId > 0 && serviceId != null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    // Сотрудник вне филиального скоупа зрителя отдаёт 404 — для чипов это не
    // ошибка, просто нет данных.
    retry: false,
  });

  const assignment = query.data?.find((a) => a.service.id === serviceId && a.isActive);
  return {
    priceOverride: assignment?.priceOverride ?? null,
    durationOverrideMinutes: assignment?.durationOverrideMinutes ?? null,
  };
}

export default useServicePerformers;
