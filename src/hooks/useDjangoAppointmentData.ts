import React from "react";
import { getPatients, type DjangoPatient } from "../api/patients";
import { getDjangoEmployees, getEmployeeServices, type DjangoEmployee, type EmployeeServiceAssignment } from "../api/staff";
import { getServices, type Service as CatalogService } from "../api/catalog";

// ── Public types ──────────────────────────────────────────────────────────────

/** Employee enriched with their active service assignments. */
export interface DjangoEmployeeWithServices extends DjangoEmployee {
  serviceAssignments: EmployeeServiceAssignment[];
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
  loading: boolean;
  error: string | null;
  /**
   * Given a selected serviceId, returns only employees who have an active
   * assignment for that service.  Returns all employees when serviceId is null.
   */
  getEmployeesForService(serviceId: number | null): DjangoEmployeeWithServices[];
  /**
   * Given a selected employeeId, returns only services that employee is
   * actively assigned to.  Returns all services when employeeId is null.
   */
  getServicesForEmployee(employeeId: number | null): DjangoCatalogServiceWithEmployees[];
  /**
   * Returns true if the employee can provide the service (has an active
   * EmployeeService assignment).  Always true if either arg is null.
   */
  canEmployeeProvideService(employeeId: number | null, serviceId: number | null): boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function useDjangoAppointmentData(enabled: boolean): UseDjangoAppointmentDataResult {
  const [patients, setPatients] = React.useState<DjangoPatient[]>([]);
  const [employees, setEmployees] = React.useState<DjangoEmployeeWithServices[]>([]);
  const [services, setServices] = React.useState<DjangoCatalogServiceWithEmployees[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        // Load base data in parallel
        const [rawPatients, rawEmployees, rawServices] = await Promise.all([
          getPatients(),
          getDjangoEmployees(),
          getServices(),
        ]);

        if (cancelled) return;

        // Load service assignments for every employee in parallel
        const assignmentResults = await Promise.allSettled(
          rawEmployees.map((emp) => getEmployeeServices(emp.id)),
        );

        if (cancelled) return;

        // Build employee list enriched with assignments
        const enrichedEmployees: DjangoEmployeeWithServices[] = rawEmployees.map(
          (emp, idx) => {
            const result = assignmentResults[idx];
            const assignments =
              result.status === "fulfilled" ? result.value : [];
            return {
              ...emp,
              serviceAssignments: assignments.filter((a) => a.isActive),
            };
          },
        );

        // Build a map: catalogServiceId → Set<employeeId>
        const serviceToEmployees = new Map<number, Set<number>>();
        for (const emp of enrichedEmployees) {
          for (const asgn of emp.serviceAssignments) {
            const sid = asgn.service.id;
            if (!serviceToEmployees.has(sid)) {
              serviceToEmployees.set(sid, new Set());
            }
            serviceToEmployees.get(sid)!.add(emp.id);
          }
        }

        // Enrich catalog services
        const enrichedServices: DjangoCatalogServiceWithEmployees[] = rawServices
          .filter((s) => s.isActive)
          .map((s) => ({
            ...s,
            assignedEmployeeIds: Array.from(serviceToEmployees.get(s.id) ?? []),
          }));

        setPatients(rawPatients);
        setEmployees(enrichedEmployees);
        setServices(enrichedServices);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  const getEmployeesForService = React.useCallback(
    (serviceId: number | null): DjangoEmployeeWithServices[] => {
      if (serviceId === null) return employees;
      return employees.filter((emp) =>
        emp.serviceAssignments.some((a) => a.service.id === serviceId),
      );
    },
    [employees],
  );

  const getServicesForEmployee = React.useCallback(
    (employeeId: number | null): DjangoCatalogServiceWithEmployees[] => {
      if (employeeId === null) return services;
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return [];
      const assignedIds = new Set(emp.serviceAssignments.map((a) => a.service.id));
      return services.filter((s) => assignedIds.has(s.id));
    },
    [employees, services],
  );

  const canEmployeeProvideService = React.useCallback(
    (employeeId: number | null, serviceId: number | null): boolean => {
      if (employeeId === null || serviceId === null) return true;
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return false;
      return emp.serviceAssignments.some((a) => a.service.id === serviceId);
    },
    [employees],
  );

  return {
    patients,
    employees,
    services,
    loading,
    error,
    getEmployeesForService,
    getServicesForEmployee,
    canEmployeeProvideService,
  };
}
