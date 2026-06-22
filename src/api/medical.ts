import { apiRequest } from "./client";
import { parseBackendError } from "./appointments";

export { parseBackendError };

// ── Nested shapes ──────────────────────────────────────────────────────────────

export interface ConclusionServiceShort {
  id: number;
  name: string;
  basePrice: string;
  requiresConclusion: boolean;
}

export interface ConclusionDoctorShort {
  id: number;
  fullName: string;
}

export type ConclusionState = "not_created" | "draft" | "completed" | "not_required";

// ── Conclusion slot ────────────────────────────────────────────────────────────

/**
 * One element from GET /api/appointments/<appointmentId>/conclusion-slots/
 * Represents a service line that requires a conclusion.
 */
export interface ConclusionSlot {
  serviceLineId: number;
  service: ConclusionServiceShort;
  /** null when no employee is assigned to the service line */
  doctor: ConclusionDoctorShort | null;
  requiresConclusion: boolean;
  state: ConclusionState;
  /** Full conclusion object — null when state is not_created */
  conclusion: MedicalConclusion | null;
  canEdit: boolean;
  canPrint: boolean;
}

// ── Diagnosis data ─────────────────────────────────────────────────────────────

export interface DiagnosisDataItem {
  id?: string;
  diagnosisCode?: string;
  title?: string;
}

// ── Medical conclusion ─────────────────────────────────────────────────────────

export type ConclusionStatus = "draft" | "completed";

export interface MedicalConclusion {
  id: number;
  serviceLineId: number;
  appointmentId: number;
  complaints: string | null;
  anamnesis: string | null;
  objective: string | null;
  conclusion: string | null;
  diagnosisData: DiagnosisDataItem[];
  photoUrls: string[];
  /** Decimal string from backend, e.g. "72.50" */
  weightKg: string | null;
  /** Decimal string from backend, e.g. "175.00" */
  heightCm: string | null;
  /** Decimal string from backend, e.g. "36.60" */
  temperature: string | null;
  internalComment: string | null;
  status: ConclusionStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Revision ───────────────────────────────────────────────────────────────────

export interface MedicalConclusionRevision {
  id: number;
  conclusion: string | null;
  anamnesis: string | null;
  objective: string | null;
  complaints: string | null;
  diagnosisData: DiagnosisDataItem[];
  photoUrls: string[];
  internalComment: string | null;
  status: ConclusionStatus;
  changedBy: string | null;
  changeReason: "create" | "update" | "complete";
  createdAt: string;
}

// ── Payload ────────────────────────────────────────────────────────────────────

export interface MedicalConclusionPayload {
  complaints?: string | null;
  anamnesis?: string | null;
  objective?: string | null;
  conclusion?: string | null;
  /** Free-form diagnosis data; send as array of objects or empty array */
  diagnosisData?: DiagnosisDataItem[];
  /** Public URLs of attached photos (from uploadConclusionPhoto). */
  photoUrls?: string[];
  /** Send as numeric string or null; backend accepts decimal strings */
  weightKg?: string | null;
  heightCm?: string | null;
  temperature?: string | null;
  internalComment?: string | null;
  status?: ConclusionStatus;
}

// ── Diagnosis catalog ────────────────────────────────────────────────────────

/** One ICD-10 diagnosis from the organization's catalog. */
export interface CatalogDiagnosis {
  id: number;
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
}

// ── API functions ──────────────────────────────────────────────────────────────

/**
 * GET /api/medical/diagnoses/
 * Returns the ICD-10 catalog for the caller's active organization.
 * - `search` filters by code or title substring.
 * - `includeInactive` returns deactivated entries too (for the settings manager).
 */
export function getDiagnoses(
  search?: string,
  signal?: AbortSignal,
  opts?: { includeInactive?: boolean },
): Promise<CatalogDiagnosis[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (opts?.includeInactive) params.set("includeInactive", "true");
  const qs = params.toString();
  return apiRequest<CatalogDiagnosis[]>(
    `/medical/diagnoses/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

/** POST /api/medical/diagnoses/ — add a diagnosis to the catalog. */
export function createDiagnosis(payload: {
  code: string;
  title: string;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<CatalogDiagnosis> {
  return apiRequest<CatalogDiagnosis>("/medical/diagnoses/", {
    method: "POST",
    body: payload,
  });
}

/** PATCH /api/medical/diagnoses/<id>/ — edit a diagnosis (only sent fields). */
export function updateDiagnosis(
  id: number,
  payload: {
    code?: string;
    title?: string;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<CatalogDiagnosis> {
  return apiRequest<CatalogDiagnosis>(`/medical/diagnoses/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

/** DELETE /api/medical/diagnoses/<id>/ — remove a diagnosis from the catalog. */
export function deleteDiagnosis(id: number): Promise<void> {
  return apiRequest<void>(`/medical/diagnoses/${id}/`, { method: "DELETE" });
}

/**
 * POST /api/medical/conclusion-photos/
 * Uploads one image (multipart, field `photo`) and returns its public URL.
 * The caller appends the URL to the conclusion's photoUrls and saves it.
 */
export function uploadConclusionPhoto(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("photo", file);
  return apiRequest<{ url: string }>("/medical/conclusion-photos/", {
    method: "POST",
    formData: form,
  });
}

/** A reusable conclusion text template owned by the calling doctor. */
export interface ConclusionTemplate {
  id: number;
  name: string;
  conclusion: string;
  anamnesis: string;
  objective: string;
}

/** GET /api/medical/conclusion-templates/ — the doctor's saved templates. */
export function getConclusionTemplates(
  signal?: AbortSignal,
): Promise<ConclusionTemplate[]> {
  return apiRequest<ConclusionTemplate[]>("/medical/conclusion-templates/", {
    signal,
  });
}

/** POST /api/medical/conclusion-templates/ — save a new template. */
export function createConclusionTemplate(payload: {
  name: string;
  conclusion?: string;
  anamnesis?: string;
  objective?: string;
}): Promise<ConclusionTemplate> {
  return apiRequest<ConclusionTemplate>("/medical/conclusion-templates/", {
    method: "POST",
    body: payload,
  });
}

/** DELETE /api/medical/conclusion-templates/<id>/ — remove a template. */
export function deleteConclusionTemplate(id: number): Promise<void> {
  return apiRequest<void>(`/medical/conclusion-templates/${id}/`, {
    method: "DELETE",
  });
}

/**
 * GET /api/appointments/<appointmentId>/conclusion-slots/
 * Returns only service lines where requiresConclusion=true.
 */
export function getConclusionSlots(
  appointmentId: number,
  signal?: AbortSignal,
): Promise<ConclusionSlot[]> {
  return apiRequest<ConclusionSlot[]>(
    `/appointments/${appointmentId}/conclusion-slots/`,
    { signal },
  );
}

/**
 * GET /api/medical/conclusions/<id>/
 */
export function getMedicalConclusion(id: number): Promise<MedicalConclusion> {
  return apiRequest<MedicalConclusion>(`/medical/conclusions/${id}/`);
}

/**
 * POST /api/appointments/service-lines/<lineId>/conclusion/
 * Creates or updates (upsert) the conclusion for a service line.
 */
export function upsertConclusion(
  lineId: number,
  payload: MedicalConclusionPayload,
): Promise<MedicalConclusion> {
  return apiRequest<MedicalConclusion>(
    `/appointments/service-lines/${lineId}/conclusion/`,
    { method: "POST", body: payload },
  );
}

/**
 * PATCH /api/medical/conclusions/<id>/
 */
export function updateConclusion(
  id: number,
  payload: MedicalConclusionPayload,
): Promise<MedicalConclusion> {
  return apiRequest<MedicalConclusion>(`/medical/conclusions/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

/**
 * GET /api/medical/conclusions/<id>/revisions/
 * Returns revisions newest-first.
 */
export function getConclusionRevisions(
  id: number,
): Promise<MedicalConclusionRevision[]> {
  return apiRequest<MedicalConclusionRevision[]>(
    `/medical/conclusions/${id}/revisions/`,
  );
}
