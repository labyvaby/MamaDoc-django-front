import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getServiceProviders,
  type ServiceProvider,
} from "../api/appointments";
import { getEmployeeServices } from "../api/staff";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { useAllActiveEmployees } from "./useAllActiveEmployees";
import { useActiveScope } from "./useActiveScope";
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
 * Один запрос `/api/appointments/service-providers/?serviceId=&branchId=`: он
 * считает состав по той же матрице назначений, что и `service-assignments`,
 * включая разбор старых общих привязок (`branch: null`) — правила филиала
 * знает только бэк, повторить их на фронте нельзя.
 *
 * Фильтр по услуге выложен на прод 10.09.2026 (до этого отдавал `200 []` для
 * любой услуги, и секция собиралась пересечением bulk-выдачи с матрицей).
 * Проверено под сессией на newcrm.pediatr.kg: состав совпал с матрицей на всех
 * 36 услугах орг 1, у которых есть назначения, — фолбэк снят.
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
  const { organizationId, branchId, orgReady } = useActiveScope();
  const active = enabled && canView && orgReady && serviceId != null;

  // Фото — побочное украшение: справочник тянем только если он и так доступен.
  const { employees } = useAllActiveEmployees(active && canViewStaff);

  const query = useQuery({
    queryKey: djangoQueryKeys.appointments.serviceProvidersForService(
      organizationId ?? null,
      branchId ?? null,
      serviceId,
    ),
    queryFn: ({ signal }) =>
      getServiceProviders({ serviceId: serviceId!, branchId, organizationId }, signal),
    enabled: active,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const performers = React.useMemo(() => {
    const source = query.data;
    if (!source || source.length === 0) return EMPTY;
    const photoById = new Map(employees.map((e) => [e.id, e.photoUrl]));
    return source.map((provider) => ({
      ...provider,
      photoUrl: photoById.get(provider.id) ?? null,
      branchIsForeign:
        provider.branch != null && branchId != null && provider.branch.id !== branchId,
    }));
  }, [query.data, employees, branchId]);

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
