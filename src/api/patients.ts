import { apiRequest } from "./client";
import { Scope, scopeParams } from "./scope";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

// ── Types ──────────────────────────────────────────────────────────────────

export type PatientGender = "male" | "female" | "unknown";

export interface PatientProgramStatus {
  isVip: boolean;
  activeCount: number;
  primaryProgram: {
    id: number;
    code: string;
    name: string;
    expiresAt: string | null;
    enabledModuleCodes: string[];
  } | null;
}

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
  programStatus?: PatientProgramStatus;
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

export function getPatients(
  scope: Scope = {},
  params?: { search?: string },
  signal?: AbortSignal,
): Promise<DjangoPatient[]> {
  const query = scopeParams(scope);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest<DjangoPatient[]>(`/patients/${qs ? `?${qs}` : ""}`, { signal });
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

export function searchPatients(
  scopeOrSearch?: Scope | string,
  limitOrSearch?: number | string,
  signalOrLimit?: AbortSignal | number,
  offsetOrSignal?: number | AbortSignal,
  offsetVal?: number,
): Promise<DjangoPatient[]> {
  let scope: Scope = {};
  let search = "";
  let limit = 10;
  let signal: AbortSignal | undefined;
  let offset = 0;

  if (typeof scopeOrSearch === "string") {
    // Legacy call signature: searchPatients(search, limit, signal, offset)
    search = scopeOrSearch;
    limit = typeof limitOrSearch === "number" ? limitOrSearch : 10;
    signal = signalOrLimit as AbortSignal | undefined;
    offset = typeof offsetOrSignal === "number" ? offsetOrSignal : 0;
  } else {
    scope = scopeOrSearch ?? {};
    search = typeof limitOrSearch === "string" ? limitOrSearch : "";
    limit = typeof signalOrLimit === "number" ? signalOrLimit : 10;
    signal = offsetOrSignal as AbortSignal | undefined;
    offset = offsetVal ?? 0;
  }

  const q = scopeParams(scope);
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

export async function uploadPatientPhoto(
  patientId: number,
  file: File,
): Promise<DjangoPatient> {
  const form = new FormData();
  // Ужимаем и переводим в jpg: тяжёлый снимок с телефона бэк отвергает — см. api/uploads.ts.
  form.append("photo", await preparePhotoOrThrow(file));
  return withUploadErrors(() =>
    apiRequest<DjangoPatient>(`/patients/${patientId}/photo/`, {
      method: "PUT",
      formData: form,
    }),
  );
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

/**
 * Пациенты с таким же номером — проверка на дубль перед созданием карты.
 *
 * Бэк умеет только поиск подстрокой, поэтому по неполному номеру он возвращает
 * всех, у кого совпало начало: на «996700123» приходили `+996700123405`,
 * `+996700123011` и подобные, и форма показывала их как дубли. Совпадение по
 * фрагменту — не дубль, поэтому ответ фильтруем у себя и оставляем только
 * точные попадания.
 */
export async function getSimilarPatients(
  phone: string,
  signal?: AbortSignal,
  /** Обязателен суперпользователю: без него бэк отдаёт 400 (фикс 29.07.2026). */
  scope: Scope = {},
): Promise<DjangoPatient[]> {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  if (last9.length < 7) return [];
  const q = scopeParams(scope);
  q.set("search", last9);
  const found = await apiRequest<DjangoPatient[]>(`/patients/?${q.toString()}`, { signal });

  // Сравниваем по последним 9 цифрам: у пациента номер может быть сохранён с
  // кодом страны и без него, а хвост в обоих случаях одинаковый.
  return found.filter((p) => (p.phone ?? "").replace(/\D/g, "").slice(-9) === last9);
}
