import { apiRequest } from "./client";

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
  price: string;
  durationMinutes: number | null;
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
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface AppointmentServiceLineCreate {
  serviceId: number;
  employeeId: number;
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
}): Promise<DjangoAppointment[]> {
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
  return apiRequest<DjangoAppointment[]>(`/appointments/${qs ? `?${qs}` : ""}`);
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
}): Promise<ServiceProvider[]> {
  const query = new URLSearchParams();
  if (params?.serviceId) query.set("serviceId", String(params.serviceId));
  if (params?.branchId) query.set("branchId", String(params.branchId));
  const qs = query.toString();
  return apiRequest<ServiceProvider[]>(
    `/appointments/service-providers/${qs ? `?${qs}` : ""}`,
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
