import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getServiceProviders,
  type ServiceProvider,
} from "../api/appointments";
import { getEmployeeServices } from "../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { useAllActiveEmployees } from "./useAllActiveEmployees";
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
 * Источник — `/api/appointments/service-providers/?serviceId=`: один запрос,
 * право `appointments.view` (не `staff.view`), так что секцию видят и врачи с
 * регистраторами. Филиал сужает выдачу до исполнителей этого филиала —
 * проверено на проде 27.08.2026: услуга 8 даёт 11 без филиала, 10 в филиале 1
 * и 9 в филиале 12.
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
    queryKey: djangoQueryKeys.appointments.servicePerformers(
      activeOrganization?.id ?? null,
      activeBranch?.id ?? null,
      serviceId,
    ),
    queryFn: ({ signal }) =>
      getServiceProviders(
        { serviceId: serviceId ?? undefined, branchId: activeBranch?.id ?? undefined },
        signal,
      ),
    enabled: active,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const performers = React.useMemo(() => {
    if (!query.data) return EMPTY;
    const photoById = new Map(employees.map((e) => [e.id, e.photoUrl]));
    return query.data.map((provider) => ({
      ...provider,
      photoUrl: photoById.get(provider.id) ?? null,
      branchIsForeign:
        provider.branch != null &&
        activeBranch?.id != null &&
        provider.branch.id !== activeBranch.id,
    }));
  }, [query.data, employees, activeBranch?.id]);

  return {
    performers,
    isLoading: active && query.isLoading,
    isError: query.isError,
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
