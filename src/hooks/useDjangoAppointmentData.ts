import React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getPatients, type DjangoPatient } from "../api/patients";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../api/staff";
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

export interface DjangoEmployeeWithServices extends DjangoEmployeeListItem {
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
 * Loads patients, employees, services, and the service↔employee assignment
 * matrix for the appointment form. ``branchId`` narrows services and the
 * matrix to the specified branch (matching appointment save-time validation).
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
      const [rawPatients, rawEmployees, rawServices, rawAssignments] = await Promise.all([
        getPatients(signal),
        getDjangoEmployees({ branchId: branchId ?? undefined }, signal),
        getServices(branchId ?? null, signal),
        getServiceAssignments(branchId ?? undefined, signal),
      ]);
      return { rawPatients, rawEmployees, rawServices, rawAssignments };
    },
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const patients = dataQuery.data?.rawPatients ?? [];

  const { employees, services, empByService, svcByEmployee } = React.useMemo(() => {
    const rawEmployees = dataQuery.data?.rawEmployees?.results ?? [];
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

    const enrichedEmployees: DjangoEmployeeWithServices[] = rawEmployees.map((emp) => ({
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
    dataQuery.data?.rawEmployees,
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
      return svcByEmployee.get(employeeId)?.has(serviceId) ?? false;
    },
    [svcByEmployee],
  );

  return {
    patients,
    employees,
    services,
    serviceProviders: [],
    loading: dataQuery.isLoading,
    error: dataQuery.error instanceof Error ? dataQuery.error.message : null,
    getEmployeesForService,
    getServicesForEmployee,
    canEmployeeProvideService,
  };
}

// ── Per-serviceId lazy hook ───────────────────────────────────────────────────

/**
 * Fetches service-providers for a specific serviceId.
 * Only fires when serviceId is non-null and drawerOpen is true.
 */
export function useServiceProvidersForService(
  serviceId: number | null,
  drawerOpen: boolean,
): { providers: ServiceProvider[]; loading: boolean } {
  const q = useQuery({
    queryKey: [...djangoQueryKeys.appointments.serviceProviders(), serviceId],
    queryFn: ({ signal }) => getServiceProviders({ serviceId: serviceId! }, signal),
    enabled: drawerOpen && serviceId !== null,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  return { providers: q.data ?? [], loading: q.isLoading };
}
