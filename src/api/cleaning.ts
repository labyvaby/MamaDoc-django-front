import { apiRequest } from "./client";
import { mockDelay, paginate, withOrg } from "./mockUtils";
import { getDjangoEmployees } from "./staff";

/**
 * Модуль «Уборка» — учёт уборок с фотоотчётом и выплатой в ЗП.
 * Уборщица отмечает уборку (тип: ежедневная/генеральная/…) с обязательными
 * фото, админ подтверждает или отклоняет; в ЗП попадает только
 * подтверждённое (Σ ставка типа × количество).
 *
 * Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_cleaning_module.md — НЕ менять без
 * согласования с бэкенд-командой. Бэкенд ещё не реализован — модуль работает
 * на моках (CLEANING_USE_MOCKS = true); после деплоя бэка выключить флаг и
 * вернуть can-гейты (сайдбар, App.tsx, SettingsLayout), как делали с tasks.
 * UPD 15.07.2026: зоны уборки заменены на типы уборки со ставкой за тип
 * (единая ставка организации удалена) — отражено в тикете тем же UPD.
 */

export const CLEANING_USE_MOCKS = true;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Тип уборки — справочник организации; ставка за одну подтверждённую уборку. */
export interface CleaningType {
  id: number;
  name: string;
  /** Ставка, сом — decimal строкой (как stock-rules.minThreshold). */
  rate: string;
  isActive: boolean;
}

export type CleaningRecordStatus = "pending" | "approved" | "rejected";

export interface CleaningPhoto {
  id: number;
  url: string;
}

export interface CleaningRecord {
  id: number;
  typeId: number;
  typeName: string;
  /** Филиал записи — активный филиал сотрудника на момент отметки. */
  branchId: number;
  branchName: string;
  employeeId: number;
  employeeName: string;
  status: CleaningRecordStatus;
  /** 1..5 фото; фронт сжимает через compressImage перед отправкой. */
  photos: CleaningPhoto[];
  rejectReason: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CleaningRecordsResponse {
  results: CleaningRecord[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface CleaningRecordsFilters {
  /** YYYY-MM-DD (включительно). */
  dateFrom?: string;
  dateTo?: string;
  branch?: number;
  type?: number;
  status?: CleaningRecordStatus;
  page?: number;
  pageSize?: number;
  /** Обязателен для суперпользователя/мультиорг (см. withOrg в api/tasks.ts). */
  organizationId?: number;
}

/** Кандидат-исполнитель для ручного назначения уборки (только cleaning.manage). */
export interface CleaningEmployee {
  id: number;
  fullName: string;
}

export interface CleaningSummaryRow {
  employeeId: number;
  employeeName: string;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  /** Σ по подтверждённым: ставка типа × количество, сом (считает бэк). */
  amount: number;
}

// Валидации зеркалят тикет: бэк — источник правды, фронт проверяет до отправки.
export const CLEANING_MIN_PHOTOS = 1;
export const CLEANING_MAX_PHOTOS = 5;
export const CLEANING_PHOTO_MAX_SIZE_MB = 10;

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockSeq = 500;

/** Плейсхолдер-фото для демо-данных: инлайновый SVG, без внешних запросов. */
function mockPhoto(label: string, hue: number): CleaningPhoto {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>` +
    `<rect width='100%' height='100%' fill='hsl(${hue},30%,52%)'/>` +
    `<text x='50%' y='50%' fill='#fff' font-size='32' font-family='sans-serif' text-anchor='middle'>${label}</text>` +
    `</svg>`;
  return { id: ++mockSeq, url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}

// Дефолтные типы — предложены как сиды при включении модуля (см. тикет),
// менеджер правит названия/ставки под свою клинику.
const mockTypes: CleaningType[] = [
  { id: 1, name: "Ежедневная уборка", rate: "150.00", isActive: true },
  { id: 2, name: "Генеральная уборка", rate: "500.00", isActive: true },
  { id: 3, name: "Дезинфекция", rate: "300.00", isActive: true },
  { id: 4, name: "Экспресс-уборка", rate: "100.00", isActive: false },
];

// Кандидаты-исполнители (роль «Уборщица») — для селектора ручного назначения.
const mockCleaners: CleaningEmployee[] = [
  { id: 900, fullName: "Айгуль Осмонова" },
  { id: 901, fullName: "Гульмира Токтогулова" },
  { id: 902, fullName: "Назгуль Асанова" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const mockRecords: CleaningRecord[] = [
  {
    id: 101,
    typeId: 1,
    typeName: "Ежедневная уборка",
    branchId: 1,
    branchName: "Мама Доктор",
    employeeId: 900,
    employeeName: "Айгуль Осмонова",
    status: "approved",
    photos: [mockPhoto("Холл — фото 1", 145), mockPhoto("Холл — фото 2", 155)],
    rejectReason: "",
    reviewedByName: "Шаршебаев Автандил",
    reviewedAt: `${todayIso()}T10:20:00Z`,
    createdAt: `${todayIso()}T08:05:00Z`,
  },
  {
    id: 102,
    typeId: 2,
    typeName: "Генеральная уборка",
    branchId: 1,
    branchName: "Мама Доктор",
    employeeId: 900,
    employeeName: "Айгуль Осмонова",
    status: "pending",
    photos: [mockPhoto("Санузел — фото", 205)],
    rejectReason: "",
    reviewedByName: null,
    reviewedAt: null,
    createdAt: `${todayIso()}T09:40:00Z`,
  },
  {
    id: 103,
    typeId: 3,
    typeName: "Дезинфекция",
    branchId: 2,
    branchName: "Мама Доктор Плюс",
    employeeId: 901,
    employeeName: "Гульмира Токтогулова",
    status: "rejected",
    photos: [mockPhoto("Кабинет — фото", 25)],
    rejectReason: "На фото не видно пол, переснимите",
    reviewedByName: "Шаршебаев Автандил",
    reviewedAt: `${todayIso()}T11:00:00Z`,
    createdAt: `${todayIso()}T07:30:00Z`,
  },
];

// ── Типы уборки ───────────────────────────────────────────────────────────────

export function getCleaningTypes(
  params: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<CleaningType[]> {
  if (CLEANING_USE_MOCKS) {
    return mockDelay([...mockTypes]);
  }
  return apiRequest<CleaningType[]>(withOrg("/cleaning/types/", params.organizationId), {
    signal,
  }).then((items) => (Array.isArray(items) ? items : []));
}

/**
 * Кандидаты-исполнители для ручного назначения уборки (селектор виден только
 * cleaning.manage). Уборщица = сотрудник с ролью `cleaner`, которой раздаётся
 * cleaning.report (см. тикет cleaning-модуля). Признака «есть право X» список
 * /staff/employees не отдаёт, поэтому фильтруем по role.code === "cleaner".
 * Если бэк заведёт выделенный /cleaning/employees/ (кандидаты по cleaning.report)
 * — переключить сюда, фильтр по роли убрать. См. «Открытые вопросы» тикета.
 */
export function getCleaningEmployees(signal?: AbortSignal): Promise<CleaningEmployee[]> {
  if (CLEANING_USE_MOCKS) {
    return mockDelay([...mockCleaners]);
  }
  return getDjangoEmployees({ status: "active", pageSize: 200 }, signal).then((page) =>
    page.results
      .filter((e) => e.role?.code === "cleaner")
      .map((e) => ({ id: e.id, fullName: e.fullName })),
  );
}

export interface CleaningTypePayload {
  name: string;
  /** Decimal строкой: "150.00". */
  rate: string;
  isActive: boolean;
}

export function createCleaningType(
  payload: CleaningTypePayload,
  organizationId?: number,
): Promise<CleaningType> {
  if (CLEANING_USE_MOCKS) {
    const type: CleaningType = { id: ++mockSeq, ...payload };
    mockTypes.push(type);
    return mockDelay(type);
  }
  return apiRequest<CleaningType>(withOrg("/cleaning/types/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateCleaningType(
  typeId: number,
  payload: Partial<CleaningTypePayload>,
  organizationId?: number,
): Promise<CleaningType> {
  if (CLEANING_USE_MOCKS) {
    const type = mockTypes.find((t) => t.id === typeId);
    if (!type) return Promise.reject(new Error("Тип уборки не найден (мок)"));
    Object.assign(type, payload);
    return mockDelay({ ...type });
  }
  return apiRequest<CleaningType>(withOrg(`/cleaning/types/${typeId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteCleaningType(typeId: number, organizationId?: number): Promise<void> {
  if (CLEANING_USE_MOCKS) {
    const idx = mockTypes.findIndex((t) => t.id === typeId);
    if (idx >= 0) mockTypes.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/cleaning/types/${typeId}/`, organizationId), {
    method: "DELETE",
  });
}

// ── Записи ────────────────────────────────────────────────────────────────────

export function getCleaningRecords(
  filters: CleaningRecordsFilters = {},
  signal?: AbortSignal,
): Promise<CleaningRecordsResponse> {
  if (CLEANING_USE_MOCKS) {
    let list = [...mockRecords];
    if (filters.dateFrom) list = list.filter((r) => r.createdAt.slice(0, 10) >= filters.dateFrom!);
    if (filters.dateTo) list = list.filter((r) => r.createdAt.slice(0, 10) <= filters.dateTo!);
    if (filters.branch != null) list = list.filter((r) => r.branchId === filters.branch);
    if (filters.type != null) list = list.filter((r) => r.typeId === filters.type);
    if (filters.status) list = list.filter((r) => r.status === filters.status);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mockDelay(paginate(list, filters.page, filters.pageSize));
  }
  const q = new URLSearchParams();
  if (filters.dateFrom) q.set("date_from", filters.dateFrom);
  if (filters.dateTo) q.set("date_to", filters.dateTo);
  if (filters.branch != null) q.set("branch", String(filters.branch));
  if (filters.type != null) q.set("type", String(filters.type));
  if (filters.status) q.set("status", filters.status);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return apiRequest<CleaningRecordsResponse>(`/cleaning/records/?${q.toString()}`, { signal });
}

export interface CreateCleaningRecordPayload {
  typeId: number;
  /** 1..5 фото, уже сжатых через compressImage. */
  photos: File[];
  /**
   * Ручное назначение исполнителя (только cleaning.manage). Без него бэк
   * ставит текущего пользователя из сессии (обычный сценарий уборщицы).
   */
  employeeId?: number;
  organizationId?: number;
}

export function createCleaningRecord(
  payload: CreateCleaningRecordPayload,
): Promise<CleaningRecord> {
  if (CLEANING_USE_MOCKS) {
    const type = mockTypes.find((t) => t.id === payload.typeId);
    const assignee =
      payload.employeeId != null
        ? mockCleaners.find((c) => c.id === payload.employeeId)
        : undefined;
    const record: CleaningRecord = {
      id: ++mockSeq,
      typeId: payload.typeId,
      typeName: type?.name ?? `Тип #${payload.typeId}`,
      // На живом бэке филиал записи — активный филиал сотрудника из сессии.
      branchId: 1,
      branchName: "Мама Доктор",
      employeeId: assignee?.id ?? 0,
      employeeName: assignee?.fullName ?? "Вы (мок)",
      status: "pending",
      photos: payload.photos.map((f) => ({ id: ++mockSeq, url: URL.createObjectURL(f) })),
      rejectReason: "",
      reviewedByName: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    mockRecords.unshift(record);
    return mockDelay(record);
  }
  const formData = new FormData();
  formData.append("type", String(payload.typeId));
  // Явное назначение исполнителя — только cleaning.manage; бэк должен принять
  // поле employee и разрешить создание записи менеджеру (см. тикет).
  if (payload.employeeId != null) formData.append("employee", String(payload.employeeId));
  for (const photo of payload.photos) formData.append("photos", photo);
  return apiRequest<CleaningRecord>(withOrg("/cleaning/records/", payload.organizationId), {
    method: "POST",
    formData,
  });
}

export function approveCleaningRecord(
  recordId: number,
  organizationId?: number,
): Promise<CleaningRecord> {
  if (CLEANING_USE_MOCKS) {
    const record = mockRecords.find((r) => r.id === recordId);
    if (!record) return Promise.reject(new Error("Запись не найдена (мок)"));
    record.status = "approved";
    record.reviewedByName = "Вы (мок)";
    record.reviewedAt = new Date().toISOString();
    record.rejectReason = "";
    return mockDelay({ ...record });
  }
  return apiRequest<CleaningRecord>(
    withOrg(`/cleaning/records/${recordId}/approve/`, organizationId),
    { method: "POST" },
  );
}

export function rejectCleaningRecord(
  recordId: number,
  reason: string,
  organizationId?: number,
): Promise<CleaningRecord> {
  if (CLEANING_USE_MOCKS) {
    const record = mockRecords.find((r) => r.id === recordId);
    if (!record) return Promise.reject(new Error("Запись не найдена (мок)"));
    record.status = "rejected";
    record.reviewedByName = "Вы (мок)";
    record.reviewedAt = new Date().toISOString();
    record.rejectReason = reason;
    return mockDelay({ ...record });
  }
  return apiRequest<CleaningRecord>(
    withOrg(`/cleaning/records/${recordId}/reject/`, organizationId),
    { method: "POST", body: { reason } },
  );
}

/**
 * Месяцы, в которых есть хотя бы одна уборка (YYYY-MM) — для ленты месяцев:
 * пустые и будущие месяцы страница скрывает. Контракт — UPD 15.07.2026 в
 * тикете cleaning-модуля; форма ответа 1-в-1 с GET /reports/active-months/.
 */
export function getCleaningActiveMonths(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<string[]> {
  if (CLEANING_USE_MOCKS) {
    const months = new Set(mockRecords.map((r) => r.createdAt.slice(0, 7)));
    return mockDelay([...months]);
  }
  return apiRequest<{ months: string[] }>(
    withOrg("/cleaning/active-months/", organizationId),
    { signal },
  ).then((data) => (Array.isArray(data?.months) ? data.months : []));
}

// ── Сводка за месяц ───────────────────────────────────────────────────────────

export function getCleaningSummary(
  params: { month: string; branch?: number; organizationId?: number },
  signal?: AbortSignal,
): Promise<CleaningSummaryRow[]> {
  if (CLEANING_USE_MOCKS) {
    const rateOf = (typeId: number) =>
      Number(mockTypes.find((t) => t.id === typeId)?.rate) || 0;
    const byEmployee = new Map<number, CleaningSummaryRow>();
    for (const r of mockRecords) {
      if (!r.createdAt.startsWith(params.month)) continue;
      if (params.branch != null && r.branchId !== params.branch) continue;
      let row = byEmployee.get(r.employeeId);
      if (!row) {
        row = {
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          amount: 0,
        };
        byEmployee.set(r.employeeId, row);
      }
      if (r.status === "approved") {
        row.approvedCount += 1;
        row.amount += rateOf(r.typeId);
      } else if (r.status === "pending") row.pendingCount += 1;
      else row.rejectedCount += 1;
    }
    const rows = [...byEmployee.values()].sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName),
    );
    return mockDelay(rows);
  }
  const q = new URLSearchParams({ month: params.month });
  if (params.branch != null) q.set("branch", String(params.branch));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<CleaningSummaryRow[]>(`/cleaning/summary/?${q.toString()}`, { signal });
}

