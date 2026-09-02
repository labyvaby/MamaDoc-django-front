import { apiRequest } from "./client";

/**
 * Модуль «Лист ожидания»: пациент, которому не хватило свободного окна, встаёт
 * в очередь на врача/период; когда окно освобождается — CRM подсказывает
 * регистратору, кому позвонить.
 *
 * Контракт: MamaDoc/backend_ticket_waitlist_module.md — НЕ менять без
 * согласования с бэкенд-командой. ТЗ: MamaDoc/TZ_waitlist_module.md.
 *
 * Бэкенд ещё не реализован — модуль работает на моках (см. WAITLIST_USE_MOCKS).
 * Переключение на живой API — одна константа ниже; сетевые вызовы уже написаны
 * по контракту, менять их не потребуется.
 */

/** true — данные из памяти вкладки; false — живой API. */
export const WAITLIST_USE_MOCKS = true;

/**
 * Модуль целиком: пункт меню, роут `/waitlist`, кнопки очереди в «Приёмах» и
 * подсказка «кому позвонить», когда окно освободилось.
 *
 * ⚠ Выключен до выкладки бэкенда: на проде `/api/waitlist/` отвечает 404
 * (проверено 02.09.2026), а на моках регистратор увидел бы выдуманную
 * очередь — и стал бы звонить людям, которых в ней нет. Гейта по правам
 * мало: роль `superadmin` проходит в `usePermissions` любую проверку, а на
 * проде эта роль есть у живых аккаунтов. Включать вместе с
 * `WAITLIST_USE_MOCKS = false`.
 */
export const WAITLIST_MODULE_ENABLED = false;

// ── Types ─────────────────────────────────────────────────────────────────────

export type WaitlistStatus = "waiting" | "offered" | "scheduled" | "cancelled" | "expired";

export type WaitlistPriority = "normal" | "urgent";

/** Откуда пришла запись: персонал в CRM или гость с витрины /book. */
export type WaitlistSource = "staff" | "public";

export type WaitlistContactResult = "no_answer" | "refused" | "agreed" | "callback_later";

/** Статусы, в которых запись закрыта и в подсказках больше не участвует. */
export const WAITLIST_CLOSED_STATUSES: readonly WaitlistStatus[] = [
  "scheduled",
  "cancelled",
  "expired",
];

/** Статусы, которые участвуют в матчинге на освободившийся слот. */
export const WAITLIST_ACTIVE_STATUSES: readonly WaitlistStatus[] = ["waiting", "offered"];

export interface WaitlistServiceRef {
  id: number;
  name: string;
}

export interface WaitlistContact {
  id: number;
  actorId: number | null;
  actorName: string;
  result: WaitlistContactResult;
  note: string;
  /** Заполнены, если касание было предложением конкретного окна (offer/). */
  offeredEmployeeId: number | null;
  offeredStart: string | null;
  createdAt: string;
}

export interface WaitlistEntry {
  id: number;
  /** Карта пациента, если он уже в базе; иначе запись живёт как имя + телефон. */
  patientId: number | null;
  patientName: string | null;
  contactName: string;
  phone: string;
  /** «Жду конкретного врача». null — любой врач специализации. */
  employeeId: number | null;
  employeeName: string | null;
  specializationId: number | null;
  specializationName: string | null;
  services: WaitlistServiceRef[];
  branchId: number | null;
  branchName: string | null;
  /** Желаемый период, `YYYY-MM-DD`. Пусто с обеих сторон = «когда угодно». */
  desiredDateFrom: string | null;
  desiredDateTo: string | null;
  /** Окно внутри дня, `HH:MM` («после 15:00»). */
  desiredTimeFrom: string | null;
  desiredTimeTo: string | null;
  /** Дни недели ISO 1–7 (пн–вс). Пустой массив = любые дни. */
  desiredWeekdays: number[];
  priority: WaitlistPriority;
  comment: string;
  status: WaitlistStatus;
  source: WaitlistSource;
  /** Приём, которым закрылось ожидание (status=scheduled). */
  appointmentId: number | null;
  /** После этой даты запись протухает (бэк переводит в expired). */
  activeUntil: string | null;
  lastContactAt: string | null;
  lastContactResult: WaitlistContactResult | null;
  contactsCount: number;
  createdById: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closeReason: string;
}

export interface WaitlistEntryDetail extends WaitlistEntry {
  contacts: WaitlistContact[];
}

export interface WaitlistResponse {
  results: WaitlistEntry[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface WaitlistFilters {
  /** Массив уходит одним параметром через запятую: status=waiting,offered. */
  status?: WaitlistStatus | readonly WaitlistStatus[];
  employeeId?: number;
  specializationId?: number;
  branchId?: number;
  priority?: WaitlistPriority;
  source?: WaitlistSource;
  search?: string;
  /** Дата постановки в лист (YYYY-MM-DD, включительно). */
  createdFrom?: string;
  createdTo?: string;
  /** Пересечение желаемого периода записи с этим диапазоном. */
  desiredFrom?: string;
  desiredTo?: string;
  /** smart — срочные, затем кто дольше ждёт (дефолт). */
  ordering?: "smart" | "created";
  page?: number;
  pageSize?: number;
  /** Обязателен для суперпользователя/мультиорг (см. withOrg). */
  organizationId?: number;
  // ── Матчинг «кто подходит под этот слот» (контракт §3) ──
  matchEmployeeId?: number;
  /** YYYY-MM-DD */
  matchDate?: string;
  /** HH:MM, локальное время клиники. */
  matchTime?: string;
  /** Филиал слота — запись без филиала подходит любому. */
  matchBranchId?: number;
}

export interface WaitlistSummary {
  waiting: number;
  offered: number;
  urgent: number;
  /** Записи, у которых activeUntil на подходе (порог задаёт бэк). */
  expiringSoon: number;
}

export interface CreateWaitlistPayload {
  patientId?: number | null;
  contactName: string;
  phone: string;
  employeeId?: number | null;
  specializationId?: number | null;
  serviceIds?: number[];
  branchId?: number | null;
  desiredDateFrom?: string | null;
  desiredDateTo?: string | null;
  desiredTimeFrom?: string | null;
  desiredTimeTo?: string | null;
  desiredWeekdays?: number[];
  priority?: WaitlistPriority;
  comment?: string;
  activeUntil?: string | null;
}

/**
 * PATCH tri-state (конвенция модуля tasks): `null` в поле НЕ очищает —
 * очистка только явными clear-флагами.
 */
export interface UpdateWaitlistPayload extends Partial<CreateWaitlistPayload> {
  clearPatient?: boolean;
  clearEmployee?: boolean;
  clearSpecialization?: boolean;
  clearBranch?: boolean;
  clearDesiredDates?: boolean;
  clearDesiredTimes?: boolean;
  clearActiveUntil?: boolean;
}

/** Счётчик подходящих кандидатов по дням — для бейджей на сетке окон. */
export interface WaitlistMatchCounts {
  counts: Record<string, number>;
}

// ── Моки ──────────────────────────────────────────────────────────────────────

const MOCK_ME = { id: 1, name: "Вы" };

type MockRecord = WaitlistEntryDetail;

let mockSeq = 0;
let mockContactSeq = 0;

const nowIso = () => new Date().toISOString();
const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

function seedEntry(patch: Partial<MockRecord>): MockRecord {
  const id = ++mockSeq;
  return {
    id,
    patientId: null,
    patientName: null,
    contactName: `Пациент ${id}`,
    phone: "+996700000000",
    employeeId: null,
    employeeName: null,
    specializationId: null,
    specializationName: null,
    services: [],
    branchId: null,
    branchName: null,
    desiredDateFrom: null,
    desiredDateTo: null,
    desiredTimeFrom: null,
    desiredTimeTo: null,
    desiredWeekdays: [],
    priority: "normal",
    comment: "",
    status: "waiting",
    source: "staff",
    appointmentId: null,
    activeUntil: isoDay(30),
    lastContactAt: null,
    lastContactResult: null,
    contactsCount: 0,
    createdById: MOCK_ME.id,
    createdByName: MOCK_ME.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    closedAt: null,
    closeReason: "",
    contacts: [],
    ...patch,
  };
}

const mockEntries: MockRecord[] = [
  seedEntry({
    contactName: "Айгерим Асанова",
    phone: "+996700123456",
    employeeId: 1,
    employeeName: "Иванова М. П.",
    specializationId: 1,
    specializationName: "Педиатр",
    desiredDateFrom: isoDay(0),
    desiredDateTo: isoDay(14),
    desiredTimeFrom: "15:00",
    desiredTimeTo: "19:00",
    priority: "urgent",
    comment: "Только после работы",
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
  seedEntry({
    contactName: "Нурбек Осмонов",
    phone: "+996555987654",
    specializationId: 1,
    specializationName: "Педиатр",
    desiredDateFrom: isoDay(0),
    desiredDateTo: isoDay(7),
    desiredWeekdays: [6, 7],
    comment: "Удобно только в выходные",
    createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  }),
  seedEntry({
    contactName: "Гульнара Ж.",
    phone: "+996770111222",
    employeeId: 1,
    employeeName: "Иванова М. П.",
    source: "public",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  }),
];

const mockDelay = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

function mockFind(entryId: number): MockRecord {
  const found = mockEntries.find((e) => e.id === entryId);
  if (!found) throw new Error("Запись листа ожидания не найдена");
  return found;
}

function toEntry(record: MockRecord): WaitlistEntry {
  const { contacts, ...rest } = record;
  return { ...rest, contactsCount: contacts.length };
}

function mockAddContact(
  record: MockRecord,
  result: WaitlistContactResult,
  note: string,
  offered?: { employeeId: number; start: string },
) {
  record.contacts.push({
    id: ++mockContactSeq,
    actorId: MOCK_ME.id,
    actorName: MOCK_ME.name,
    result,
    note,
    offeredEmployeeId: offered?.employeeId ?? null,
    offeredStart: offered?.start ?? null,
    createdAt: nowIso(),
  });
  record.lastContactAt = nowIso();
  record.lastContactResult = result;
  record.contactsCount = record.contacts.length;
  record.updatedAt = nowIso();
}

// ── Матчинг «подходит под слот» ───────────────────────────────────────────────

/** ISO-день недели 1–7 (пн–вс) для даты `YYYY-MM-DD`. */
function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export interface WaitlistSlot {
  employeeId: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM — если не задано, время не проверяется (счётчик по дню). */
  time?: string;
  branchId?: number | null;
  /** Специализации врача слота — для записей «жду любого педиатра». */
  employeeSpecializationIds?: number[];
}

/**
 * Правила совпадения записи и освободившегося окна. Продублированы в тикете
 * бэку (§3) дословно: сервер и фронт обязаны считать одинаково, иначе счётчик
 * «N ждут» и список кандидатов разойдутся.
 */
export function matchesSlot(entry: WaitlistEntry, slot: WaitlistSlot): boolean {
  if (!WAITLIST_ACTIVE_STATUSES.includes(entry.status)) return false;
  if (entry.activeUntil && entry.activeUntil < slot.date) return false;

  // Врач: либо ждут именно его, либо ждут специализацию, которая у него есть.
  if (entry.employeeId != null) {
    if (entry.employeeId !== slot.employeeId) return false;
  } else if (entry.specializationId != null) {
    const specs = slot.employeeSpecializationIds ?? [];
    if (!specs.includes(entry.specializationId)) return false;
  }

  if (entry.desiredDateFrom && slot.date < entry.desiredDateFrom) return false;
  if (entry.desiredDateTo && slot.date > entry.desiredDateTo) return false;

  if (entry.desiredWeekdays.length > 0 && !entry.desiredWeekdays.includes(isoWeekday(slot.date))) {
    return false;
  }

  if (slot.time) {
    if (entry.desiredTimeFrom && slot.time < entry.desiredTimeFrom) return false;
    if (entry.desiredTimeTo && slot.time > entry.desiredTimeTo) return false;
  }

  // Запись без филиала подходит любому; с филиалом — только своему.
  if (entry.branchId != null && slot.branchId != null && entry.branchId !== slot.branchId) {
    return false;
  }

  return true;
}

/** Сортировка кандидатов: срочные выше, затем — кто дольше ждёт. */
export function compareCandidates(a: WaitlistEntry, b: WaitlistEntry): number {
  const urgency = (e: WaitlistEntry) => (e.priority === "urgent" ? 1 : 0);
  return urgency(b) - urgency(a) || a.createdAt.localeCompare(b.createdAt);
}

// ── Служебное ─────────────────────────────────────────────────────────────────

/**
 * Бэк выводит организацию из membership сессии, но суперпользователю (и
 * мультиорг-аккаунту) нужен явный query-параметр organizationId — на всех
 * эндпоинтах модуля, включая POST/PATCH (те же грабли, что в tasks).
 */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

function buildParams(filters: WaitlistFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.status) {
    q.set("status", typeof filters.status === "string" ? filters.status : filters.status.join(","));
  }
  if (filters.employeeId != null) q.set("employeeId", String(filters.employeeId));
  if (filters.specializationId != null) {
    q.set("specializationId", String(filters.specializationId));
  }
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.priority) q.set("priority", filters.priority);
  if (filters.source) q.set("source", filters.source);
  if (filters.search) q.set("search", filters.search);
  if (filters.createdFrom) q.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) q.set("createdTo", filters.createdTo);
  if (filters.desiredFrom) q.set("desiredFrom", filters.desiredFrom);
  if (filters.desiredTo) q.set("desiredTo", filters.desiredTo);
  if (filters.ordering) q.set("ordering", filters.ordering);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  if (filters.matchEmployeeId != null) q.set("matchEmployeeId", String(filters.matchEmployeeId));
  if (filters.matchDate) q.set("matchDate", filters.matchDate);
  if (filters.matchTime) q.set("matchTime", filters.matchTime);
  if (filters.matchBranchId != null) q.set("matchBranchId", String(filters.matchBranchId));
  return q;
}

// ── API: список / карточка ────────────────────────────────────────────────────

export function getWaitlist(
  filters: WaitlistFilters = {},
  signal?: AbortSignal,
): Promise<WaitlistResponse> {
  if (WAITLIST_USE_MOCKS) {
    let list = mockEntries.map(toEntry);

    if (filters.status) {
      const wanted = typeof filters.status === "string" ? [filters.status] : filters.status;
      list = list.filter((e) => wanted.includes(e.status));
    }
    if (filters.employeeId != null) list = list.filter((e) => e.employeeId === filters.employeeId);
    if (filters.specializationId != null) {
      list = list.filter((e) => e.specializationId === filters.specializationId);
    }
    if (filters.branchId != null) list = list.filter((e) => e.branchId === filters.branchId);
    if (filters.priority) list = list.filter((e) => e.priority === filters.priority);
    if (filters.source) list = list.filter((e) => e.source === filters.source);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const digits = filters.search.replace(/\D/g, "");
      list = list.filter(
        (e) =>
          e.contactName.toLowerCase().includes(s) ||
          (e.patientName ?? "").toLowerCase().includes(s) ||
          e.comment.toLowerCase().includes(s) ||
          (digits.length >= 3 && e.phone.replace(/\D/g, "").includes(digits)),
      );
    }
    if (filters.createdFrom) {
      list = list.filter((e) => e.createdAt.slice(0, 10) >= filters.createdFrom!);
    }
    if (filters.createdTo) {
      list = list.filter((e) => e.createdAt.slice(0, 10) <= filters.createdTo!);
    }
    // Пересечение желаемого периода с фильтром: запись без периода («когда
    // угодно») подходит под любой диапазон.
    if (filters.desiredFrom) {
      list = list.filter((e) => e.desiredDateTo == null || e.desiredDateTo >= filters.desiredFrom!);
    }
    if (filters.desiredTo) {
      list = list.filter(
        (e) => e.desiredDateFrom == null || e.desiredDateFrom <= filters.desiredTo!,
      );
    }

    if (filters.matchEmployeeId != null && filters.matchDate) {
      const slot: WaitlistSlot = {
        employeeId: filters.matchEmployeeId,
        date: filters.matchDate,
        time: filters.matchTime,
        branchId: filters.matchBranchId ?? null,
        // На моках специализации врача слота не знаем — считаем, что записи
        // «жду специализацию» матчатся (на живом API это считает бэк).
        employeeSpecializationIds: mockEntries
          .filter((e) => e.employeeId === filters.matchEmployeeId)
          .map((e) => e.specializationId)
          .filter((id): id is number => id != null),
      };
      list = list.filter((e) => matchesSlot(e, slot));
    }

    if (filters.ordering === "created") {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      list.sort(compareCandidates);
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return mockDelay({
      results: list.slice(start, start + pageSize),
      count: list.length,
      next: start + pageSize < list.length ? "mock" : null,
      previous: page > 1 ? "mock" : null,
    });
  }

  const q = buildParams(filters);
  return apiRequest<WaitlistResponse>(`/waitlist/?${q.toString()}`, { signal });
}

export function getWaitlistEntry(
  entryId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<WaitlistEntryDetail> {
  if (WAITLIST_USE_MOCKS) return mockDelay(mockFind(entryId));
  return apiRequest<WaitlistEntryDetail>(withOrg(`/waitlist/${entryId}/`, organizationId), {
    signal,
  });
}

export function getWaitlistSummary(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<WaitlistSummary> {
  if (WAITLIST_USE_MOCKS) {
    const active = mockEntries.filter((e) => WAITLIST_ACTIVE_STATUSES.includes(e.status));
    const soon = isoDay(7);
    return mockDelay({
      waiting: active.filter((e) => e.status === "waiting").length,
      offered: active.filter((e) => e.status === "offered").length,
      urgent: active.filter((e) => e.priority === "urgent").length,
      expiringSoon: active.filter((e) => e.activeUntil != null && e.activeUntil <= soon).length,
    });
  }
  return apiRequest<WaitlistSummary>(withOrg("/waitlist/summary/", organizationId), { signal });
}

/**
 * Сколько кандидатов ждёт окно у врача по дням — бейджи на сетке свободных
 * окон. Если бэк не потянет агрегат (§9.1 тикета), фронт откатится к точечным
 * запросам списка с matchDate.
 */
export function getWaitlistMatchCounts(
  params: { employeeId: number; dateFrom: string; dateTo: string; branchId?: number },
  organizationId?: number,
  signal?: AbortSignal,
): Promise<WaitlistMatchCounts> {
  if (WAITLIST_USE_MOCKS) {
    const counts: Record<string, number> = {};
    const specs = mockEntries
      .filter((e) => e.employeeId === params.employeeId)
      .map((e) => e.specializationId)
      .filter((id): id is number => id != null);
    for (let d = params.dateFrom; d <= params.dateTo; d = isoNextDay(d)) {
      const n = mockEntries.filter((e) =>
        matchesSlot(toEntry(e), {
          employeeId: params.employeeId,
          date: d,
          branchId: params.branchId ?? null,
          employeeSpecializationIds: specs,
        }),
      ).length;
      if (n > 0) counts[d] = n;
    }
    return mockDelay({ counts });
  }
  const q = new URLSearchParams({
    employeeId: String(params.employeeId),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (organizationId != null) q.set("organizationId", String(organizationId));
  return apiRequest<WaitlistMatchCounts>(`/waitlist/match-counts/?${q.toString()}`, { signal });
}

function isoNextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── API: изменения ────────────────────────────────────────────────────────────

export function createWaitlistEntry(
  payload: CreateWaitlistPayload,
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = seedEntry({
      patientId: payload.patientId ?? null,
      patientName: payload.patientId ? payload.contactName : null,
      contactName: payload.contactName,
      phone: payload.phone,
      employeeId: payload.employeeId ?? null,
      employeeName: payload.employeeId ? `Специалист #${payload.employeeId}` : null,
      specializationId: payload.specializationId ?? null,
      services: (payload.serviceIds ?? []).map((id) => ({ id, name: `Услуга #${id}` })),
      branchId: payload.branchId ?? null,
      desiredDateFrom: payload.desiredDateFrom ?? null,
      desiredDateTo: payload.desiredDateTo ?? null,
      desiredTimeFrom: payload.desiredTimeFrom ?? null,
      desiredTimeTo: payload.desiredTimeTo ?? null,
      desiredWeekdays: payload.desiredWeekdays ?? [],
      priority: payload.priority ?? "normal",
      comment: payload.comment ?? "",
      activeUntil: payload.activeUntil ?? isoDay(30),
    });
    mockEntries.unshift(record);
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg("/waitlist/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateWaitlistEntry(
  entryId: number,
  payload: UpdateWaitlistPayload,
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    if (payload.contactName !== undefined) record.contactName = payload.contactName;
    if (payload.phone !== undefined) record.phone = payload.phone;
    if (payload.patientId != null) record.patientId = payload.patientId;
    if (payload.employeeId != null) record.employeeId = payload.employeeId;
    if (payload.specializationId != null) record.specializationId = payload.specializationId;
    if (payload.branchId != null) record.branchId = payload.branchId;
    if (payload.serviceIds) {
      record.services = payload.serviceIds.map((id) => ({ id, name: `Услуга #${id}` }));
    }
    if (payload.desiredDateFrom !== undefined && payload.desiredDateFrom !== null) {
      record.desiredDateFrom = payload.desiredDateFrom;
    }
    if (payload.desiredDateTo !== undefined && payload.desiredDateTo !== null) {
      record.desiredDateTo = payload.desiredDateTo;
    }
    if (payload.desiredTimeFrom !== undefined && payload.desiredTimeFrom !== null) {
      record.desiredTimeFrom = payload.desiredTimeFrom;
    }
    if (payload.desiredTimeTo !== undefined && payload.desiredTimeTo !== null) {
      record.desiredTimeTo = payload.desiredTimeTo;
    }
    if (payload.desiredWeekdays) record.desiredWeekdays = payload.desiredWeekdays;
    if (payload.priority) record.priority = payload.priority;
    if (payload.comment !== undefined) record.comment = payload.comment;
    if (payload.activeUntil !== undefined && payload.activeUntil !== null) {
      record.activeUntil = payload.activeUntil;
    }
    // Очистка — только явными флагами (tri-state, как в tasks).
    if (payload.clearPatient) {
      record.patientId = null;
      record.patientName = null;
    }
    if (payload.clearEmployee) {
      record.employeeId = null;
      record.employeeName = null;
    }
    if (payload.clearSpecialization) {
      record.specializationId = null;
      record.specializationName = null;
    }
    if (payload.clearBranch) {
      record.branchId = null;
      record.branchName = null;
    }
    if (payload.clearDesiredDates) {
      record.desiredDateFrom = null;
      record.desiredDateTo = null;
    }
    if (payload.clearDesiredTimes) {
      record.desiredTimeFrom = null;
      record.desiredTimeTo = null;
    }
    if (payload.clearActiveUntil) record.activeUntil = null;
    record.updatedAt = nowIso();
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteWaitlistEntry(entryId: number, organizationId?: number): Promise<void> {
  if (WAITLIST_USE_MOCKS) {
    const idx = mockEntries.findIndex((e) => e.id === entryId);
    if (idx >= 0) mockEntries.splice(idx, 1);
    return mockDelay(undefined as void);
  }
  return apiRequest<void>(withOrg(`/waitlist/${entryId}/`, organizationId), { method: "DELETE" });
}

/** Отметить касание: дозвонились/не дозвонились/отказался. */
export function contactWaitlistEntry(
  entryId: number,
  payload: { result: WaitlistContactResult; note?: string },
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    mockAddContact(record, payload.result, payload.note ?? "");
    // Отказ возвращает запись из «предложено» в общую очередь.
    if (payload.result === "refused" && record.status === "offered") record.status = "waiting";
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/contact/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

/**
 * «Предложили окно» — статус offered. Слот при этом НЕ резервируется
 * (решение заказчика): статус нужен, чтобы второй регистратор не звонил тому
 * же пациенту повторно.
 */
export function offerWaitlistEntry(
  entryId: number,
  payload: { employeeId: number; start: string },
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    record.status = "offered";
    mockAddContact(record, "callback_later", "", payload);
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/offer/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

/** Закрыть запись созданным приёмом. */
export function scheduleWaitlistEntry(
  entryId: number,
  payload: { appointmentId: number; patientId?: number },
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    record.status = "scheduled";
    record.appointmentId = payload.appointmentId;
    if (payload.patientId != null) record.patientId = payload.patientId;
    record.closedAt = nowIso();
    record.updatedAt = nowIso();
    mockAddContact(record, "agreed", "");
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/schedule/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

export function cancelWaitlistEntry(
  entryId: number,
  payload: { reason?: string } = {},
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    record.status = "cancelled";
    record.closedAt = nowIso();
    record.closeReason = payload.reason ?? "";
    record.updatedAt = nowIso();
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/cancel/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

/** Вернуть закрытую запись в очередь (право waitlist.manage). */
export function reopenWaitlistEntry(
  entryId: number,
  organizationId?: number,
): Promise<WaitlistEntry> {
  if (WAITLIST_USE_MOCKS) {
    const record = mockFind(entryId);
    record.status = "waiting";
    record.closedAt = null;
    record.closeReason = "";
    record.updatedAt = nowIso();
    return mockDelay(toEntry(record));
  }
  return apiRequest<WaitlistEntry>(withOrg(`/waitlist/${entryId}/reopen/`, organizationId), {
    method: "POST",
  });
}
