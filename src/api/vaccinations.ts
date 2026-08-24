import { ApiError, apiRequest } from "./client";

/**
 * Модуль «Прививки» (vaccinations).
 *
 * Контракт: frontend-vaccinations-guide.md + changelog от 21.08.2026
 * (`vaccinations_frontend_changelog.md`): привязка дозы к строке товара приёма,
 * пагинация дашборда, ageDays/maxAgeMonths в шаблоне календаря.
 * НЕ менять форму без согласования с бэкенд-командой.
 *
 * Моки оставлены для локальной отладки без бэка (VACCINATIONS_USE_MOCKS = true).
 *
 * Расхождения changelog'а с живым API (проверено 23.08.2026 на newcrm.pediatr.kg,
 * орг 1) — верим API, не тексту:
 * - статус сделанного слота — "done", а не обещанный "completed"
 *   (`?status=completed` отдаёт 0 записей);
 * - `?status` на `/records/` игнорируется (все 8 записей приходят при любом);
 * - записей в статусе "draft" на проде пока нет — автосоздание черновика при
 *   продаже товара-вакцины вживую не наблюдалось.
 *
 * Открытые вопросы бэку (предположения фронта, не факт из документации):
 * - точный набор injectionSite (гайд показывает только "left_arm").
 * organizationId query-параметром суперпользователю обязателен.
 */

export const VACCINATIONS_USE_MOCKS = false;

/**
 * Списание доз партии (порча / истёк срок / холодовая цепь).
 * `POST /vaccinations/batches/<id>/write-off/` — тикет
 * `MamaDoc/backend_ticket_vaccinations_batch_writeoff.md`, бэк реализовал
 * контракт один в один (28.07.2026).
 */
export const VACCINATION_BATCH_WRITEOFF_ENABLED = true;

/**
 * Резать ли дашборд «Кому пора» по активному филиалу.
 *
 * С 21.08.2026 слоты без филиала (`branchId: null`) бэк считает общими и отдаёт
 * при любом `?branchId`: на проде `?branchId=1` возвращает 1758 слотов из 1761
 * (проверено 23.08.2026). Раньше фильтр был строгим и вкладка пустела при сотнях
 * просроченных доз — поэтому скоуп держали выключенным.
 */
export const VACCINATION_SCHEDULE_BRANCH_SCOPING = true;

/**
 * Размер страницы дашборда «Кому пора».
 *
 * `GET /vaccinations/schedule/` с 21.08.2026 пагинирован (`count/next/previous`),
 * по умолчанию отдаёт 20 записей — для таблицы мало. Прежний обходной путь
 * (сервер игнорировал `pageSize`/`ordering`/`status` и отдавал первые 500 самых
 * старых доз) больше не нужен: все фильтры работают.
 */
export const SCHEDULE_DASHBOARD_PAGE_SIZE = 50;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Справочник вакцин. Источник истины «это вакцина» с 23.07.2026 — флаг
 * товара склада `isVaccine`; товары-вакцины тянем через
 * getProducts({ isVaccine: true }). Карточка вакцины авто-создаётся бэком при
 * переключении товара в isVaccine=true; в разделе прививок редактируем только
 * медицинские поля (manufacturer/targetDisease/dosesRequired/... — см. гайд).
 */
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
  /** Связанный товар склада (может отсутствовать у старых карточек). */
  productId: number | null;
  productName: string | null;
  /** Актуальная цена Product.price, строка-decimal; null — товара нет. */
  price: string | null;
  /** Остаток товара; строка-decimal. Можно сузить ?branchId= (см. getVaccines). */
  stock: string;
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
  /** Read-поля товара (с 23.07.2026): имя и актуальная цена Product.price (строка-decimal). */
  productName: string | null;
  productPrice: string | null;
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
  /**
   * Всего списано доз по партии (порча/срок). Поле запрошено тикетом
   * `backend_ticket_vaccinations_batch_writeoff.md` — до его реализации в
   * ответах отсутствует, поэтому необязательное (UI трактует undefined как 0).
   */
  writtenOff?: number;
}

export interface CreateBatchPayload {
  branchId: number;
  vaccineId: number;
  /**
   * Необязательно: если у карточки вакцины уже есть товар, бэк подставит его
   * автоматически (с 23.07.2026). Явный productId обязан указывать на товар
   * с isVaccine=true и совпадать с товаром карточки.
   */
  productId?: number | null;
  batchNumber: string;
  expiresAt: string;
  quantityInitial: number;
  /** Обязательное: без него бэк отвечает 400 (проверено на тесте 17.08.2026). */
  receivedAt: string;
  costPrice?: string;
  supplier?: string;
  notes?: string;
}

export type UpdateBatchPayload = Partial<Omit<CreateBatchPayload, "vaccineId">>;

/**
 * Причина списания доз. Набор slug'ов — предложение фронта (тикет
 * `backend_ticket_vaccinations_batch_writeoff.md`, п. 2.1), бэк его пока не
 * подтвердил; тип терпим к строке, подписи — в `pages/vaccinations/meta.tsx`.
 */
export type BatchWriteOffReason =
  | "expired"
  | "cold_chain"
  | "damaged"
  | "broken"
  | "lost"
  | "other"
  | string;

export interface WriteOffBatchPayload {
  /** Целое > 0, не больше remaining. */
  quantity: number;
  reason: BatchWriteOffReason;
  /** YYYY-MM-DD; без него бэк ставит сегодня. */
  occurredAt?: string;
  notes?: string;
}

/** Строка истории списаний партии. */
export interface BatchWriteOff {
  id: number;
  batchId: number;
  quantity: number;
  reason: BatchWriteOffReason;
  occurredAt: string; // YYYY-MM-DD
  notes: string;
  createdByName: string;
  createdAt: string;
}

/**
 * Место укола. Гайд фиксирует только "left_arm" — остальные значения
 * предположение фронта (см. INJECTION_SITE_OPTIONS в meta); поле терпимо к
 * произвольной строке, если бэк использует другие slug'и.
 */
export type InjectionSite = string;

/**
 * Статус записи о прививке.
 *
 * "draft" (с 21.08.2026) бэк ставит сам, когда регистратор продал товар-вакцину
 * в приёме, — медсестре остаётся дозаполнить. "done" — предположение фронта
 * (гайд обещает "completed", но на проде записи только в "pending", проверено
 * 23.08.2026). Поле терпимо к произвольной строке.
 */
export type VaccinationRecordStatus =
  | "draft"
  | "pending"
  | "done"
  | "completed"
  | "canceled"
  | string;

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
  /**
   * Строка товара приёма, к которой привязана доза (с 21.08.2026). Пока она
   * заполнена, повторного биллинга и списания склада не происходит: запись
   * «садится» на уже проданную вакцину. null у записей старше фикса и у доз без
   * приёма.
   */
  productLineId: number | null;
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
  /** Записи одного приёма (с 21.08.2026). Фильтра по статусу у эндпоинта нет. */
  appointmentId?: number;
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
  /**
   * К какой строке товара приёма привязать дозу. Если у приёма ровно одна
   * свободная строка этой вакцины — бэк найдёт её сам и поле можно не слать;
   * при нескольких строках без него привязка не состоится.
   */
  productLineId?: number | null;
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

/**
 * Статус слота календаря.
 *
 * ⚠ Сделанная доза на проде — "done"; changelog от 21.08.2026 обещает
 * "completed", но `?status=completed` отдаёт 0 записей, а `?status=done` — три
 * (проверено 23.08.2026 на newcrm.pediatr.kg). "completed" держим в типе как
 * запасной вариант, чтобы чипы не пропали, если бэк всё-таки переименует.
 */
export type ScheduleStatus = "planned" | "overdue" | "done" | "completed" | "skipped";

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
  /**
   * Поля шаблона нац. календаря (с 23.07.2026). Заполнены у слотов, достроенных
   * из шаблона; null у вручную созданных/перенесённых. label — человекочитаемая
   * подпись возраста («3 месяца»), пустая строка если нет.
   */
  templateId: number | null;
  ageMonths: number | null;
  dueWindowDays: number | null;
  mandatory: boolean | null;
  label: string;
  /** Для дашборда «Кому пора» (все пациенты) — бэк заполняет с 21.08.2026. */
  patientName?: string;
  patientPhone?: string;
}

export interface ScheduleDashboardFilters {
  dueAfter?: string; // YYYY-MM-DD
  dueBefore?: string; // YYYY-MM-DD
  status?: ScheduleStatus;
  branchId?: number;
  patientId?: number;
  /** Поле сортировки бэка (минус = по убыванию), например "-scheduledDate". */
  ordering?: string;
  page?: number;
  pageSize?: number;
  organizationId?: number;
}

/** Страница дашборда «Кому пора»: бэк пагинирует выдачу с 21.08.2026. */
export interface ScheduleDashboardPage {
  items: VaccinationScheduleSlot[];
  /** Всего слотов под фильтром (не на странице). */
  count: number;
  hasNext: boolean;
  /**
   * Ответ пришёл пагинированным. false — перед нами бэк старее 21.08.2026: он
   * отдаёт весь список массивом и молча игнорирует `status`/`ordering`/`pageSize`,
   * поэтому фильтровать и считать сводку приходится на клиенте (так на тестовом
   * контуре 23.08.2026, пока прод уже новый).
   */
  paginated: boolean;
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
let mockWriteOffSeq = 700;

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
    productId: 42,
    productName: "Превенар 13",
    price: "2500.00",
    stock: "17",
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
    productId: 43,
    productName: "Пентаксим",
    price: "3200.00",
    stock: "8",
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
    productName: "Превенар 13",
    productPrice: "2500.00",
    batchNumber: "A12345",
    expiresAt: "2027-12-31",
    quantityInitial: 20,
    remaining: 17,
    costPrice: "1800.00",
    receivedAt: "2026-01-10",
    supplier: "Фармимпекс",
    notes: "",
    writtenOff: 0,
  },
];

const mockWriteOffs: BatchWriteOff[] = [];

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
    templateId: null,
    ageMonths: null,
    dueWindowDays: null,
    mandatory: null,
    label: "",
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
    templateId: null,
    ageMonths: null,
    dueWindowDays: null,
    mandatory: null,
    label: "",
    patientName: "Кадырова Амина",
    patientPhone: "+996700333444",
  },
];

// ── API: справочник вакцин ─────────────────────────────────────────────────────

export function getVaccines(
  opts: {
    search?: string;
    includeInactive?: boolean;
    /** Сузить поле stock карточки остатком конкретного филиала. */
    branchId?: number;
    organizationId?: number;
  } = {},
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
  if (opts.branchId != null) q.set("branchId", String(opts.branchId));
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
      productId: null,
      productName: null,
      price: null,
      stock: "0",
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
      productName: vaccine?.productName ?? null,
      productPrice: vaccine?.price ?? null,
      batchNumber: payload.batchNumber,
      expiresAt: payload.expiresAt,
      quantityInitial: payload.quantityInitial,
      remaining: payload.quantityInitial,
      costPrice: payload.costPrice ?? "0",
      receivedAt: payload.receivedAt ?? today(),
      supplier: payload.supplier ?? "",
      notes: payload.notes ?? "",
      writtenOff: 0,
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

/**
 * Списать дозы партии (порча, истёк срок, холодовая цепь). Право
 * `vaccinations.manage`. Ответ — обновлённая партия (remaining уже уменьшен,
 * writtenOff увеличен). Ошибка «списываем больше остатка» приходит текстом от
 * бэка и показывается пользователем как есть.
 *
 * ⚠ Эндпоинт запрошен тикетом, но бэком пока НЕ реализован — вызывать только
 * под флагом VACCINATION_BATCH_WRITEOFF_ENABLED.
 */
export function writeOffBatch(
  batchId: number,
  payload: WriteOffBatchPayload,
  organizationId?: number,
): Promise<VaccineBatch> {
  if (VACCINATIONS_USE_MOCKS) {
    const b = mockBatches.find((x) => x.id === batchId);
    if (!b) return Promise.reject(new Error("Партия не найдена"));
    if (payload.quantity > b.remaining) {
      return Promise.reject(
        new Error(`Нельзя списать ${payload.quantity} доз: в партии осталось ${b.remaining}`),
      );
    }
    b.remaining -= payload.quantity;
    b.writtenOff = (b.writtenOff ?? 0) + payload.quantity;
    mockWriteOffs.push({
      id: mockWriteOffSeq++,
      batchId,
      quantity: payload.quantity,
      reason: payload.reason,
      occurredAt: payload.occurredAt ?? today(),
      notes: payload.notes ?? "",
      createdByName: "Тестовый пользователь",
      createdAt: nowIso(),
    });
    return mockDelay(b);
  }
  return apiRequest<VaccineBatch>(
    withOrg(`/vaccinations/batches/${batchId}/write-off/`, organizationId),
    { method: "POST", body: payload },
  );
}

/** История списаний партии (право `vaccinations.view`). */
export function getBatchWriteOffs(
  batchId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<BatchWriteOff[]> {
  if (VACCINATIONS_USE_MOCKS) {
    return mockDelay(mockWriteOffs.filter((w) => w.batchId === batchId));
  }
  return apiRequest<{ results: BatchWriteOff[] } | BatchWriteOff[]>(
    withOrg(`/vaccinations/batches/${batchId}/write-offs/`, organizationId),
    { signal },
  ).then(toList);
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
    if (filters.appointmentId != null)
      list = list.filter((r) => r.appointmentId === filters.appointmentId);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (filters.patientId != null) q.set("patientId", String(filters.patientId));
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) q.set("dateTo", filters.dateTo);
  if (filters.appointmentId != null) q.set("appointmentId", String(filters.appointmentId));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  const qs = q.toString();
  return apiRequest<{ results: VaccinationRecord[] } | VaccinationRecord[]>(
    `/vaccinations/records/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then(toList);
}

/**
 * Записи прививок одного приёма — для индикатора «оформлена / не оформлена» в
 * карточке приёма. Отменённые дозы отбрасываем: строка товара после отмены
 * снова свободна.
 */
export function getRecordsByAppointment(
  appointmentId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<VaccinationRecord[]> {
  return getRecords({ appointmentId, organizationId }, signal).then((list) =>
    list.filter((r) => r.appointmentId === appointmentId && r.status !== "canceled"),
  );
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
      productLineId: payload.productLineId ?? null,
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

/**
 * Доза уже зарегистрирована в этом приёме (HTTP 409 на связку
 * appointmentId + vaccineId + doseNumber, с 21.08.2026). Возвращает текст бэка
 * — он человекочитаемый («Прививка дозы 1 уже зарегистрирована в этом приёме»).
 */
export function parseDuplicateDoseConflict(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const detail = (err.payload as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail
    ? detail
    : "Эта доза уже зарегистрирована в приёме.";
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

/** Дашборд «Кому пора» — по всем пациентам филиала, страницами. */
export function getScheduleDashboard(
  filters: ScheduleDashboardFilters = {},
  signal?: AbortSignal,
): Promise<ScheduleDashboardPage> {
  const pageSize = filters.pageSize ?? SCHEDULE_DASHBOARD_PAGE_SIZE;
  const page = filters.page ?? 1;
  if (VACCINATIONS_USE_MOCKS) {
    let list = mockSlots.filter((s) => s.status === "planned" || s.status === "overdue");
    if (filters.status) list = list.filter((s) => s.status === filters.status);
    if (filters.branchId != null) list = list.filter((s) => s.branchId === filters.branchId);
    if (filters.patientId != null) list = list.filter((s) => s.patientId === filters.patientId);
    if (filters.dueAfter) list = list.filter((s) => s.scheduledDate >= filters.dueAfter!);
    if (filters.dueBefore) list = list.filter((s) => s.scheduledDate <= filters.dueBefore!);
    const from = (page - 1) * pageSize;
    return mockDelay({
      items: list.slice(from, from + pageSize),
      count: list.length,
      hasNext: from + pageSize < list.length,
      paginated: true,
    });
  }
  const q = new URLSearchParams();
  if (filters.dueAfter) q.set("dueAfter", filters.dueAfter);
  if (filters.dueBefore) q.set("dueBefore", filters.dueBefore);
  if (filters.status) q.set("status", filters.status);
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.patientId != null) q.set("patientId", String(filters.patientId));
  if (filters.ordering) q.set("ordering", filters.ordering);
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  q.set("page", String(page));
  q.set("pageSize", String(pageSize));
  return apiRequest<
    { results: VaccinationScheduleSlot[]; count?: number; next?: string | null } | VaccinationScheduleSlot[]
  >(`/vaccinations/schedule/?${q.toString()}`, { signal }).then((data) => {
    const items = toList(data);
    // Пагинации может не быть у старого бэка — тогда пришёл весь список разом.
    const paginated = !Array.isArray(data);
    return {
      items,
      count: paginated ? data.count ?? items.length : items.length,
      hasNext: paginated ? Boolean(data.next) : false,
      paginated,
    };
  });
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
      templateId: null,
      ageMonths: null,
      dueWindowDays: null,
      mandatory: null,
      label: "",
    };
    mockSlots.push(slot);
    return mockDelay(slot);
  }
  return apiRequest<VaccinationScheduleSlot>(withOrg("/vaccinations/schedule/", organizationId), {
    method: "POST",
    body: payload,
  });
}

// ── API: национальный календарь (шаблон организации) ────────────────────────────

/**
 * Строка шаблона нац. календаря (с 23.07.2026). Шаблон общий для организации,
 * не для филиала. Уникальность строки — (organization, vaccine, doseNumber).
 * ageMonths — точка в календарных месяцах от birthDate; dueWindowDays — окно
 * до просрочки.
 */
export interface CalendarTemplateRow {
  id: number;
  organizationId: number;
  vaccineId: number;
  vaccineName: string;
  doseNumber: number;
  ageMonths: number;
  /**
   * Точный возраст в днях (с 21.08.2026) — для доз вроде «4,5 месяца» (135 дней).
   * Если заполнен, бэк считает срок по нему, а ageMonths игнорирует.
   */
  ageDays: number | null;
  /** Верхняя граница возраста: пациенту старше слот не создаётся (с 21.08.2026). */
  maxAgeMonths: number | null;
  dueWindowDays: number;
  mandatory: boolean;
  label: string;
  isActive: boolean;
}

export interface CreateCalendarTemplatePayload {
  vaccineId: number;
  doseNumber: number;
  ageMonths: number;
  ageDays?: number | null;
  maxAgeMonths?: number | null;
  dueWindowDays: number;
  mandatory?: boolean;
  label?: string;
  isActive?: boolean;
}

export type UpdateCalendarTemplatePayload = Partial<CreateCalendarTemplatePayload>;

/** Права: чтение vaccinations.view. */
export function getCalendarTemplate(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<CalendarTemplateRow[]> {
  return apiRequest<{ results: CalendarTemplateRow[] } | CalendarTemplateRow[]>(
    withOrg("/vaccinations/calendar-template/", organizationId),
    { signal },
  ).then(toList);
}

/** Права: запись vaccinations.manage. */
export function createCalendarTemplate(
  payload: CreateCalendarTemplatePayload,
  organizationId?: number,
): Promise<CalendarTemplateRow> {
  return apiRequest<CalendarTemplateRow>(
    withOrg("/vaccinations/calendar-template/", organizationId),
    { method: "POST", body: payload },
  );
}

export function updateCalendarTemplate(
  templateId: number,
  payload: UpdateCalendarTemplatePayload,
  organizationId?: number,
): Promise<CalendarTemplateRow> {
  return apiRequest<CalendarTemplateRow>(
    withOrg(`/vaccinations/calendar-template/${templateId}/`, organizationId),
    { method: "PATCH", body: payload },
  );
}

/**
 * Удаление строки шаблона. С 21.08.2026 бэк каскадом сносит нетронутые слоты
 * пациентов (planned, без заметок и без записи) — «осиротевшие» дозы больше не
 * блокируют повторное создание строки. Пропущенные и уже сделанные сохраняются.
 */
export function deleteCalendarTemplate(
  templateId: number,
  organizationId?: number,
): Promise<void> {
  return apiRequest<void>(
    withOrg(`/vaccinations/calendar-template/${templateId}/`, organizationId),
    { method: "DELETE" },
  );
}

// ── API: месячный отчёт ─────────────────────────────────────────────────────────

export interface MonthlyReportRow {
  templateId: number;
  vaccineId: number;
  vaccineName: string;
  doseNumber: number;
  ageMonths: number;
  /** Детям в выбранном месяце исполняется плановый возраст дозы. */
  planned: number;
  /** Есть любая неотменённая запись дозы (внутренняя или внешняя). */
  done: number;
  /** Подмножество done, выполненное вне клиники. */
  externalDone: number;
  /** Записи нет и завершилось dueWindowDays после плановой даты. */
  overdue: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  branchId: number | null;
  rows: MonthlyReportRow[];
  totals: Omit<MonthlyReportRow, "templateId" | "vaccineId" | "vaccineName" | "doseNumber" | "ageMonths">;
}

/**
 * Месячный отчёт по нац. календарю. month обязателен (YYYY-MM). branchId
 * опционален: с ним — строго по пациентам филиала, без него — по доступному
 * пользователю скоупу организации.
 */
export function getMonthlyReport(
  opts: { month: string; branchId?: number; organizationId?: number },
  signal?: AbortSignal,
): Promise<MonthlyReport> {
  const q = new URLSearchParams();
  q.set("month", opts.month);
  if (opts.branchId != null) q.set("branchId", String(opts.branchId));
  return apiRequest<MonthlyReport>(
    withOrg(`/vaccinations/monthly-report/?${q.toString()}`, opts.organizationId),
    { signal },
  );
}
