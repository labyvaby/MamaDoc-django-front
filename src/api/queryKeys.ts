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
    formData: () =>
      ["django", "appointments", "form-data"] as const,
    payments: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "payments"] as const,
    conclusionSlots: (appointmentId: number) =>
      ["django", "appointments", appointmentId, "conclusion-slots"] as const,
  },

  reference: {
    patients: ["django", "reference", "patients"] as const,
    employees: ["django", "reference", "employees"] as const,
    services: ["django", "reference", "services"] as const,
  },
};
