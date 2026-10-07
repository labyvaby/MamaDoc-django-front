import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * СКУД застройщика (AIVIO, «Персонал → СКУД»): «Моя смена», журнал проходов
 * за день, устройства — `/api/v2/construction/acs/…`, `/access-log/`,
 * `/access-devices/`.
 *
 * Контракт — гайд бэка `frontend-acs.md` (05.10.2026).
 * - экран — `attendance.view` (без `attendance.manage` бэк отдаёт только
 *   свои проходы); «Синхронизировать» — `attendance.manage` или
 *   `construction.manage`; смена — `attendance.clock`; «Заполнить табель по
 *   СКУД» — `personnel.manage`;
 * - сеть офиса определяет сервер по IP — переключателя «я в офисе» нет;
 * - время — Бишкек `HH:MM`, даты ISO; филиал режет бэк.
 */

const API = "/v2/construction";

export interface MyShift {
  employeeId: number | null;
  employeeName: string;
  position: string;
  departmentName: string;
  point: string;
  pointName: string;
  network: { currentIp: string; configured: boolean; isOffice: boolean; branchName: string | null; label: string; hint: string | null };
  /** `none` / `active` / `finished`. */
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  canStart: boolean;
  canEnd: boolean;
  normHours: number;
  lunchMinutes: number;
  hint: string | null;
}

export interface AccessRow {
  employeeId: number;
  employeeName: string;
  position: string;
  departmentId: number | null;
  departmentName: string;
  pointName: string;
  checkIn: string | null;
  checkOut: string | null;
  hours: number | null;
  isLate: boolean;
  lateMinutes: number;
  isOnSite: boolean;
  isEarlyLeave: boolean;
  status: string;
  statusLabel: string;
  /** `green` / `amber` / `red` / `gray`. */
  statusTone: string;
  deviceName: string;
}

export interface AccessLog {
  date: string;
  weekday: string;
  month: string;
  isToday: boolean;
  prevDate: string | null;
  nextDate: string | null;
  onSiteCount: number;
  staffCount: number;
  absentCount: number;
  markedCount: number;
  lateCount: number;
  lateMonthCount: number;
  avgHours: number;
  avgHoursMonth: number;
  devicesOnline: number;
  devicesTotal: number;
  rows: AccessRow[];
  rules: { label: string; value: string }[];
}

export interface AccessDevice {
  id: number;
  name: string;
  type: string;
  status: string;
  statusLabel: string;
  pointName: string;
  projectName: string;
  lastSync: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);

export const fromRawShift = (raw: any): MyShift => ({
  employeeId: raw?.employeeId ?? null,
  employeeName: str(raw?.employeeName),
  position: str(raw?.position),
  departmentName: str(raw?.departmentName),
  point: str(raw?.point),
  pointName: str(raw?.pointName),
  network: {
    currentIp: str(raw?.network?.currentIp),
    configured: Boolean(raw?.network?.configured),
    isOffice: Boolean(raw?.network?.isOffice),
    branchName: raw?.network?.branchName ?? null,
    label: str(raw?.network?.label),
    hint: raw?.network?.hint ?? null,
  },
  status: str(raw?.status) || "none",
  startedAt: raw?.startedAt ?? null,
  endedAt: raw?.endedAt ?? null,
  minutes: num(raw?.minutes),
  canStart: Boolean(raw?.canStart),
  canEnd: Boolean(raw?.canEnd),
  normHours: num(raw?.normHours),
  lunchMinutes: num(raw?.lunchMinutes),
  hint: raw?.hint ?? null,
});

export const fromRawLog = (raw: any): AccessLog => ({
  date: str(raw?.date),
  weekday: str(raw?.weekday),
  month: str(raw?.month),
  isToday: Boolean(raw?.isToday),
  prevDate: raw?.prevDate ?? null,
  nextDate: raw?.nextDate ?? null,
  onSiteCount: num(raw?.onSiteCount),
  staffCount: num(raw?.staffCount),
  absentCount: num(raw?.absentCount),
  markedCount: num(raw?.markedCount),
  lateCount: num(raw?.lateCount),
  lateMonthCount: num(raw?.lateMonthCount),
  avgHours: num(raw?.avgHours),
  avgHoursMonth: num(raw?.avgHoursMonth),
  devicesOnline: num(raw?.devicesOnline),
  devicesTotal: num(raw?.devicesTotal),
  rows: list(raw?.rows).map((r) => ({
    employeeId: r.employeeId,
    employeeName: str(r.employeeName),
    position: str(r.position),
    departmentId: r.departmentId ?? null,
    departmentName: str(r.departmentName),
    pointName: str(r.pointName),
    checkIn: r.checkIn ?? null,
    checkOut: r.checkOut ?? null,
    hours: numOrNull(r.hours),
    isLate: Boolean(r.isLate),
    lateMinutes: num(r.lateMinutes),
    isOnSite: Boolean(r.isOnSite),
    isEarlyLeave: Boolean(r.isEarlyLeave),
    status: str(r.status),
    statusLabel: str(r.statusLabel),
    statusTone: str(r.statusTone),
    deviceName: str(r.deviceName),
  })),
  rules: list(raw?.rules?.items).map((i) => ({ label: str(i.label), value: str(i.value) })),
});

export const fromRawDevice = (raw: any): AccessDevice => ({
  id: raw.id,
  name: str(raw.name),
  type: str(raw.type ?? raw.kind),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  pointName: str(raw.pointName),
  projectName: str(raw.projectName),
  lastSync: raw.lastSync ?? raw.lastSyncAt ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const acs = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });

export async function getMyShift(scope?: RealtyScope, signal?: AbortSignal): Promise<MyShift> {
  return fromRawShift(await acs(scope, "/acs/my-shift/", { signal }));
}

export async function toggleMyShift(action: "start" | "end", scope?: RealtyScope): Promise<MyShift> {
  return fromRawShift(await acs(scope, `/acs/my-shift/${action}/`, { method: "POST", body: {} }));
}

export async function getAccessLog(date: string | null, departmentId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<AccessLog> {
  const qs = new URLSearchParams();
  if (date) qs.set("date", date);
  if (departmentId != null) qs.set("departmentId", String(departmentId));
  const text = qs.toString();
  return fromRawLog(await acs(scope, `/access-log/${text ? `?${text}` : ""}`, { signal }));
}

export async function getAccessDevices(scope?: RealtyScope, signal?: AbortSignal): Promise<AccessDevice[]> {
  return list(await acs(scope, "/access-devices/", { signal })).map(fromRawDevice);
}

export async function syncAccessDevices(scope?: RealtyScope): Promise<AccessDevice[]> {
  return list(await acs(scope, "/access-devices/sync/", { method: "POST", body: {} })).map(fromRawDevice);
}

/** Тон бэка (`green/amber/red/gray`) → палитра. */
export const acsTone = (tone: string): "success" | "warning" | "error" | null => (tone === "green" ? "success" : tone === "amber" ? "warning" : tone === "red" ? "error" : null);

/** Длительность смены «2 ч 05 мин» из минут. */
export function shiftDuration(minutes: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutes));
  return { h: Math.floor(total / 60), m: total % 60 };
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const acsKeys = {
  all: ["django", "acs"] as const,
  shift: (scope: RealtyScope | undefined) => [...acsKeys.all, ...scopeKey(scope), "shift"] as const,
  log: (scope: RealtyScope | undefined, date: string | null, departmentId: number | null) => [...acsKeys.all, ...scopeKey(scope), "log", date ?? "today", departmentId] as const,
  devices: (scope: RealtyScope | undefined) => [...acsKeys.all, ...scopeKey(scope), "devices"] as const,
};
