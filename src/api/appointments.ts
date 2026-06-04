import { apiRequest, ApiError } from "./client";

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Extract a human-readable message from a backend error response.
 *
 * Supported envelopes (in priority order):
 *   { "error": "…" }                        — single string message
 *   { "detail": [{ "msg": "…" }, …] }       — Django/Pydantic array
 *   { "detail": "…" }                        — DRF string detail
 *   { "errors": { field: [msgs] } }          — field-level validation errors
 */
export function parseBackendError(err: unknown): string {
  if (err instanceof ApiError) {
    const p = err.payload as Record<string, unknown> | null | undefined;
    if (p && typeof p === "object") {
      // { error: "..." }
      if (typeof p.error === "string") return p.error;

      // { detail: [{ msg: "..." }, ...] }  — Django/Pydantic validation list
      if (Array.isArray(p.detail)) {
        const msgs = (p.detail as unknown[])
          .map((item) => {
            if (item && typeof item === "object" && "msg" in item) {
              return String((item as Record<string, unknown>).msg);
            }
            return String(item);
          })
          .filter(Boolean);
        if (msgs.length) return msgs.join("; ");
      }

      // { detail: "..." }  — DRF string detail
      if (typeof p.detail === "string" && p.detail) return p.detail;

      // { errors: { field: [...] } }
      if (p.errors && typeof p.errors === "object") {
        const parts = Object.entries(p.errors as Record<string, unknown>).map(
          ([field, msgs]) => {
            const msgStr = Array.isArray(msgs)
              ? msgs
                  .map((m) =>
                    typeof m === "object" && m !== null
                      ? Object.values(m as Record<string, unknown>).flat().join(", ")
                      : String(m),
                  )
                  .join(", ")
              : String(msgs);
            return field === "__all__" ? msgStr : `${field}: ${msgStr}`;
          },
        );
        if (parts.length) return parts.join("; ");
      }
    }
  }
  return err instanceof Error ? err.message : "Неизвестная ошибка";
}

// ── Nested shapes ─────────────────────────────────────────────────────────────

export interface AppointmentPatientShort {
  id: number;
  fullName: string;
  phone: string;
}

export interface AppointmentEmployeeShort {
  id: number;
  fullName: string;
}

export interface AppointmentServiceShort {
  id: number;
  name: string;
  basePrice: string;
  durationMinutes: number;
}

export interface AppointmentServiceLine {
  id: number;
  service: AppointmentServiceShort;
  employee: AppointmentEmployeeShort;
  /** Effective unit price for this line */
  price: string;
  durationMinutes: number | null;
  quantity: number;
  /** Unit price before any discount (may equal price when no override) */
  unitPrice: string;
  /** Discount amount applied to this line */
  discountAmount: string;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export type DjangoAppointmentStatus =
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface DjangoAppointment {
  id: number;
  organizationId: number;
  branchId: number | null;
  patient: AppointmentPatientShort | null;
  scheduledAt: string;
  isNight: boolean;
  status: DjangoAppointmentStatus;
  complaints: string | null;
  doctorComplaints: string | null;
  adminComment: string | null;
  services: AppointmentServiceLine[];
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  // Payment fields — included in list/detail responses by backend
  paymentStatus?: import("./payments").PaymentStatus;
  paidTotal?: string;
  discountAmount?: string;
  payableAmount?: string;
  debt?: string;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface AppointmentServiceLineCreate {
  serviceId: number;
  employeeId: number;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
}

export interface CreateAppointmentPayload {
  patientId?: number | null;
  branchId?: number | null;
  scheduledAt: string;
  isNight?: boolean;
  isBooking?: boolean;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  services: AppointmentServiceLineCreate[];
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateAppointmentPayload {
  patientId?: number | null;
  scheduledAt?: string;
  isNight?: boolean;
  status?: DjangoAppointmentStatus;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  services?: AppointmentServiceLineCreate[];
}

// ── Service-providers ────────────────────────────────────────────────────────

/**
 * One element returned by GET /api/appointments/service-providers/.
 * Mirrors the backend ServiceProviderPayload (rename='camel').
 */
export interface ServiceProvider {
  employeeId: number;
  employeeFullName: string;
  serviceId: number;
  serviceName: string;
  /** Effective price for this employee/service pair (overridden or base). */
  price: string;
  /** Effective duration in minutes. */
  durationMinutes: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export function getAppointments(params?: {
  /** Filter by exact date YYYY-MM-DD. */
  date?: string;
  /** Filter by date range start YYYY-MM-DD. */
  dateFrom?: string;
  /** Filter by date range end YYYY-MM-DD. */
  dateTo?: string;
  /** Filter by appointment status. */
  status?: string;
  /** Full-text search (patient name / phone). */
  search?: string;
  /** Filter by branch id. */
  branchId?: number;
  /** Filter by employee id. */
  employeeId?: number;
  /** Filter by patient id. */
  patientId?: number;
}, signal?: AbortSignal): Promise<DjangoAppointment[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set("date", params.date);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", String(params.branchId));
  if (params?.employeeId) query.set("employeeId", String(params.employeeId));
  if (params?.patientId) query.set("patientId", String(params.patientId));
  const qs = query.toString();
  return apiRequest<DjangoAppointment[]>(`/appointments/${qs ? `?${qs}` : ""}`, { signal });
}

/**
 * GET /api/appointments/service-providers/
 *
 * Returns all active employee/service pairs visible to the caller,
 * optionally filtered by serviceId and/or branchId.
 * Replaces the N+1 pattern of calling getEmployeeServices() per employee.
 */
export function getServiceProviders(params?: {
  serviceId?: number;
  branchId?: number;
}, signal?: AbortSignal): Promise<ServiceProvider[]> {
  const query = new URLSearchParams();
  if (params?.serviceId) query.set("serviceId", String(params.serviceId));
  if (params?.branchId) query.set("branchId", String(params.branchId));
  const qs = query.toString();
  return apiRequest<ServiceProvider[]>(
    `/appointments/service-providers/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

// ── Day counts ────────────────────────────────────────────────────────────────

/**
 * GET /api/appointments/day-counts/
 * Returns a map of date (YYYY-MM-DD) → count of appointments.
 */
export function getDayCounts(params: {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
}, signal?: AbortSignal): Promise<Record<string, number>> {
  const query = new URLSearchParams();
  query.set("dateFrom", params.dateFrom);
  query.set("dateTo", params.dateTo);
  if (params.branchId) query.set("branchId", String(params.branchId));
  return apiRequest<Record<string, number>>(
    `/appointments/day-counts/?${query.toString()}`,
    { signal },
  );
}

export function getAppointment(id: number): Promise<DjangoAppointment> {
  return apiRequest<DjangoAppointment>(`/appointments/${id}/`);
}

export function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<DjangoAppointment>("/appointments/", {
    method: "POST",
    body: payload,
  });
}

export function updateAppointment(
  id: number,
  payload: UpdateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<DjangoAppointment>(`/appointments/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}
