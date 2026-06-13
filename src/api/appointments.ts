import dayjs from "dayjs";
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
  service: AppointmentServiceShort | null;
  employee: AppointmentEmployeeShort | null;
  /** Effective unit price for this line */
  price: string;
  /** Duration snapshot — always set after migration 0012 */
  durationMinutes: number;
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

// Raw shape as the backend actually sends it (snake_case fields that differ from our type)
interface RawAppointment {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Normalize a raw backend appointment object to DjangoAppointment.
 *
 * Backend contract differences:
 *   startsAt      → scheduledAt
 *   serviceLines  → services
 *   status "canceled" (1 l) → "cancelled" (2 l)
 */
function normalizeAppointment(raw: RawAppointment): DjangoAppointment {
  // field renames
  const scheduledAt: string = raw.scheduledAt ?? raw.startsAt ?? "";
  const services: AppointmentServiceLine[] = Array.isArray(raw.services)
    ? raw.services
    : Array.isArray(raw.serviceLines)
    ? raw.serviceLines
    : [];
  // backend typo: "canceled" → our canonical "cancelled"
  const rawStatus: string = raw.status ?? "scheduled";
  const status = (rawStatus === "canceled" ? "cancelled" : rawStatus) as DjangoAppointmentStatus;

  return {
    ...raw,
    scheduledAt,
    services,
    status,
  } as DjangoAppointment;
}

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
  // Medical conclusion flag — true if the appointment has at least one conclusion
  hasMedicalConclusion?: boolean;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface AppointmentServiceLineCreate {
  /** When set, identifies an existing line to update in-place (diff semantics). */
  id?: number | null;
  serviceId: number;
  employeeId: number | null;
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

// ── Request denormalization ───────────────────────────────────────────────────

/** Backend service line shape (write path). */
interface BackendServiceLine {
  id?: number;
  serviceId: number;
  employeeId: number | null;
  quantity?: number;
  unitPrice?: string;
  discountAmount?: string;
}

/** Backend create body shape. */
interface BackendCreateBody {
  patientId?: number | null;
  branchId?: number | null;
  startsAt: string;
  isNight?: boolean;
  isBooking?: boolean;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  serviceLines: BackendServiceLine[];
}

/** Backend update body shape (all fields optional). */
interface BackendUpdateBody {
  patientId?: number | null;
  branchId?: number | null;
  startsAt?: string;
  isNight?: boolean;
  isBooking?: boolean;
  status?: string;
  complaints?: string | null;
  doctorComplaints?: string | null;
  adminComment?: string | null;
  serviceLines?: BackendServiceLine[];
}

function toBackendServiceLines(services: AppointmentServiceLineCreate[]): BackendServiceLine[] {
  return services.map(({ id, serviceId, employeeId, quantity, unitPrice, discountAmount }) => {
    const line: BackendServiceLine = { serviceId, employeeId: employeeId ?? null };
    if (id != null) line.id = id;
    if (quantity !== undefined) line.quantity = quantity;
    if (unitPrice !== undefined && unitPrice !== "") line.unitPrice = unitPrice;
    if (discountAmount !== undefined && discountAmount !== "") line.discountAmount = discountAmount;
    return line;
  });
}

function denormalizeCreatePayload(payload: CreateAppointmentPayload): BackendCreateBody {
  if (!payload.scheduledAt) throw new Error("scheduledAt обязателен");
  const startsAt = dayjs(payload.scheduledAt).toISOString();
  const body: BackendCreateBody = {
    startsAt,
    serviceLines: toBackendServiceLines(payload.services),
  };
  if (payload.patientId !== undefined) body.patientId = payload.patientId;
  if (payload.branchId !== undefined) body.branchId = payload.branchId;
  if (payload.isNight !== undefined) body.isNight = payload.isNight;
  if (payload.isBooking !== undefined) body.isBooking = payload.isBooking;
  if (payload.complaints !== undefined) body.complaints = payload.complaints;
  if (payload.doctorComplaints !== undefined) body.doctorComplaints = payload.doctorComplaints;
  if (payload.adminComment !== undefined) body.adminComment = payload.adminComment;
  return body;
}

function denormalizeUpdatePayload(payload: UpdateAppointmentPayload): BackendUpdateBody {
  const body: BackendUpdateBody = {};
  if (payload.patientId !== undefined) body.patientId = payload.patientId;
  if (payload.isNight !== undefined) body.isNight = payload.isNight;
  if (payload.complaints !== undefined) body.complaints = payload.complaints;
  if (payload.doctorComplaints !== undefined) body.doctorComplaints = payload.doctorComplaints;
  if (payload.adminComment !== undefined) body.adminComment = payload.adminComment;
  // status: map "cancelled" → "canceled" for backend
  if (payload.status !== undefined) {
    body.status = payload.status === "cancelled" ? "canceled" : payload.status;
  }
  if (payload.scheduledAt) {
    body.startsAt = dayjs(payload.scheduledAt).toISOString();
  }
  if (payload.services !== undefined) {
    body.serviceLines = toBackendServiceLines(payload.services);
  }
  return body;
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
  /** Filter by employee id, or "me" for the signed-in doctor's own appointments. */
  employeeId?: number | "me";
  /** Filter by patient id. */
  patientId?: number;
}, signal?: AbortSignal): Promise<DjangoAppointment[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set("date", params.date);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  // backend uses single-l "canceled"; normalize before sending
  if (params?.status) query.set("status", params.status === "cancelled" ? "canceled" : params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", String(params.branchId));
  if (params?.employeeId) query.set("employeeId", String(params.employeeId));
  if (params?.patientId) query.set("patientId", String(params.patientId));
  const qs = query.toString();
  return apiRequest<RawAppointment[]>(`/appointments/${qs ? `?${qs}` : ""}`, { signal }).then(
    (list) => (Array.isArray(list) ? list : []).map(normalizeAppointment),
  );
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
  ).then((items) => (Array.isArray(items) ? items : []));
}

// ── Service-assignments (bulk service↔employee matrix) ───────────────────────

/** One active service↔employee pair from GET /api/appointments/service-assignments/. */
export interface ServiceAssignment {
  serviceId: number;
  employeeId: number;
}

/**
 * GET /api/appointments/service-assignments/
 * Bulk matrix of active service↔employee pairs powering the appointment-form
 * filter (service→doctors and doctor→services). ``branchId`` narrows to pairs
 * usable in that branch, matching appointment save-time validation.
 */
export function getServiceAssignments(
  branchId?: number,
  signal?: AbortSignal,
): Promise<ServiceAssignment[]> {
  const query = new URLSearchParams();
  if (branchId != null) query.set("branchId", String(branchId));
  const qs = query.toString();
  return apiRequest<ServiceAssignment[]>(
    `/appointments/service-assignments/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then((list) => (Array.isArray(list) ? list : []));
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
  employeeId?: number | "me";
}, signal?: AbortSignal): Promise<Record<string, number>> {
  const query = new URLSearchParams();
  query.set("dateFrom", params.dateFrom);
  query.set("dateTo", params.dateTo);
  if (params.branchId) query.set("branchId", String(params.branchId));
  if (params.employeeId) query.set("employeeId", String(params.employeeId));
  return apiRequest<Record<string, number>>(
    `/appointments/day-counts/?${query.toString()}`,
    { signal },
  );
}

export function getAppointment(id: number): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(`/appointments/${id}/`).then(normalizeAppointment);
}

export function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>("/appointments/", {
    method: "POST",
    body: denormalizeCreatePayload(payload),
  }).then(normalizeAppointment);
}

export function updateAppointment(
  id: number,
  payload: UpdateAppointmentPayload,
): Promise<DjangoAppointment> {
  return apiRequest<RawAppointment>(`/appointments/${id}/`, {
    method: "PATCH",
    body: denormalizeUpdatePayload(payload),
  }).then(normalizeAppointment);
}

export function deleteAppointment(id: number): Promise<void> {
  return apiRequest<void>(`/appointments/${id}/`, { method: "DELETE" });
}
