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
import { useActiveScope } from "./useActiveScope";
import { usePermissions } from "./usePermissions";
import { useCan } from "./useCan";

const EMPTY: ServicePerformer[] = [];
const EMPTY_IDS: number[] = [];
const EMPTY_PROVIDERS: ServiceProvider[] = [];

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
 * Основной источник — один запрос `/api/appointments/service-providers/
 * ?serviceId=&branchId=`: с 09.09.2026 он считает состав по той же матрице
 * назначений, что и `service-assignments`, включая разбор старых общих
 * привязок (`branch: null`) — правила филиала знает только бэк, повторить их
 * на фронте нельзя.
 *
 * ⚠ Фолбэк: на проде (`newcrm.pediatr.kg`) этот режим всё ещё отдаёт `200 []`
 * для любой услуги — выложена версия без правки (перепроверено 09.09.2026;
 * на test состав совпал с матрицей на 10 услугах из 10). Поэтому пустой ответ
 * при непустой матрице считаем не «нет исполнителей», а признаком старого
 * бэка и собираем секцию как раньше: bulk `service-providers/?branchId=` ∩
 * `service-assignments/?branchId=` (тот же кеш, что у счётчика в списке услуг,
 * поэтому счётчик и карточка не расходятся). Фолбэк и `serviceProvidersInBranch`
 * удалить после выкладки на прод.
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

  // Матрица нужна и как источник фолбэка, и как признак, что услуга вообще
  // кому-то назначена: это тот же запрос, что уже держит счётчик в списке.
  const { employeeIdsByService, isLoading: matrixLoading } = useServiceAssignmentCounts(active);

  const assignedIds = React.useMemo(
    () => (serviceId == null ? EMPTY_IDS : employeeIdsByService.get(serviceId) ?? EMPTY_IDS),
    [employeeIdsByService, serviceId],
  );
  const emptyForService = active && query.data != null && query.data.length === 0;
  const needsFallback = emptyForService && assignedIds.length > 0;

  const fallbackQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.serviceProvidersInBranch(
      organizationId ?? null,
      branchId ?? null,
    ),
    queryFn: ({ signal }) => getServiceProviders({ branchId, organizationId }, signal),
    enabled: needsFallback,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const performers = React.useMemo(() => {
    const source = needsFallback
      ? (fallbackQuery.data ?? EMPTY_PROVIDERS).filter((provider) =>
          assignedIds.includes(provider.id),
        )
      : query.data;
    if (!source || source.length === 0) return EMPTY;
    const photoById = new Map(employees.map((e) => [e.id, e.photoUrl]));
    return source.map((provider) => ({
      ...provider,
      photoUrl: photoById.get(provider.id) ?? null,
      branchIsForeign:
        provider.branch != null && branchId != null && provider.branch.id !== branchId,
    }));
  }, [needsFallback, fallbackQuery.data, query.data, assignedIds, employees, branchId]);

  return {
    performers,
    // Матрицу ждём только когда основной запрос вернул пусто: иначе ещё не
    // известно, «некому оказывать» это или старый бэк, и секция мигнула бы
    // пустотой. Ошибка матрицы сама по себе секцию не ломает — она нужна лишь
    // для решения о фолбэке.
    isLoading:
      active &&
      (query.isLoading ||
        (emptyForService && matrixLoading) ||
        (needsFallback && fallbackQuery.isLoading)),
    isError: query.isError || (needsFallback && fallbackQuery.isError),
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
