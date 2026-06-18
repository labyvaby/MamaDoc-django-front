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
  photoUrl: string | null;
  inn: string;
  isBlacklisted: boolean;
  blacklistReason: string;
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
  inn?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isActive?: boolean;
}

export type UpdatePatientPayload = Partial<Omit<CreatePatientPayload, "organizationId">>;

// ── API functions ──────────────────────────────────────────────────────────

export function getPatients(signal?: AbortSignal): Promise<DjangoPatient[]> {
  return apiRequest<DjangoPatient[]>("/patients/", { signal });
}

/**
 * Серверный поиск пациентов (по ФИО или телефону) с лимитом.
 * Для автокомплитов — не тянет всю базу на клиент.
 */
export function searchPatients(
  search: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<DjangoPatient[]> {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  q.set("limit", String(limit));
  return apiRequest<DjangoPatient[]>(`/patients/?${q.toString()}`, { signal });
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

export function uploadPatientPhoto(
  patientId: number,
  file: File,
): Promise<DjangoPatient> {
  const form = new FormData();
  form.append("photo", file);
  return apiRequest<DjangoPatient>(`/patients/${patientId}/photo/`, {
    method: "PUT",
    formData: form,
  });
}

export function deletePatientPhoto(patientId: number): Promise<void> {
  return apiRequest<void>(`/patients/${patientId}/photo/`, {
    method: "DELETE",
  });
}

/**
 * Объединяет дубликат в основного пациента.
 * `primaryId` — карточка, которая останется; `duplicateId` — удаляется,
 * все её приёмы/продажи/баланс переносятся на основного. Возвращает
 * обновлённого основного пациента.
 */
export function mergePatients(
  primaryId: number,
  duplicateId: number,
): Promise<DjangoPatient> {
  return apiRequest<DjangoPatient>(`/patients/${primaryId}/merge/`, {
    method: "POST",
    body: { duplicateId },
  });
}

export function getSimilarPatients(
  phone: string,
  signal?: AbortSignal,
): Promise<DjangoPatient[]> {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  if (last9.length < 7) return Promise.resolve([]);
  return apiRequest<DjangoPatient[]>(`/patients/?search=${encodeURIComponent(last9)}`, {
    signal,
  });
}
