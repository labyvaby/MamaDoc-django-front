export const DJANGO_LIST_STALE_TIME_MS = 30_000;
export const DJANGO_REFERENCE_STALE_TIME_MS = 10 * 60_000;
export const DJANGO_DETAIL_STALE_TIME_MS = 60_000;
export const DJANGO_POLL_INTERVAL_MS = 30_000;

export const djangoQueryKeys = {
  all: ["django"] as const,

  appointments: {
    all: ["django", "appointments"] as const,
    list: (params: Record<string, unknown>) =>
      ["django", "appointments", "list", params] as const,
    dayCounts: (params: Record<string, unknown>) =>
      ["django", "appointments", "day-counts", params] as const,
    serviceProviders: () =>
      ["django", "appointments", "service-providers"] as const,
    formData: (context: { orgId?: number | null; branchId?: number | null } = {}) =>
      ["django", "appointments", "form-data", context] as const,
    payments: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "payments"] as const,
    conclusionSlots: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "conclusion-slots"] as const,
  },

  patients: {
    balance: (patientId: number) =>
      ["django", "patients", patientId, "balance"] as const,
    transactions: (patientId: number) =>
      ["django", "patients", patientId, "balance-transactions"] as const,
  },

  cashbox: {
    summary: (filters: Record<string, unknown>) =>
      ["django", "cashbox", "summary", filters] as const,
    entries: (entryType: string, filters: Record<string, unknown>) =>
      ["django", "cashbox", "entries", entryType, filters] as const,
  },

  expenses: {
    all: ["django", "expenses"] as const,
    list: (filters: Record<string, unknown>) =>
      ["django", "expenses", "list", filters] as const,
    categories: (organizationId: number | null | undefined) =>
      ["django", "expenses", "categories", organizationId ?? null] as const,
  },

  shifts: {
    current: (filters: Record<string, unknown>) =>
      ["django", "shifts", "current", filters] as const,
    list: (filters: Record<string, unknown>) =>
      ["django", "shifts", "list", filters] as const,
    summary: (id: number) =>
      ["django", "shifts", id, "summary"] as const,
    all: ["django", "shifts"] as const,
  },

  organization: {
    branches: ["django", "organization", "branches"] as const,
  },

  catalog: {
    services: (context: { orgId?: number | null; branchId?: number | null } = {}) =>
      ["django", "catalog", "services", context] as const,
  },

  reference: {
    patients: ["django", "reference", "patients"] as const,
    employees: ["django", "reference", "employees"] as const,
    services: (context: { orgId?: number | null; branchId?: number | null } = {}) =>
      ["django", "reference", "services", context] as const,
  },
};
