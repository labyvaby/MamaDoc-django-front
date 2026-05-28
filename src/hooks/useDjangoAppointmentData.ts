import React from "react";
import { getPatients, type DjangoPatient } from "../api/patients";
import { getDjangoEmployees, type DjangoEmployee } from "../api/staff";
import { getServices, type Service as CatalogService } from "../api/catalog";
import {
  getServiceProviders,
  type ServiceProvider,
} from "../api/appointments";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Employee with the set of service IDs they can actively provide.
 * Built from the /appointments/service-providers/ response.
 */
export interface DjangoEmployeeWithServices extends DjangoEmployee {
  /** Service IDs this employee can actively provide. */
  assignedServiceIds: Set<number>;
}

/** Catalog service enriched with the list of employee IDs that can provide it. */
export interface DjangoCatalogServiceWithEmployees extends CatalogService {
  /** IDs of employees who have an active EmployeeService assignment for this service. */
  assignedEmployeeIds: number[];
}

export interface UseDjangoAppointmentDataResult {
  patients: DjangoPatient[];
  employees: DjangoEmployeeWithServices[];
  services: DjangoCatalogServiceWithEmployees[];
  /** Raw service-provider pairs — useful for price/duration lookup. */
  serviceProviders: ServiceProvider[];
  loading: boolean;
  error: string | null;
  /**
   * Given a selected serviceId, returns only employees who can provide it.
   * Returns all employees when serviceId is null.
   */
  getEmployeesForService(serviceId: number | null): DjangoEmployeeWithServices[];
  /**
   * Given a selected employeeId, returns only services assigned to them.
   * Returns all services when employeeId is null.
   */
  getServicesForEmployee(employeeId: number | null): DjangoCatalogServiceWithEmployees[];
  /**
   * True if the employee can provide the service.
   * Always true when either arg is null.
   */
  canEmployeeProvideService(employeeId: number | null, serviceId: number | null): boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function useDjangoAppointmentData(enabled: boolean): UseDjangoAppointmentDataResult {
  const [patients, setPatients] = React.useState<DjangoPatient[]>([]);
  const [employees, setEmployees] = React.useState<DjangoEmployeeWithServices[]>([]);
  const [services, setServices] = React.useState<DjangoCatalogServiceWithEmployees[]>([]);
  const [serviceProviders, setServiceProviders] = React.useState<ServiceProvider[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        // One round-trip instead of N+1: load patients, employees, services,
        // and all service-provider pairs in a single parallel batch.
        const [rawPatients, rawEmployees, rawServices, rawProviders] =
          await Promise.all([
            getPatients(),
            getDjangoEmployees(),
            getServices(),
            // getServiceProviders replaces N calls to getEmployeeServices(id)
            getServiceProviders(),
          ]);

        if (cancelled) return;

        // Build lookup maps from service-provider pairs
        // employeeId → Set<serviceId>
        const empToServices = new Map<number, Set<number>>();
        // serviceId → Set<employeeId>
        const serviceToEmps = new Map<number, Set<number>>();

        for (const sp of rawProviders) {
          if (!empToServices.has(sp.employeeId)) {
            empToServices.set(sp.employeeId, new Set());
          }
          empToServices.get(sp.employeeId)!.add(sp.serviceId);

          if (!serviceToEmps.has(sp.serviceId)) {
            serviceToEmps.set(sp.serviceId, new Set());
          }
          serviceToEmps.get(sp.serviceId)!.add(sp.employeeId);
        }

        const enrichedEmployees: DjangoEmployeeWithServices[] = rawEmployees.map(
          (emp) => ({
            ...emp,
            assignedServiceIds: empToServices.get(emp.id) ?? new Set(),
          }),
        );

        const enrichedServices: DjangoCatalogServiceWithEmployees[] = rawServices
          .filter((s) => s.isActive)
          .map((s) => ({
            ...s,
            assignedEmployeeIds: Array.from(serviceToEmps.get(s.id) ?? []),
          }));

        setPatients(rawPatients);
        setEmployees(enrichedEmployees);
        setServices(enrichedServices);
        setServiceProviders(rawProviders);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const getEmployeesForService = React.useCallback(
    (serviceId: number | null): DjangoEmployeeWithServices[] => {
      if (serviceId === null) return employees;
      return employees.filter((emp) => emp.assignedServiceIds.has(serviceId));
    },
    [employees],
  );

  const getServicesForEmployee = React.useCallback(
    (employeeId: number | null): DjangoCatalogServiceWithEmployees[] => {
      if (employeeId === null) return services;
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return [];
      return services.filter((s) => emp.assignedServiceIds.has(s.id));
    },
    [employees, services],
  );

  const canEmployeeProvideService = React.useCallback(
    (employeeId: number | null, serviceId: number | null): boolean => {
      if (employeeId === null || serviceId === null) return true;
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return false;
      return emp.assignedServiceIds.has(serviceId);
    },
    [employees],
  );

  return {
    patients,
    employees,
    services,
    serviceProviders,
    loading,
    error,
    getEmployeesForService,
    getServicesForEmployee,
    canEmployeeProvideService,
  };
}
