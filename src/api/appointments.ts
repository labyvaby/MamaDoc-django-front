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

// ── API functions ─────────────────────────────────────────────────────────────

export function getAppointments(params?: {
  date?: string;
  status?: string;
  search?: string;
  branchId?: number;
}): Promise<DjangoAppointment[]> {
  const query = new URLSearchParams();
  if (params?.date) query.set("date", params.date);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.branchId) query.set("branchId", String(params.branchId));
  const qs = query.toString();
  return apiRequest<DjangoAppointment[]>(`/appointments/${qs ? `?${qs}` : ""}`);
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
