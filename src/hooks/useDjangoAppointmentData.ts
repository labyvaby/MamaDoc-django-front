import React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getPatients, type DjangoPatient } from "../api/patients";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../api/staff";
import { getServices, type Service as CatalogService } from "../api/catalog";
import {
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
  /** Always empty — service-providers are fetched per-serviceId via useServiceProvidersForService. */
  serviceProviders: ServiceProvider[];
  loading: boolean;
  error: string | null;
  /** Returns all employees (no per-service filter without providers data). */
  getEmployeesForService(serviceId: number | null): DjangoEmployeeWithServices[];
  /** Returns all services (no per-employee filter without providers data). */
  getServicesForEmployee(employeeId: number | null): DjangoCatalogServiceWithEmployees[];
  canEmployeeProvideService(employeeId: number | null, serviceId: number | null): boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Loads patients, employees, and services for the appointment form.
 * Does NOT call service-providers (requires serviceId param — see useServiceProvidersForService).
 */
export function useDjangoAppointmentData(enabled: boolean): UseDjangoAppointmentDataResult {
  const dataQuery = useQuery({
    queryKey: djangoQueryKeys.appointments.formData(),
    queryFn: async ({ signal }) => {
      const [rawPatients, rawEmployees, rawServices] = await Promise.all([
        getPatients(signal),
        getDjangoEmployees(undefined, signal),
        getServices(signal),
      ]);
      return { rawPatients, rawEmployees, rawServices };
    },
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const patients = dataQuery.data?.rawPatients ?? [];

  const { employees, services } = React.useMemo(() => {
    const rawEmployees = dataQuery.data?.rawEmployees?.results ?? [];
    const rawServices = dataQuery.data?.rawServices ?? [];

    const enrichedEmployees: DjangoEmployeeWithServices[] = rawEmployees.map((emp) => ({
      ...emp,
      assignedServiceIds: new Set<number>(),
    }));

    const enrichedServices: DjangoCatalogServiceWithEmployees[] = rawServices
      .filter((s) => s.isActive)
      .map((s) => ({
        ...s,
        assignedEmployeeIds: [],
      }));

    return { employees: enrichedEmployees, services: enrichedServices };
  }, [dataQuery.data?.rawEmployees, dataQuery.data?.rawServices]);

  const getEmployeesForService = React.useCallback(
    (_serviceId: number | null): DjangoEmployeeWithServices[] => employees,
    [employees],
  );

  const getServicesForEmployee = React.useCallback(
    (_employeeId: number | null): DjangoCatalogServiceWithEmployees[] => services,
    [services],
  );

  const canEmployeeProvideService = React.useCallback(
    (_employeeId: number | null, _serviceId: number | null): boolean => true,
    [],
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
