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
  /**
   * Все заключения строки по порядку создания (первое — то же, что
   * `conclusion`). С 22.09.2026 строка услуги несёт несколько документов:
   * врач на одном приёме пишет и карту осмотра, и протокол УЗИ, каждый на
   * своём бланке. Нет поля — бэк старый, у строки только `conclusion`.
   */
  conclusions?: MedicalConclusion[];
  /** Можно ли добавить строке ещё один документ (лимит бэка — 10). */
  canCreate?: boolean;
  canEdit: boolean;
  canPrint: boolean;
}

/** Документы строки услуги; у старого бэка без `conclusions` — только `conclusion`. */
export function slotConclusions(slot: ConclusionSlot): MedicalConclusion[] {
  if (slot.conclusions) return slot.conclusions;
  return slot.conclusion ? [slot.conclusion] : [];
}

/**
 * Можно ли добавить строке ещё документ. Только по явному `canCreate`: без
 * него бэк не знает ручки `conclusions/` (404), и кнопка всегда падала бы.
 * Первый документ создаётся как раньше — кнопкой «Создать» строки.
 */
export function canAddConclusion(slot: ConclusionSlot): boolean {
  return slot.canCreate === true && slotConclusions(slot).length > 0;
}

/** Можно ли править документ: его собственный флаг, иначе флаг строки. */
export function conclusionCanEdit(slot: ConclusionSlot, doc: MedicalConclusion | null): boolean {
  return doc?.canEdit ?? slot.canEdit;
}

/**
 * Можно ли печатать документ. Печатается только завершённый (бэк, 22.09.2026).
 * Свой флаг документа важнее; у старого бэка его нет, а слотовый `canPrint`
 * относится к строке целиком — тогда проверяем статус сами.
 */
export function conclusionCanPrint(slot: ConclusionSlot, doc: MedicalConclusion | null): boolean {
  if (!doc) return false;
  return doc.canPrint ?? (slot.canPrint && doc.status === "completed");
}

/**
 * Состояние строки для показа: при нескольких документах «завершено» —
 * только когда завершены все (так же сводит бэк, 22.09.2026). Считаем по
 * документам, чтобы не зависеть от версии бэка на стенде.
 */
export function slotDisplayState(slot: ConclusionSlot): ConclusionState {
  const docs = slotConclusions(slot);
  if (docs.length <= 1) return slot.state;
  return docs.every((c) => c.status === "completed") ? "completed" : "draft";
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
    /** Отступы листа, мм. Печать берёт актуальные — эти нужны, если шаблон удалён. */
    margins?: { top?: number; right?: number; bottom?: number; left?: number } | null;
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
  /**
   * Права на этот документ (бэк отдаёт их внутри `conclusions[]` с
   * 22.09.2026); флаги слота относятся к строке целиком. Нет поля — старый
   * бэк, берём флаг слота (`conclusionCanEdit` / `conclusionCanPrint`).
   */
  canEdit?: boolean;
  canPrint?: boolean;
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
  /**
   * Пользователь, сделавший правку, — именно id, не имя.
   *
   * ⚠ Раньше здесь стояло `changedBy: string`, которого в ответе нет вовсе:
   * бэк отдаёт `changedById` (проверено на живых данных 08.09.2026, ревизии
   * заключения 6428). Поле молча приходило `undefined`, и история правок
   * показывала «когда», но не «кто». ФИО подставляем матчингом
   * `changedById` ↔ `employee.authUserId`; отдать имя сразу попросили тикетом
   * `MamaDoc/backend_ticket_conclusion_revisions.md` — в истории цены приёма
   * бэк уже отдаёт `changedByName`.
   */
  changedById: number | null;
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



/** Строка «частых диагнозов» врача: запись каталога + сколько раз поставлен. */
export interface FrequentDiagnosis {
  id: number;
  code: string;
  title: string;
  displayName: string;
  count: number;
}

/**
 * GET /api/medical/diagnoses/frequent/ — коды, которые врач ставил чаще всего.
 * Без `doctorId` — по текущему пользователю (нет карточки сотрудника → `[]`).
 * Код считается один раз на заключение; только активные коды каталога, без
 * свободного текста. По умолчанию 6 месяцев и 8 кодов (пределы 24 и 20).
 * Проверено на тесте 28.09.2026 (чужой doctorId → 404). На проде ручки пока
 * нет (404) — фронт молчит, строки «Частые у вас» просто нет.
 */
export function getFrequentDiagnoses(
  opts: { doctorId?: number; limit?: number; months?: number } = {},
  signal?: AbortSignal,
): Promise<FrequentDiagnosis[]> {
  const params = new URLSearchParams();
  if (opts.doctorId != null) params.set("doctorId", String(opts.doctorId));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.months != null) params.set("months", String(opts.months));
  const qs = params.toString();
  return apiRequest<FrequentDiagnosis[]>(
    `/medical/diagnoses/frequent/${qs ? `?${qs}` : ""}`,
    { signal },
  );
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
  /**
   * Заполненный бланк шаблона — та же структура, что у заключения
   * (api/conclusionFormData); `null` — текстовый шаблон. Проверено на тесте
   * 28.09.2026: POST принимает и отдаёт, GET списка отдаёт, не-объект → 400,
   * лимит 256 КБ как у заключения; PATCH у шаблонов нет. Прод ещё без поля
   * (старый бэк его отбрасывает) — тогда шаблон при бланке применяется
   * текстом (см. conclusionPresets).
   */
  formData?: ConclusionFormData | null;
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
  /** См. ConclusionTemplate.formData — старый бэк (прод) его отбрасывает. */
  formData?: ConclusionFormData | null;
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

/** Заключение из истории пациента — строка `patient-conclusions`. */
export interface PatientConclusionSummary {
  id: number;
  appointmentId: number;
  serviceLineId: number;
  occurredAt: string;
  doctor: { id: number; fullName: string } | null;
  serviceName: string;
  diagnosisData: Array<{ title?: string; diagnosis_code?: string; diagnosisCode?: string }>;
  status: ConclusionStatus;
}

/**
 * GET /api/medical/patient-conclusions/?patientId= — живые заключения пациента
 * по всем филиалам, от новых к старым, без финансовых полей. `formData` здесь
 * нет (проверено 28.09.2026) — его отдаёт карточка заключения
 * (getMedicalConclusion). Фильтра по врачу нет: без patientId ответ пустой.
 */
export function getPatientConclusions(
  patientId: number,
  signal?: AbortSignal,
): Promise<PatientConclusionSummary[]> {
  return apiRequest<PatientConclusionSummary[]>(
    `/medical/patient-conclusions/?patientId=${encodeURIComponent(String(patientId))}&limit=50`,
    { signal },
  );
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

/** Шапка документа заключения: пациент, дата приёма, жалобы. Денег в ней нет. */
export interface ConclusionContext {
  appointmentId: number;
  startsAt: string;
  complaints: string;
  doctorComplaints: string;
  /** null — окно забронировали до того, как стал известен пациент. */
  patient: { id: number; fullName: string; birthDate: string | null } | null;
}

/**
 * GET /api/appointments/<appointmentId>/conclusion-context/
 *
 * То, что печатается в шапке заключения и справки, под тем же правом, что и
 * `conclusion-slots`. Карточка приёма (`getAppointment`) для печати не годится:
 * врач без «видеть все приёмы» получает на приём коллеги 404, хотя заключение
 * коллеги читать и печатать вправе (24.09.2026).
 */
export function getConclusionContext(
  appointmentId: number,
  signal?: AbortSignal,
): Promise<ConclusionContext> {
  return apiRequest<ConclusionContext>(
    `/appointments/${appointmentId}/conclusion-context/`,
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
 * POST /api/appointments/service-lines/<lineId>/conclusions/
 * Всегда создаёт новое заключение строки — ещё один документ, в отличие от
 * upsert выше, который правит первое. Тело то же, ответ 201. Лимит — 10 на
 * строку (400), без `medical.conclusions.create` — 403.
 */
export function createAdditionalConclusion(
  lineId: number,
  payload: MedicalConclusionPayload,
): Promise<MedicalConclusion> {
  return apiRequest<MedicalConclusion>(
    `/appointments/service-lines/${lineId}/conclusions/`,
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
 * DELETE /api/medical/conclusions/<id>/ — только черновик. Завершённый —
 * 409 `CONCLUSION_COMPLETED`; право `medical.conclusions.delete`.
 */
export function deleteConclusion(id: number): Promise<void> {
  return apiRequest<void>(`/medical/conclusions/${id}/`, { method: "DELETE" });
}

/**
 * GET /api/medical/conclusions/<id>/revisions/
 * Returns revisions newest-first.
 */
export function getConclusionRevisions(
  id: number,
  signal?: AbortSignal,
): Promise<MedicalConclusionRevision[]> {
  return apiRequest<MedicalConclusionRevision[]>(
    `/medical/conclusions/${id}/revisions/`,
    { signal },
  );
}

// ── AI-помощник врача ──────────────────────────────────────────────────────────

/**
 * Поля заключения, для которых бэк умеет подсказывать текст
 * (`frontend_ai_assist_guide.md`, 13.09.2026). Ровно пять. Одиночный
 * `POST /medical/ai/assist/` на бэке остался, но фронт им больше не
 * пользуется — только пакетным (см. `requestAiAssistBatch`).
 */
export const AI_ASSIST_FIELDS = [
  "complaints",
  "anamnesis",
  "objective",
  "diagnosis",
  "conclusion",
] as const;

export type AiAssistField = (typeof AI_ASSIST_FIELDS)[number];

/**
 * Фразы-заглушки, которыми модель отвечает, когда опереться не на что.
 * Гайд просит не показывать такой ответ как предложение: врачу нечего
 * применять. Список — из формулировок гайда и типичных вариантов модели;
 * точного перечня бэк не даёт, поэтому проверяем только короткие ответы,
 * состоящие из одной такой фразы, а не ищем её внутри нормального текста.
 */
// ⚠ `\w` в JS без флага `u` — только латиница, кириллицу описываем явно.
const AI_PLACEHOLDER_RE =
  /^[\s«"'([]*(данн[а-яё]*\s+не\s+предоставлен[а-яё]*|нет\s+данных|данных\s+нет|недостаточно\s+данных|информаци[а-яё]+\s+отсутствует|нет\s+информации|n\/a|none|—|-)[\s.!»"')\]]*$/i;

/**
 * Реплика модели «от себя», целиком в скобках, про отсутствие данных. На test
 * (15.09.2026) черновик без контекста приходил так: «(Текст врача не
 * предоставлен — данных для раздела «жалобы пациента» нет.)», «(пусто — текст
 * врача не содержит данных для раздела)». Скобки обязательны: без них
 * «Жалоб нет, данных о травмах нет» — нормальный текст для поля.
 */
const AI_META_NOTE_RE = /^\([^()]*\)[.!]?$/;
const AI_META_NO_DATA_RE =
  /не\s+предоставлен|нет\s+данных|данных\s[^()]*\sнет|не\s+содерж[а-яё]*\s+данных|пусто|отсутству/i;

/**
 * Невидимые символы форматирования (U+200B…U+200F, U+2060, U+FEFF). `trim()`
 * их не срезает: на test пустой черновик пришёл одним U+200E, и без этого
 * врач увидел бы пустую плашку с кнопкой «Применить».
 */
const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u2060\uFEFF]/g;

/**
 * Текст одного предложения модели или null, если показывать нечего.
 *
 * Пустой ответ, одни пробелы и заглушка вроде «данных не предоставлено» —
 * это «модели не на что опереться», а не текст для поля.
 */
export function normalizeAiText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text.replace(INVISIBLE_CHARS_RE, "").trim()) return null;
  if (AI_PLACEHOLDER_RE.test(text)) return null;
  if (AI_META_NOTE_RE.test(text) && AI_META_NO_DATA_RE.test(text)) return null;
  return text;
}

/** Бэк принимает до 5 колонок, каждую не более одного раза (иначе 422). */
export const AI_ASSIST_BATCH_MAX = AI_ASSIST_FIELDS.length;

/**
 * Строк бланка в одном запросе — не больше 40 (ответ бэка 27.09.2026): бэк
 * сам режет их на параллельные чанки по 8, так что по времени это один чанк.
 */
export const AI_ASSIST_FORM_ROWS_MAX = 40;

/** Длина `id` строки бланка: длиннее бэк отвергает 422. Наши id — UUID (36). */
export const AI_ASSIST_FORM_ROW_ID_MAX = 64;

export interface AiAssistBatchEntry {
  field: AiAssistField;
  /** Текущее содержимое поля; пустая строка — просьба написать черновик. */
  text: string;
}

/** Свободная строка бланка (без `slot`) — то, что врач правит сам. */
export interface AiAssistFormRow {
  /** Стабильный id поля из конструктора бланка. */
  id: string;
  /** Подпись строки, как её видит врач, — контекст модели. */
  label: string;
  /**
   * Значение без подписи: «Печень: …» задвоилось бы в ответе (гайд, правило 3).
   * Пустая строка — просьба предложить черновик.
   */
  text: string;
  multiline?: boolean;
}

export interface AiAssistForm {
  /** Название протокола: модели понятно, что за исследование. */
  title?: string;
  /** Колонка, которую бланк собирает; в `fields` её не шлём. */
  target: AiAssistField;
  rows: AiAssistFormRow[];
}

interface AiAssistSuggestionDto {
  text?: string | null;
  confidence?: number;
}

interface AiAssistBatchResponse {
  suggestions?: Partial<Record<string, AiAssistSuggestionDto | null>> | null;
  formSuggestions?: Partial<Record<string, AiAssistSuggestionDto | null>> | null;
}

/** Подсказки по запрошенным полям: null — модели нечего сказать, плашки нет. */
export type AiAssistFieldsResult = Partial<Record<AiAssistField, string | null>>;

export interface AiAssistBatchResult {
  fields: AiAssistFieldsResult;
  /** По `id` строк бланка; ключи — ровно отправленные строки. */
  rows: Record<string, string | null>;
}

/**
 * Разложить ответ пакетного эндпоинта по запрошенным колонкам и строкам.
 *
 * Бэк обещает ключи ровно по запросу и пустой `text` там, где добавить
 * нечего (частичный успех — это 200, а не 502). Отсутствующий ключ читаем
 * так же, как пустой: врач в обоих случаях просто не видит плашки.
 * `confidence` не читаем: бэк отдаёт фиксированные 0.75.
 */
export function normalizeAiBatchSuggestions(
  response: unknown,
  fields: readonly AiAssistField[],
  rowIds: readonly string[] = [],
): AiAssistBatchResult {
  const dto = response as AiAssistBatchResponse | null;
  const suggestions = dto?.suggestions ?? {};
  const formSuggestions = dto?.formSuggestions ?? {};
  const result: AiAssistBatchResult = { fields: {}, rows: {} };
  for (const field of fields) result.fields[field] = normalizeAiText(suggestions[field]?.text);
  for (const id of rowIds) result.rows[id] = normalizeAiText(formSuggestions[id]?.text);
  return result;
}

/**
 * Строки бланка, которые бэк примет: id не длиннее 64 символов, без
 * дублей, не больше 40. Строки сверх лимита остаются без подсказки, а не
 * валят весь запрос: у присланных заказчиком протоколов 10–25 строк, и
 * бланк на 40+ — редкость, ради которой не стоит лишать врача остального.
 */
export function fitAiFormRows(rows: readonly AiAssistFormRow[]): AiAssistFormRow[] {
  const seen = new Set<string>();
  const out: AiAssistFormRow[] = [];
  for (const row of rows) {
    if (out.length >= AI_ASSIST_FORM_ROWS_MAX) break;
    if (!row.id || row.id.length > AI_ASSIST_FORM_ROW_ID_MAX || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      label: row.label,
      text: row.text,
      ...(row.multiline ? { multiline: true } : {}),
    });
  }
  return out;
}

/**
 * POST /api/medical/ai/assist/batch/ — подсказки сразу по колонкам
 * заключения и строкам бланка одним HTTP-запросом (ответы бэка на
 * `MamaDoc/backend_ticket_ai_assist_batch.md`, 16.09.2026, и
 * `MamaDoc/backend_ticket_ai_assist_form_rows.md`, 27.09.2026).
 *
 * Разделы согласованы между собой, а ждать 48–60 с на 5 полей, не 2–3
 * минуты. ⚠ Таймаута у клиента нет — и не добавлять:
 * цепочка бэка 120 с (gunicorn) > 110 с > 100 с (модель), обрыв на нашей
 * стороне выкинул бы нормальный ответ. Оборванный ответ модели бэк отдаёт
 * как 502, а не как 200 с половиной фразы. После 502 ничего не ретраить:
 * лимит провайдера общий на всех, и повторы только сжигают его.
 *
 * Бланк (`form`) шлём, только если в нём есть свободные строки; колонку,
 * которую бланк собирает (`form.target`), из `fields` убираем здесь же —
 * бэк просит её не слать (подсказка по проекции строк бессмысленна).
 */
export async function requestAiAssistBatch(
  entries: readonly AiAssistBatchEntry[],
  options: {
    serviceLineId?: number | null;
    form?: AiAssistForm | null;
    signal?: AbortSignal;
  } = {},
): Promise<AiAssistBatchResult> {
  const rows = options.form ? fitAiFormRows(options.form.rows) : [];
  const form = options.form && rows.length > 0 ? { ...options.form, rows } : null;
  const sent = form ? entries.filter((entry) => entry.field !== form.target) : [...entries];
  const fields = sent.map((entry) => entry.field);
  if (
    (fields.length === 0 && !form) ||
    fields.length > AI_ASSIST_BATCH_MAX ||
    new Set(fields).size !== fields.length
  ) {
    // 422 бэка здесь — баг фронта; ловим его до запроса.
    throw new Error(`AI assist batch: 1–${AI_ASSIST_BATCH_MAX} уникальных полей, получено [${fields.join(", ")}]`);
  }
  const body: {
    fields: AiAssistBatchEntry[];
    serviceLineId?: number;
    form?: { title?: string; target: AiAssistField; rows: AiAssistFormRow[] };
  } = {
    fields: sent.map(({ field, text }) => ({ field, text })),
  };
  if (options.serviceLineId != null) body.serviceLineId = options.serviceLineId;
  if (form) {
    body.form = { target: form.target, rows };
    if (form.title?.trim()) body.form.title = form.title.trim();
  }
  const response = await apiRequest<AiAssistBatchResponse>("/medical/ai/assist/batch/", {
    method: "POST",
    body,
    signal: options.signal,
  });
  return normalizeAiBatchSuggestions(response, fields, rows.map((row) => row.id));
}

/**
 * true, когда AI-сервис за бэком временно недоступен (гайд: 502 — сервис
 * лёг, провайдер вернул ошибку или исчерпал квоту, ответ модели оборвался).
 * 503/504 — те же «попробуйте позже» с точки зрения врача (504 возможен от
 * внешнего прокси, если его таймаут меньше 120 с), поэтому считаем их тем же
 * случаем: тост, но не блокировка сохранения заключения.
 *
 * 429 бэк не отдаёт никогда (ответ 16.09.2026: своего лимита у бэка и
 * AI-сервиса нет, лимит провайдера приходит как 502). Оставлен страховкой
 * от прокси.
 */
export function isAiUnavailableError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status === 429 || (err.status >= 502 && err.status <= 504);
}
