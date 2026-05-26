import { apiRequest } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export type PatientGender = "male" | "female" | "unknown";

export interface DjangoPatient {
  id: number;
  organizationId: number;
  branch: { id: number; name: string } | null;
  fullName: string;
  phone: string;
  secondaryPhone: string | null;
  birthDate: string | null;
  gender: PatientGender;
  address: string | null;
  notes: string | null;
  source: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ───────────────────────────────────────────────────────────────

export interface CreatePatientPayload {
  organizationId?: number | null;
  branchId?: number | null;
  fullName: string;
  phone: string;
  secondaryPhone?: string | null;
  birthDate?: string | null;
  gender?: PatientGender;
  address?: string | null;
  notes?: string | null;
  source?: string | null;
  isActive?: boolean;
}

export type UpdatePatientPayload = Partial<Omit<CreatePatientPayload, "organizationId">>;

// ── API functions ──────────────────────────────────────────────────────────

export function getPatients(): Promise<DjangoPatient[]> {
  return apiRequest<DjangoPatient[]>("/patients/");
}

export function getPatient(id: number): Promise<DjangoPatient> {
  return apiRequest<DjangoPatient>(`/patients/${id}/`);
}

export function createPatient(payload: CreatePatientPayload): Promise<DjangoPatient> {
  return apiRequest<DjangoPatient>("/patients/", {
    method: "POST",
    body: payload,
  });
}

export function updatePatient(
  id: number,
  payload: UpdatePatientPayload,
): Promise<DjangoPatient> {
  return apiRequest<DjangoPatient>(`/patients/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}
