import { apiRequest } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export type PatientGender = "male" | "female" | "unknown";

export interface DjangoFamily {
  id: number;
  organizationId: number;
  branch: { id: number; name: string } | null;
  name: string;
  memberCount: number;
}

export type FaceCaptureStatus = "pending" | "synced" | "sync_failed";

export interface DjangoFaceCapture {
  id: number;
  faceId: number;
  branch: { id: number; name: string } | null;
  photoUrl: string | null;
  patient: { id: number; fullName: string } | null;
  status: FaceCaptureStatus;
  syncError: string;
  syncedAt: string | null;
  createdAt: string;
}

export interface DjangoPatient {
  id: number;
  organizationId: number;
  branch: { id: number; name: string } | null;
  family?: DjangoFamily | null;
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
  familyId?: number | null;
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

export function getPatientFamilies(
  search = "",
  signal?: AbortSignal,
): Promise<DjangoFamily[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiRequest<DjangoFamily[]>(`/patients/families/${query}`, { signal });
}

export function createPatientFamily(payload: {
  name: string;
  organizationId?: number | null;
  branchId?: number | null;
}): Promise<DjangoFamily> {
  return apiRequest<DjangoFamily>("/patients/families/", {
    method: "POST",
    body: payload,
  });
}

export function updatePatientFamily(id: number, name: string): Promise<DjangoFamily> {
  return apiRequest<DjangoFamily>(`/patients/families/${id}/`, {
    method: "PATCH",
    body: { name },
  });
}

export function getFaceCaptures(
  status?: FaceCaptureStatus,
  signal?: AbortSignal,
): Promise<DjangoFaceCapture[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<DjangoFaceCapture[]>(`/patients/face/captures/${query}`, { signal });
}

export function assignFaceCapture(
  captureId: number,
  patientId: number,
): Promise<DjangoFaceCapture> {
  return apiRequest<DjangoFaceCapture>(`/patients/face/captures/${captureId}/assign/`, {
    method: "POST",
    body: { patientId },
  });
}

export function syncFaceCapture(captureId: number): Promise<DjangoFaceCapture> {
  return apiRequest<DjangoFaceCapture>(`/patients/face/captures/${captureId}/sync/`, {
    method: "POST",
  });
}

export function forceFaceCapture(): Promise<{
  status: string;
  message: string;
  faceIds: number[];
}> {
  return apiRequest<{
    status: string;
    message: string;
    faceIds: number[];
  }>("/patients/face/force-capture/", { method: "POST" });
}

/**
 * Серверный поиск пациентов (по ФИО или телефону) с лимитом.
 * Для автокомплитов — не тянет всю базу на клиент.
 */
export function searchPatients(
  search: string,
  limit = 10,
  signal?: AbortSignal,
  offset = 0,
): Promise<DjangoPatient[]> {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  q.set("limit", String(limit));
  if (offset) q.set("offset", String(offset));
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
