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
  /** Send as numeric string or null; backend accepts decimal strings */
  weightKg?: string | null;
  heightCm?: string | null;
  temperature?: string | null;
  internalComment?: string | null;
  status?: ConclusionStatus;
}

// ── API functions ──────────────────────────────────────────────────────────────

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
