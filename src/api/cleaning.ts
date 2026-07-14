import { apiRequest } from "./client";
import { mockDelay, paginate, withOrg } from "./mockUtils";

/**
 * Модуль «Уборка» — учёт уборок с фотоотчётом и выплатой в ЗП.
 * Уборщица отмечает уборку зоны с обязательными фото, админ подтверждает
 * или отклоняет; в ЗП попадает только подтверждённое (ставка × количество).
 *
 * Контракт: MamaDoc/backend_tickets_2026-07-13/backend_ticket_cleaning_module.md — НЕ менять без
 * согласования с бэкенд-командой. Бэкенд ещё не реализован — модуль работает
 * на моках (CLEANING_USE_MOCKS = true); после деплоя бэка выключить флаг и
 * вернуть can-гейты (сайдбар, App.tsx, SettingsLayout), как делали с tasks.
 */

export const CLEANING_USE_MOCKS = true;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CleaningZone {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
}

export type CleaningRecordStatus = "pending" | "approved" | "rejected";

export interface CleaningPhoto {
  id: number;
  url: string;
}

export interface CleaningRecord {
  id: number;
  zoneId: number;
  zoneName: string;
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
  zone?: number;
  status?: CleaningRecordStatus;
  page?: number;
  pageSize?: number;
  /** Обязателен для суперпользователя/мультиорг (см. withOrg в api/tasks.ts). */
  organizationId?: number;
}

export interface CleaningSummaryRow {
  employeeId: number;
  employeeName: string;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  /** approvedCount × ставка, сом. */
  amount: number;
}

/** Ставка за одну подтверждённую уборку — настройка на организацию.
 *  Decimal строкой, как stock-rules.minThreshold (открытый вопрос бэку). */
export interface CleaningSettings {
  rate: string;
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

const mockZones: CleaningZone[] = [
  { id: 1, name: "Холл 1 этаж", branchId: 1, branchName: "Мама Доктор", isActive: true },
  { id: 2, name: "Санузел 2 этаж", branchId: 1, branchName: "Мама Доктор", isActive: true },
  { id: 3, name: "Процедурный кабинет", branchId: 2, branchName: "Мама Доктор Плюс", isActive: true },
  { id: 4, name: "Игровая зона", branchId: 2, branchName: "Мама Доктор Плюс", isActive: false },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const mockRecords: CleaningRecord[] = [
  {
    id: 101,
    zoneId: 1,
    zoneName: "Холл 1 этаж",
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
    zoneId: 2,
    zoneName: "Санузел 2 этаж",
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
    zoneId: 3,
    zoneName: "Процедурный кабинет",
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

let mockRate = "150.00";

// ── Зоны ──────────────────────────────────────────────────────────────────────

export function getCleaningZones(
  params: { branch?: number; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<CleaningZone[]> {
  if (CLEANING_USE_MOCKS) {
    let list = [...mockZones];
    if (params.branch != null) list = list.filter((z) => z.branchId === params.branch);
    return mockDelay(list);
  }
  const q = new URLSearchParams();
  if (params.branch != null) q.set("branch", String(params.branch));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<CleaningZone[]>(`/cleaning/zones/${qs ? `?${qs}` : ""}`, { signal });
}

export interface CleaningZonePayload {
  name: string;
  branchId: number;
  isActive: boolean;
}

export function createCleaningZone(
  payload: CleaningZonePayload,
  organizationId?: number,
): Promise<CleaningZone> {
  if (CLEANING_USE_MOCKS) {
    const zone: CleaningZone = {
      id: ++mockSeq,
      name: payload.name,
      branchId: payload.branchId,
      branchName: `Филиал #${payload.branchId}`,
      isActive: payload.isActive,
    };
    mockZones.push(zone);
    return mockDelay(zone);
  }
  return apiRequest<CleaningZone>(withOrg("/cleaning/zones/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateCleaningZone(
  zoneId: number,
  payload: Partial<CleaningZonePayload>,
  organizationId?: number,
): Promise<CleaningZone> {
  if (CLEANING_USE_MOCKS) {
    const zone = mockZones.find((z) => z.id === zoneId);
    if (!zone) return Promise.reject(new Error("Зона не найдена (мок)"));
    Object.assign(zone, payload);
    return mockDelay({ ...zone });
  }
  return apiRequest<CleaningZone>(withOrg(`/cleaning/zones/${zoneId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteCleaningZone(zoneId: number, organizationId?: number): Promise<void> {
  if (CLEANING_USE_MOCKS) {
    const idx = mockZones.findIndex((z) => z.id === zoneId);
    if (idx >= 0) mockZones.splice(idx, 1);
    return mockDelay(undefined);
  }
  return apiRequest<void>(withOrg(`/cleaning/zones/${zoneId}/`, organizationId), {
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
    if (filters.zone != null) list = list.filter((r) => r.zoneId === filters.zone);
    if (filters.status) list = list.filter((r) => r.status === filters.status);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mockDelay(paginate(list, filters.page, filters.pageSize));
  }
  const q = new URLSearchParams();
  if (filters.dateFrom) q.set("date_from", filters.dateFrom);
  if (filters.dateTo) q.set("date_to", filters.dateTo);
  if (filters.branch != null) q.set("branch", String(filters.branch));
  if (filters.zone != null) q.set("zone", String(filters.zone));
  if (filters.status) q.set("status", filters.status);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return apiRequest<CleaningRecordsResponse>(`/cleaning/records/?${q.toString()}`, { signal });
}

export interface CreateCleaningRecordPayload {
  zoneId: number;
  /** 1..5 фото, уже сжатых через compressImage. */
  photos: File[];
  organizationId?: number;
}

export function createCleaningRecord(
  payload: CreateCleaningRecordPayload,
): Promise<CleaningRecord> {
  if (CLEANING_USE_MOCKS) {
    const zone = mockZones.find((z) => z.id === payload.zoneId);
    const record: CleaningRecord = {
      id: ++mockSeq,
      zoneId: payload.zoneId,
      zoneName: zone?.name ?? `Зона #${payload.zoneId}`,
      branchId: zone?.branchId ?? 0,
      branchName: zone?.branchName ?? "",
      employeeId: 0,
      employeeName: "Вы (мок)",
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
  formData.append("zone", String(payload.zoneId));
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

// ── Сводка за месяц ───────────────────────────────────────────────────────────

export function getCleaningSummary(
  params: { month: string; branch?: number; organizationId?: number },
  signal?: AbortSignal,
): Promise<CleaningSummaryRow[]> {
  if (CLEANING_USE_MOCKS) {
    const rate = Number(mockRate) || 0;
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
      if (r.status === "approved") row.approvedCount += 1;
      else if (r.status === "pending") row.pendingCount += 1;
      else row.rejectedCount += 1;
    }
    const rows = [...byEmployee.values()]
      .map((row) => ({ ...row, amount: row.approvedCount * rate }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return mockDelay(rows);
  }
  const q = new URLSearchParams({ month: params.month });
  if (params.branch != null) q.set("branch", String(params.branch));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<CleaningSummaryRow[]>(`/cleaning/summary/?${q.toString()}`, { signal });
}

// ── Ставка (настройка организации) ────────────────────────────────────────────
// Форма эндпоинта — предположение фронта (в тикете «на усмотрение бэка»),
// вынесено в «Открытые вопросы» тикета: GET/PUT /cleaning/settings/ → {rate}.

export function getCleaningSettings(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<CleaningSettings> {
  if (CLEANING_USE_MOCKS) return mockDelay({ rate: mockRate });
  return apiRequest<CleaningSettings>(withOrg("/cleaning/settings/", organizationId), { signal });
}

export function updateCleaningSettings(
  payload: CleaningSettings,
  organizationId?: number,
): Promise<CleaningSettings> {
  if (CLEANING_USE_MOCKS) {
    mockRate = payload.rate;
    return mockDelay({ rate: mockRate });
  }
  return apiRequest<CleaningSettings>(withOrg("/cleaning/settings/", organizationId), {
    method: "PUT",
    body: payload,
  });
}
