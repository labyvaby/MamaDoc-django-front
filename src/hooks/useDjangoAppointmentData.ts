import React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type DjangoPatient } from "../api/patients";
import { getServices, type Service as CatalogService } from "../api/catalog";
import {
  getServiceAssignments,
  getServiceProviders,
  type ServiceProvider,
} from "../api/appointments";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../api/queryKeys";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Performer option for the appointment form. Sourced from
 * /appointments/service-providers/ (bulk mode) — NOT /staff/employees/,
 * because clinicians (nurse/doctor) have appointments.view but no staff.view.
 */
export interface DjangoEmployeeWithServices extends ServiceProvider {
  assignedServiceIds: Set<number>;
}

export interface DjangoCatalogServiceWithEmployees extends CatalogService {
  assignedEmployeeIds: number[];
}

export interface UseDjangoAppointmentDataResult {
  patients: DjangoPatient[];
  employees: DjangoEmployeeWithServices[];
  services: DjangoCatalogServiceWithEmployees[];
  /** Unused — kept for backward compat; the matrix comes via service-assignments. */
  serviceProviders: ServiceProvider[];
  loading: boolean;
  error: string | null;
  /** Employees who provide the service (all employees when serviceId is null). */
  getEmployeesForService(serviceId: number | null): DjangoEmployeeWithServices[];
  /** Services the employee provides (all services when employeeId is null). */
  getServicesForEmployee(employeeId: number | null): DjangoCatalogServiceWithEmployees[];
  canEmployeeProvideService(employeeId: number | null, serviceId: number | null): boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Loads performers, services, and the service↔employee assignment matrix for
 * the appointment form. ``branchId`` narrows services and the matrix to the
 * specified branch (matching appointment save-time validation). Everything is
 * fetched through appointments/catalog endpoints. The catalog is optional:
 * clinicians may have appointments.view without catalog.view, and the
 * appointment form must still be able to edit an existing visit.
 */
export function useDjangoAppointmentData(
  enabled: boolean,
  branchId?: number | null,
  orgId?: number | null,
  membershipId?: number | null,
): UseDjangoAppointmentDataResult {
  const ctx = { orgId: orgId ?? null, branchId: branchId ?? null, membershipId: membershipId ?? null };

  const dataQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.formData(ctx),
    queryFn: async ({ signal }) => {
      // NOTE: patients are intentionally NOT loaded here — the table can have
      // tens of thousands of rows. The Add/Edit appointment drawers query
      // patients server-side via searchPatients() as the user types.
      // Performers come from the appointments-scoped service-providers
      // endpoint (bulk mode), NOT /staff/employees/ — clinicians lack
      // staff.view and were getting 403 on opening the form.
      // Do not let a forbidden catalog request discard the appointment-scoped
      // provider/matrix responses. A clinician can edit appointments without
      // having access to the full catalog page (catalog.view).
      const [providersResult, servicesResult, assignmentsResult] =
        await Promise.allSettled([
        getServiceProviders({ branchId: branchId ?? undefined }, signal),
        // ⚠ /catalog/services/ отвечает 404 «branchId не совпадает с активным
        // филиалом», если филиал запроса не равен филиалу сессии (проверено на
        // проде 14.08.2026). Форму приёма чужого филиала (режим «Все филиалы»,
        // суперпользователь) это оставило бы вообще без услуг, поэтому при
        // отказе повторяем без филиала — список шире, но форма работает.
        getServices(branchId ?? null, undefined, signal).catch(() =>
          branchId == null ? [] : getServices(null, undefined, signal),
        ),
        getServiceAssignments(branchId ?? undefined, signal),
      ]);

      const rawProviders =
        providersResult.status === "fulfilled" ? providersResult.value : [];
      const rawServices =
        servicesResult.status === "fulfilled" ? servicesResult.value : [];
      const rawAssignments =
        assignmentsResult.status === "fulfilled" ? assignmentsResult.value : [];
      const referenceError =
        providersResult.status === "rejected"
          ? providersResult.reason
          : assignmentsResult.status === "rejected"
            ? assignmentsResult.reason
            : null;

      return {
        rawProviders,
        rawServices,
        rawAssignments,
        assignmentsLoaded: assignmentsResult.status === "fulfilled",
        referenceError:
          referenceError instanceof Error ? referenceError.message : null,
      };
    },
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Kept for backward compatibility with the result type; always empty now.
  const patients: DjangoPatient[] = [];

  const { employees, services, empByService, svcByEmployee } = React.useMemo(() => {
    const rawProviders = dataQuery.data?.rawProviders ?? [];
    const rawServices = dataQuery.data?.rawServices ?? [];
    const pairs = dataQuery.data?.rawAssignments ?? [];

    // Build both directions of the service↔employee matrix once.
    const empByService = new Map<number, Set<number>>();
    const svcByEmployee = new Map<number, Set<number>>();
    for (const { serviceId, employeeId } of pairs) {
      let emps = empByService.get(serviceId);
      if (!emps) empByService.set(serviceId, (emps = new Set<number>()));
      emps.add(employeeId);
      let svcs = svcByEmployee.get(employeeId);
      if (!svcs) svcByEmployee.set(employeeId, (svcs = new Set<number>()));
      svcs.add(serviceId);
    }

    const enrichedEmployees: DjangoEmployeeWithServices[] = rawProviders.map((emp) => ({
      ...emp,
      assignedServiceIds: svcByEmployee.get(emp.id) ?? new Set<number>(),
    }));

    const enrichedServices: DjangoCatalogServiceWithEmployees[] = rawServices
      .filter((s) => s.isActive)
      .map((s) => ({
        ...s,
        assignedEmployeeIds: [...(empByService.get(s.id) ?? [])],
      }));

    return {
      employees: enrichedEmployees,
      services: enrichedServices,
      empByService,
      svcByEmployee,
    };
  }, [
    dataQuery.data?.rawProviders,
    dataQuery.data?.rawServices,
    dataQuery.data?.rawAssignments,
  ]);

  const getEmployeesForService = React.useCallback(
    (serviceId: number | null): DjangoEmployeeWithServices[] => {
      if (serviceId === null) return employees;
      const allowed = empByService.get(serviceId);
      if (!allowed) return [];
      return employees.filter((e) => allowed.has(e.id));
    },
    [employees, empByService],
  );

  const getServicesForEmployee = React.useCallback(
    (employeeId: number | null): DjangoCatalogServiceWithEmployees[] => {
      if (employeeId === null) return services;
      const allowed = svcByEmployee.get(employeeId);
      if (!allowed) return [];
      return services.filter((s) => allowed.has(s.id));
    },
    [services, svcByEmployee],
  );

  const canEmployeeProvideService = React.useCallback(
    (employeeId: number | null, serviceId: number | null): boolean => {
      if (employeeId === null || serviceId === null) return true;
      // If the matrix request failed, defer the authoritative validation to
      // the backend instead of showing a false performer mismatch locally.
      if (dataQuery.data && !dataQuery.data.assignmentsLoaded) return true;
      return svcByEmployee.get(employeeId)?.has(serviceId) ?? false;
    },
    [dataQuery.data, svcByEmployee],
  );

  return {
    patients,
    employees,
    services,
    serviceProviders: [],
    loading: dataQuery.isLoading,
    error:
      dataQuery.error instanceof Error
        ? dataQuery.error.message
        : dataQuery.data?.referenceError ?? null,
    getEmployeesForService,
    getServicesForEmployee,
    canEmployeeProvideService,
  };
}

// ── Per-serviceId lazy hook ───────────────────────────────────────────────────

/**
 * Fetches service-providers for a specific serviceId.
 * Only fires when serviceId is non-null and drawerOpen is true.
 *
 * branchId обязателен: без него эндпоинт отдаёт исполнителей всех филиалов
 * организации, и они попадают в пикер (батч-режим выше его передаёт).
 */
export function useServiceProvidersForService(
  serviceId: number | null,
  drawerOpen: boolean,
  branchId: number | null,
): { providers: ServiceProvider[]; loading: boolean } {
  const q = useQuery({
    queryKey: [...djangoQueryKeys.appointments.serviceProviders(), serviceId, branchId],
    queryFn: ({ signal }) =>
      getServiceProviders(
        { serviceId: serviceId!, branchId: branchId ?? undefined },
        signal,
      ),
    enabled: drawerOpen && serviceId !== null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  return { providers: q.data ?? [], loading: q.isLoading };
}
