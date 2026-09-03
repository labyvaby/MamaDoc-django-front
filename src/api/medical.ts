import { ApiError, apiRequest, apiRequestWithHeaders } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";
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
  /** Snapshot of the catalog entry's displayName at selection time (see CatalogDiagnosis). */
  displayName?: string;
}

// ── Заполненный бланк заключения ───────────────────────────────────────────────

/**
 * Заполненный бланк внутри заключения.
 *
 * Бэк хранит `formData` как свободный JSON (до 256 КБ) и ничего из него не
 * собирает — структура целиком наша. Текст заключения по-прежнему лежит в
 * своих колонках: `formData` нужен, чтобы при повторном открытии врач увидел
 * не «простыню», а те же строки протокола, что заполнял.
 *
 * ⚠ `snapshot` — копия шаблона на момент заполнения, и открывать старое
 * заключение нужно по ней, а не по актуальному бланку из настроек:
 * администратор мог позже переставить поля, переименовать строки или
 * переназначить привязку к колонке (`slot`) — тогда значения легли бы не в
 * свои строки, а привязанное поле записало бы температуру в чужую колонку.
 */
export interface ConclusionFormDataEntry {
  /** id шаблона (ConclusionFormTemplate.id); шаблон мог быть удалён позже. */
  formId: number;
  /** Значения полей бланка по id поля. */
  values: Record<string, string>;
  /** Шаблон на момент заполнения — по нему заключение и открывается заново. */
  snapshot?: {
    name?: string;
    title?: string;
    subtitle?: string;
    footerNote?: string;
    target?: string;
    pageSize?: string;
    orientation?: string;
    showClinicHeader?: boolean;
    headerContacts?: string;
    background?: { imageUrl?: string | null; opacity?: number } | null;
    fields?: unknown[];
  } | null;
}

export interface ConclusionFormData {
  /** Версия структуры: разбирать чужую версию вслепую нельзя. */
  version: number;
  forms: ConclusionFormDataEntry[];
  /**
   * Текст, дописанный врачом руками поверх бланка, по имени колонки. Хранится
   * отдельно, иначе пересборка текста из полей затирала бы его на каждой
   * правке значения.
   */
  manual?: Record<string, string>;
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
  /** Заполненный бланк; null — заключение написано свободным текстом. */
  formData: ConclusionFormData | null;
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
  /**
   * Бланк на момент этой ревизии. Откат должен восстанавливать текст и бланк
   * вместе: восстановленный текст без значений полей врач не сможет править
   * по строкам, а старые значения поверх нового текста разошлись бы с ним.
   */
  formData: ConclusionFormData | null;
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
  /**
   * Заполненный бланк. Явный `null` очищает его, пропущенное поле в PATCH
   * оставляет прежнее значение — поэтому шлём его всегда, когда форма
   * заключения открыта, и не полагаемся на «не передали = не меняли».
   */
  formData?: ConclusionFormData | null;
}

/** Предел бэка на размер `formData` — 256 КБ сериализованного JSON. */
export const CONCLUSION_FORM_DATA_LIMIT_BYTES = 256 * 1024;

// ── Diagnosis catalog ────────────────────────────────────────────────────────

/** One ICD-10 diagnosis from the organization's catalog. */
export interface CatalogDiagnosis {
  id: number;
  code: string;
  title: string;
  /** Optional patient-facing name; shown in the conclusion PDF instead of the code+title when set. */
  displayName: string;
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
  opts?: { includeInactive?: boolean; limit?: number | "all" },
): Promise<CatalogDiagnosis[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (opts?.includeInactive) params.set("includeInactive", "true");
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiRequest<CatalogDiagnosis[]>(
    `/medical/diagnoses/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export interface DiagnosesPaginatedResult {
  items: CatalogDiagnosis[];
  totalCount: number;
}

export async function getDiagnosesPaginated(
  search?: string,
  signal?: AbortSignal,
  opts?: { includeInactive?: boolean; offset?: number; limit?: number | "all" },
): Promise<DiagnosesPaginatedResult> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (opts?.includeInactive) params.set("includeInactive", "true");
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();

  const envelope = await apiRequestWithHeaders<CatalogDiagnosis[]>(
    `/medical/diagnoses/${qs ? `?${qs}` : ""}`,
    { signal },
  );

  const rawCount = envelope.headers.get("X-Total-Count");
  const totalCount = rawCount ? parseInt(rawCount, 10) : envelope.data.length;

  return {
    items: envelope.data,
    totalCount: isNaN(totalCount) ? envelope.data.length : totalCount,
  };
}



/** POST /api/medical/diagnoses/ — add a diagnosis to the catalog. */
export function createDiagnosis(payload: {
  code: string;
  title: string;
  displayName?: string;
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
    displayName?: string;
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
export async function uploadConclusionPhoto(file: File): Promise<{ url: string }> {
  const form = new FormData();
  // Ужимаем и переводим в jpg: тяжёлый снимок бэк отвергает — см. api/uploads.ts.
  form.append("photo", await preparePhotoOrThrow(file));
  return withUploadErrors(() =>
    apiRequest<{ url: string }>("/medical/conclusion-photos/", {
      method: "POST",
      formData: form,
    }),
  );
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
 * true, когда бэк ответил «строки услуги нет» (404 «Service line not found»).
 *
 * Строку услуги приёма пересоздают, а не правят: смена услуги или исполнителя
 * в дровере приёма шлёт строку без `id`, бэк удаляет старую и создаёт новую с
 * другим `serviceLineId` (проверено на живом API 16.08.2026: 14551 → 14552).
 * Любой экран, который держал прежний id (открытая форма заключения, кэш
 * conclusion-slots), после этого получает 404 — его нужно не показывать сырым,
 * а перепривязаться к новой строке.
 */
export function isServiceLineGoneError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 404 &&
    /service line/i.test(err.message)
  );
}

/**
 * Строка-замена для формы заключения, открытой на исчезнувшей строке услуги.
 *
 * Ищем ту же услугу того же исполнителя: приём мог содержать несколько строк,
 * и записать текст врача в чужую было бы хуже ошибки. Исполнителя учитываем
 * только когда он известен (в слоте без сотрудника `doctor` = null).
 */
export function findReplacementSlot(
  slots: ConclusionSlot[],
  params: { serviceLineId: number; serviceId?: number | null; doctorId?: number | null },
): ConclusionSlot | null {
  return (
    slots.find(
      (slot) =>
        slot.serviceLineId !== params.serviceLineId &&
        slot.canEdit &&
        (params.serviceId == null || slot.service.id === params.serviceId) &&
        (params.doctorId == null || slot.doctor?.id === params.doctorId),
    ) ?? null
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
