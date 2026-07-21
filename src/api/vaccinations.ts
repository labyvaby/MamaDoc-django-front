import { apiRequest } from "./client";

/**
 * Модуль «Прививки» (vaccinations).
 *
 * Контракт: frontend-vaccinations-guide.md (бэкенд реализован, Этапы 1–2:
 * учёт + календарь; Этап 3 — аналитика по партиям/сроку — пока нет).
 * НЕ менять форму без согласования с бэкенд-командой.
 *
 * Права на проде ролям пока НЕ выданы — все запросы кроме superuser вернут 403
 * (это отдельный шаг бэка/тимлида). Моки оставлены для локальной отладки без
 * бэка (VACCINATIONS_USE_MOCKS = true).
 *
 * Открытые вопросы бэку (предположения фронта, не факт из гайда):
 * - скоуп по филиалам (branchId) — проверяем на живом API;
 * - patientName в слотах дашборда «кому пора» (гайд не фиксирует, но UI нужен);
 * - точный набор injectionSite (гайд показывает только "left_arm").
 * organizationId query-параметром суперпользователю закладываем проактивно
 * (как в tasks/achievements) — лишний параметр бэк проигнорирует.
 */

export const VACCINATIONS_USE_MOCKS = false;

/**
 * Название складской категории, в которой лежат товары-вакцины.
 * Соглашение (проверено на проде 21.07.2026: категория так и называется
 * «Вакцины»). Используется для фильтрации пикеров товара — в вакцины
 * подставляем только товары этой категории.
 * ⚠ Открытый вопрос бэку: сделать признак «это вакцина» на самой категории/
 * товаре, а не завязываться на строковое имя (см. тикет vaccines↔склад).
 */
export const VACCINE_PRODUCT_CATEGORY = "Вакцины";

// ── Types ────────────────────────────────────────────────────────────────────

/** Справочник вакцин. */
export interface Vaccine {
  id: number;
  organizationId: number;
  name: string;
  manufacturer: string;
  targetDisease: string;
  dosesRequired: number;
  /** Дней между дозами; null — календарь по вакцине не считается. */
  intervalDays: number | null;
  recommendedAgeMonths: number | null;
  isActive: boolean;
  notes: string;
}

export interface CreateVaccinePayload {
  name: string;
  manufacturer?: string;
  targetDisease?: string;
  dosesRequired?: number;
  intervalDays?: number | null;
  recommendedAgeMonths?: number | null;
  notes?: string;
}

export interface UpdateVaccinePayload extends Partial<CreateVaccinePayload> {
  isActive?: boolean;
}

/** Партия вакцины на складе. */
export interface VaccineBatch {
  id: number;
  organizationId: number;
  branchId: number;
  vaccineId: number;
  vaccineName: string;
  /** Товар склада: без него ввод прививки НЕ спишет остаток и НЕ создаст строку счёта. */
  productId: number | null;
  batchNumber: string;
  expiresAt: string; // YYYY-MM-DD
  quantityInitial: number;
  /** Сколько доз реально осталось — считается на лету, не путать с quantityInitial. */
  remaining: number;
  /** Строка-decimal ("1800.00") — форма бэка, не число. */
  costPrice: string;
  receivedAt: string; // YYYY-MM-DD
  supplier: string;
  notes: string;
}

export interface CreateBatchPayload {
  branchId: number;
  vaccineId: number;
  /** Необязательно, но без него прививка молча окажется «бесплатной» (см. гайд). */
  productId?: number | null;
  batchNumber: string;
  expiresAt: string;
  quantityInitial: number;
  receivedAt?: string;
  costPrice?: string;
  supplier?: string;
  notes?: string;
}

export type UpdateBatchPayload = Partial<Omit<CreateBatchPayload, "vaccineId">>;

/**
 * Место укола. Гайд фиксирует только "left_arm" — остальные значения
 * предположение фронта (см. INJECTION_SITE_OPTIONS в meta); поле терпимо к
 * произвольной строке, если бэк использует другие slug'и.
 */
export type InjectionSite = string;

/**
 * Статус записи о прививке. Гайд показывает "pending" в ответе и принимает
 * PATCH {status:"canceled"}; "done" — предположение. Поле терпимо к строке.
 */
export type VaccinationRecordStatus = "pending" | "done" | "canceled" | string;

/** Кто вводил прививку — объект (как employee в строке услуги приёма), не число. */
export interface VaccinationAdministeredBy {
  id: number;
  fullName: string;
  photoUrl: string | null;
  nickname: string | null;
}

/** Запись о введённой прививке. */
export interface VaccinationRecord {
  id: number;
  organizationId: number;
  patientId: number;
  branchId: number;
  appointmentId: number | null;
  serviceLineId: number | null;
  vaccineId: number;
  vaccineName: string;
  batchId: number | null;
  administeredAt: string; // ISO
  doseNumber: number;
  injectionSite: InjectionSite;
  administeredBy: VaccinationAdministeredBy | null;
  isExternal: boolean;
  batchNumberManual: string;
  expiresAtManual: string | null;
  /** Строка-decimal. */
  unitPrice: string;
  discountAmount: string;
  status: VaccinationRecordStatus;
  reactionNotes: string;
  nextDueDate: string | null; // YYYY-MM-DD
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordsFilters {
  patientId?: number;
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  organizationId?: number;
}

/** Сценарий 1 «у нас» — batchId + administeredById; Сценарий 2 «внешняя» — isExternal + ручные поля. */
export interface CreateRecordPayload {
  patientId: number;
  branchId: number;
  vaccineId: number;
  administeredAt: string; // ISO
  doseNumber: number;
  appointmentId?: number | null;
  /** Сценарий 1: партия склада (при isExternal бэк обнулит). */
  batchId?: number | null;
  injectionSite?: InjectionSite;
  /** Плоский id сотрудника (в ответе вернётся объектом administeredBy). */
  administeredById?: number | null;
  unitPrice?: string;
  discountAmount?: string;
  /** Сценарий 2 «не у нас». */
  isExternal?: boolean;
  batchNumberManual?: string;
  expiresAtManual?: string | null;
  notes?: string;
}

/**
 * PATCH записи: только отмена (status:"canceled") и наблюдение (reactionNotes).
 * Сумму/партию так не поправить — для этого запись отменяют и вводят заново.
 */
export interface UpdateRecordPayload {
  status?: "canceled";
  reactionNotes?: string;
}

export type ScheduleStatus = "planned" | "overdue" | "done" | "skipped";

/** Слот календаря прививок. status="overdue" вычисляется бэком на лету. */
export interface VaccinationScheduleSlot {
  id: number;
  organizationId: number;
  patientId: number;
  branchId: number;
  vaccineId: number;
  vaccineName: string;
  doseNumber: number;
  scheduledDate: string; // YYYY-MM-DD
  status: ScheduleStatus;
  recordId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Для дашборда «кому пора» (все пациенты) — открытый вопрос бэку, UI терпит отсутствие. */
  patientName?: string;
  patientPhone?: string;
}

export interface ScheduleDashboardFilters {
  dueBefore?: string; // YYYY-MM-DD
  branchId?: number;
  patientId?: number;
  organizationId?: number;
}

export interface UpdateSchedulePayload {
  status?: ScheduleStatus;
  scheduledDate?: string;
  notes?: string;
}

export interface CreateSchedulePayload {
  patientId: number;
  branchId: number;
  vaccineId: number;
  doseNumber: number;
  scheduledDate: string;
}

// ── organizationId helper ──────────────────────────────────────────────────────

/**
 * Суперпользователю/мультиорг-аккаунту нужен явный query-параметр organizationId
 * (как в tasks/achievements). Значение — из useApiOrgId().
 */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

/** Бэк может отдать список массивом (как schedule) или DRF-формой {results} — нормализуем. */
function toList<T>(data: { results: T[] } | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

// ── Mock store ───────────────────────────────────────────────────────────────

const mockDelay = <T,>(value: T, ms = 300): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (base: string, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

let mockVaccineSeq = 1;
let mockBatchSeq = 100;
let mockRecordSeq = 1000;
let mockSlotSeq = 5000;

const mockVaccines: Vaccine[] = [
  {
    id: mockVaccineSeq++,
    organizationId: 5,
    name: "Превенар 13",
    manufacturer: "Pfizer",
    targetDisease: "Пневмококковая инфекция",
    dosesRequired: 3,
    intervalDays: 42,
    recommendedAgeMonths: 2,
    isActive: true,
    notes: "",
  },
  {
    id: mockVaccineSeq++,
    organizationId: 5,
    name: "Пентаксим",
    manufacturer: "Sanofi",
    targetDisease: "АКДС + полиомиелит + ХИБ",
    dosesRequired: 4,
    intervalDays: 45,
    recommendedAgeMonths: 3,
    isActive: true,
    notes: "",
  },
];

const mockBatches: VaccineBatch[] = [
  {
    id: mockBatchSeq++,
    organizationId: 5,
    branchId: 3,
    vaccineId: 1,
    vaccineName: "Превенар 13",
    productId: 42,
    batchNumber: "A12345",
    expiresAt: "2027-12-31",
    quantityInitial: 20,
    remaining: 17,
    costPrice: "1800.00",
    receivedAt: "2026-01-10",
    supplier: "Фармимпекс",
    notes: "",
  },
];

const mockRecords: VaccinationRecord[] = [];

const mockSlots: VaccinationScheduleSlot[] = [
  {
    id: mockSlotSeq++,
    organizationId: 5,
    patientId: 10,
    branchId: 3,
    vaccineId: 1,
    vaccineName: "Превенар 13",
    doseNumber: 2,
    scheduledDate: plusDays(today(), 5),
    status: "planned",
    recordId: null,
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    patientName: "Асанов Тимур",
    patientPhone: "+996700111222",
  },
  {
    id: mockSlotSeq++,
    organizationId: 5,
    patientId: 11,
    branchId: 3,
    vaccineId: 2,
    vaccineName: "Пентаксим",
    doseNumber: 1,
    scheduledDate: plusDays(today(), -3),
    status: "overdue",
    recordId: null,
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    patientName: "Кадырова Амина",
    patientPhone: "+996700333444",
  },
];

// ── API: справочник вакцин ─────────────────────────────────────────────────────

export function getVaccines(
  opts: { search?: string; includeInactive?: boolean; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<Vaccine[]> {
  if (VACCINATIONS_USE_MOCKS) {
    let list = mockVaccines;
    if (!opts.includeInactive) list = list.filter((v) => v.isActive);
    if (opts.search) {
      const s = opts.search.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(s));
    }
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.includeInactive) q.set("includeInactive", "true");
  const qs = q.toString();
  return apiRequest<{ results: Vaccine[] } | Vaccine[]>(
    withOrg(`/vaccinations/vaccines/${qs ? `?${qs}` : ""}`, opts.organizationId),
    { signal },
  ).then(toList);
}

export function createVaccine(
  payload: CreateVaccinePayload,
  organizationId?: number,
): Promise<Vaccine> {
  if (VACCINATIONS_USE_MOCKS) {
    const vaccine: Vaccine = {
      id: mockVaccineSeq++,
      organizationId: organizationId ?? 5,
      name: payload.name,
      manufacturer: payload.manufacturer ?? "",
      targetDisease: payload.targetDisease ?? "",
      dosesRequired: payload.dosesRequired ?? 1,
      intervalDays: payload.intervalDays ?? null,
      recommendedAgeMonths: payload.recommendedAgeMonths ?? null,
      isActive: true,
      notes: payload.notes ?? "",
    };
    mockVaccines.push(vaccine);
    return mockDelay(vaccine);
  }
  return apiRequest<Vaccine>(withOrg("/vaccinations/vaccines/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateVaccine(
  vaccineId: number,
  payload: UpdateVaccinePayload,
  organizationId?: number,
): Promise<Vaccine> {
  if (VACCINATIONS_USE_MOCKS) {
    const v = mockVaccines.find((x) => x.id === vaccineId);
    if (!v) return Promise.reject(new Error("Вакцина не найдена"));
    Object.assign(v, payload);
    return mockDelay(v);
  }
  return apiRequest<Vaccine>(withOrg(`/vaccinations/vaccines/${vaccineId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

// ── API: партии на складе ──────────────────────────────────────────────────────

export function getBatches(
  opts: {
    branchId?: number;
    vaccineId?: number;
    expiresBefore?: string;
    organizationId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<VaccineBatch[]> {
  if (VACCINATIONS_USE_MOCKS) {
    let list = mockBatches;
    if (opts.branchId != null) list = list.filter((b) => b.branchId === opts.branchId);
    if (opts.vaccineId != null) list = list.filter((b) => b.vaccineId === opts.vaccineId);
    if (opts.expiresBefore) list = list.filter((b) => b.expiresAt < opts.expiresBefore!);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (opts.branchId != null) q.set("branchId", String(opts.branchId));
  if (opts.vaccineId != null) q.set("vaccineId", String(opts.vaccineId));
  if (opts.expiresBefore) q.set("expiresBefore", opts.expiresBefore);
  const qs = q.toString();
  return apiRequest<{ results: VaccineBatch[] } | VaccineBatch[]>(
    withOrg(`/vaccinations/batches/${qs ? `?${qs}` : ""}`, opts.organizationId),
    { signal },
  ).then(toList);
}

export function createBatch(
  payload: CreateBatchPayload,
  organizationId?: number,
): Promise<VaccineBatch> {
  if (VACCINATIONS_USE_MOCKS) {
    const vaccine = mockVaccines.find((v) => v.id === payload.vaccineId);
    const batch: VaccineBatch = {
      id: mockBatchSeq++,
      organizationId: organizationId ?? 5,
      branchId: payload.branchId,
      vaccineId: payload.vaccineId,
      vaccineName: vaccine?.name ?? `Вакцина #${payload.vaccineId}`,
      productId: payload.productId ?? null,
      batchNumber: payload.batchNumber,
      expiresAt: payload.expiresAt,
      quantityInitial: payload.quantityInitial,
      remaining: payload.quantityInitial,
      costPrice: payload.costPrice ?? "0",
      receivedAt: payload.receivedAt ?? today(),
      supplier: payload.supplier ?? "",
      notes: payload.notes ?? "",
    };
    mockBatches.push(batch);
    return mockDelay(batch);
  }
  return apiRequest<VaccineBatch>(withOrg("/vaccinations/batches/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateBatch(
  batchId: number,
  payload: UpdateBatchPayload,
  organizationId?: number,
): Promise<VaccineBatch> {
  if (VACCINATIONS_USE_MOCKS) {
    const b = mockBatches.find((x) => x.id === batchId);
    if (!b) return Promise.reject(new Error("Партия не найдена"));
    Object.assign(b, payload);
    return mockDelay(b);
  }
  return apiRequest<VaccineBatch>(withOrg(`/vaccinations/batches/${batchId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

// ── API: записи о прививках ────────────────────────────────────────────────────

export function getRecords(
  filters: RecordsFilters = {},
  signal?: AbortSignal,
): Promise<VaccinationRecord[]> {
  if (VACCINATIONS_USE_MOCKS) {
    let list = mockRecords;
    if (filters.patientId != null) list = list.filter((r) => r.patientId === filters.patientId);
    if (filters.branchId != null) list = list.filter((r) => r.branchId === filters.branchId);
    if (filters.dateFrom) list = list.filter((r) => r.administeredAt.slice(0, 10) >= filters.dateFrom!);
    if (filters.dateTo) list = list.filter((r) => r.administeredAt.slice(0, 10) <= filters.dateTo!);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (filters.patientId != null) q.set("patientId", String(filters.patientId));
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) q.set("dateTo", filters.dateTo);
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  const qs = q.toString();
  return apiRequest<{ results: VaccinationRecord[] } | VaccinationRecord[]>(
    `/vaccinations/records/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then(toList);
}

export function getRecord(
  recordId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<VaccinationRecord> {
  if (VACCINATIONS_USE_MOCKS) {
    const r = mockRecords.find((x) => x.id === recordId);
    if (!r) return Promise.reject(new Error("Запись не найдена"));
    return mockDelay(r);
  }
  return apiRequest<VaccinationRecord>(
    withOrg(`/vaccinations/records/${recordId}/`, organizationId),
    { signal },
  );
}

export function createRecord(
  payload: CreateRecordPayload,
  organizationId?: number,
): Promise<VaccinationRecord> {
  if (VACCINATIONS_USE_MOCKS) {
    const vaccine = mockVaccines.find((v) => v.id === payload.vaccineId);
    const record: VaccinationRecord = {
      id: mockRecordSeq++,
      organizationId: organizationId ?? 5,
      patientId: payload.patientId,
      branchId: payload.branchId,
      appointmentId: payload.appointmentId ?? null,
      serviceLineId: null,
      vaccineId: payload.vaccineId,
      vaccineName: vaccine?.name ?? `Вакцина #${payload.vaccineId}`,
      batchId: payload.isExternal ? null : payload.batchId ?? null,
      administeredAt: payload.administeredAt,
      doseNumber: payload.doseNumber,
      injectionSite: payload.injectionSite ?? "",
      administeredBy: payload.administeredById
        ? { id: payload.administeredById, fullName: `Сотрудник #${payload.administeredById}`, photoUrl: null, nickname: null }
        : null,
      isExternal: payload.isExternal ?? false,
      batchNumberManual: payload.batchNumberManual ?? "",
      expiresAtManual: payload.expiresAtManual ?? null,
      unitPrice: payload.unitPrice ?? "0",
      discountAmount: payload.discountAmount ?? "0",
      status: "pending",
      reactionNotes: "",
      nextDueDate:
        vaccine?.intervalDays != null
          ? plusDays(payload.administeredAt.slice(0, 10), vaccine.intervalDays)
          : null,
      notes: payload.notes ?? "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    mockRecords.unshift(record);
    return mockDelay(record);
  }
  return apiRequest<VaccinationRecord>(withOrg("/vaccinations/records/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateRecord(
  recordId: number,
  payload: UpdateRecordPayload,
  organizationId?: number,
): Promise<VaccinationRecord> {
  if (VACCINATIONS_USE_MOCKS) {
    const r = mockRecords.find((x) => x.id === recordId);
    if (!r) return Promise.reject(new Error("Запись не найдена"));
    Object.assign(r, payload, { updatedAt: nowIso() });
    return mockDelay(r);
  }
  return apiRequest<VaccinationRecord>(
    withOrg(`/vaccinations/records/${recordId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

/** Отменить запись: возврат дозы на склад, снятие строки счёта, откат слота в planned. */
export function cancelRecord(recordId: number, organizationId?: number): Promise<VaccinationRecord> {
  return updateRecord(recordId, { status: "canceled" }, organizationId);
}

/** Наблюдение после прививки (реакция). */
export function addReactionNote(
  recordId: number,
  reactionNotes: string,
  organizationId?: number,
): Promise<VaccinationRecord> {
  return updateRecord(recordId, { reactionNotes }, organizationId);
}

// ── API: календарь ─────────────────────────────────────────────────────────────

/** Календарь одного пациента (все запланированные дозы). */
export function getPatientSchedule(
  patientId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<VaccinationScheduleSlot[]> {
  if (VACCINATIONS_USE_MOCKS) {
    return mockDelay(mockSlots.filter((s) => s.patientId === patientId));
  }
  return apiRequest<{ results: VaccinationScheduleSlot[] } | VaccinationScheduleSlot[]>(
    withOrg(`/vaccinations/patients/${patientId}/schedule/`, organizationId),
    { signal },
  ).then(toList);
}

/** История сделанных прививок пациента. */
export function getPatientHistory(
  patientId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<VaccinationRecord[]> {
  if (VACCINATIONS_USE_MOCKS) {
    return mockDelay(mockRecords.filter((r) => r.patientId === patientId));
  }
  return apiRequest<{ results: VaccinationRecord[] } | VaccinationRecord[]>(
    withOrg(`/vaccinations/patients/${patientId}/history/`, organizationId),
    { signal },
  ).then(toList);
}

/** Дашборд «кому пора» — по всем пациентам филиала. */
export function getScheduleDashboard(
  filters: ScheduleDashboardFilters = {},
  signal?: AbortSignal,
): Promise<VaccinationScheduleSlot[]> {
  if (VACCINATIONS_USE_MOCKS) {
    let list = mockSlots.filter((s) => s.status === "planned" || s.status === "overdue");
    if (filters.branchId != null) list = list.filter((s) => s.branchId === filters.branchId);
    if (filters.patientId != null) list = list.filter((s) => s.patientId === filters.patientId);
    if (filters.dueBefore) list = list.filter((s) => s.scheduledDate <= filters.dueBefore!);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (filters.dueBefore) q.set("dueBefore", filters.dueBefore);
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.patientId != null) q.set("patientId", String(filters.patientId));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  const qs = q.toString();
  return apiRequest<{ results: VaccinationScheduleSlot[] } | VaccinationScheduleSlot[]>(
    `/vaccinations/schedule/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then(toList);
}

export function updateSchedule(
  slotId: number,
  payload: UpdateSchedulePayload,
  organizationId?: number,
): Promise<VaccinationScheduleSlot> {
  if (VACCINATIONS_USE_MOCKS) {
    const s = mockSlots.find((x) => x.id === slotId);
    if (!s) return Promise.reject(new Error("Слот не найден"));
    Object.assign(s, payload, { updatedAt: nowIso() });
    return mockDelay(s);
  }
  return apiRequest<VaccinationScheduleSlot>(
    withOrg(`/vaccinations/schedule/${slotId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

export function createSchedule(
  payload: CreateSchedulePayload,
  organizationId?: number,
): Promise<VaccinationScheduleSlot> {
  if (VACCINATIONS_USE_MOCKS) {
    const vaccine = mockVaccines.find((v) => v.id === payload.vaccineId);
    const slot: VaccinationScheduleSlot = {
      id: mockSlotSeq++,
      organizationId: organizationId ?? 5,
      patientId: payload.patientId,
      branchId: payload.branchId,
      vaccineId: payload.vaccineId,
      vaccineName: vaccine?.name ?? `Вакцина #${payload.vaccineId}`,
      doseNumber: payload.doseNumber,
      scheduledDate: payload.scheduledDate,
      status: payload.scheduledDate < today() ? "overdue" : "planned",
      recordId: null,
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    mockSlots.push(slot);
    return mockDelay(slot);
  }
  return apiRequest<VaccinationScheduleSlot>(withOrg("/vaccinations/schedule/", organizationId), {
    method: "POST",
    body: payload,
  });
}
