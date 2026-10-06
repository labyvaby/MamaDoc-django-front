import { apiRequest, ApiError } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Консоль мобильного приложения покупателя и жильца (AIVIO, «Эксплуатация →
 * Мобильное приложение») — `/api/v2/resident-app`.
 *
 * Контракт — гайд бэка `frontend-hr-ops.md` §6 (05.10.2026).
 * - смотреть — `resident_app.view`; действия — `resident_app.manage` (по
 *   умолчанию его нет ни у одной роли — только владелец и суперпользователь);
 * - оплата рассрочки и автоплатёж — через биллинг (`realty.manage`);
 * - журнал доступа в демо пуст, пока кто-то не откроет шлагбаум или не
 *   выдаст гостевой пропуск.
 */

const API = "/v2/resident-app";

export interface AppStats {
  installs: number;
  installsMonth: number;
  activeMonth: number;
  payViaApp: number;
  devicesOnline: number;
  devicesTotal: number;
  pushes: number;
  accessEvents: number;
}

export interface AppUser {
  id: number;
  name: string;
  phone: string;
  /** `buyer` / `resident`. */
  role: string;
  roleLabel: string;
  projectId: number | null;
  projectName: string;
  unitNumber: number | string | null;
  billingId: number | null;
  contract: string;
  platform: string;
  push: boolean;
  parking: string | null;
  installed: string | null;
  lastActive: string | null;
  installmentState: string | null;
  lastBill: { id: number; month: string; total: number; status: string } | null;
}

export interface AppDevice {
  id: number;
  projectName: string;
  type: string;
  typeLabel: string;
  name: string;
  status: string;
  lastSeen: string | null;
}

export interface AppPush {
  id: number;
  title: string;
  text: string;
  toLabel: string;
  sent: string | null;
  delivered: number;
  opened: number;
  openRate: number;
}

export interface AccessEvent {
  id: number;
  at: string;
  who: string;
  deviceName: string;
  projectName: string;
  via: string;
  text: string;
}

export interface Installment {
  contract: string;
  total: number;
  downPayment: number;
  monthly: number;
  term: number;
  outstanding: number;
  overdue: number;
  progress: number;
  paidCount: number;
  state: string;
  next: { number: number; dueDate: string; amount: number; balance: number; state: string } | null;
  autopay: boolean;
  managerName: string;
}

export interface UtilityBill {
  id: number;
  month: string;
  lines: [string, number][];
  total: number;
  dueDate: string | null;
  status: string;
  statusLabel: string;
  paidAt: string | null;
}

export interface GuestPass {
  id: number;
  plate: string;
  validUntil: string | null;
  status: string;
  statusLabel: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);

export const fromRawStats = (raw: any): AppStats => ({
  installs: num(raw?.installs),
  installsMonth: num(raw?.installsMonth),
  activeMonth: num(raw?.activeMonth),
  payViaApp: num(raw?.payViaApp),
  devicesOnline: num(raw?.devicesOnline),
  devicesTotal: num(raw?.devicesTotal),
  pushes: num(raw?.pushes),
  accessEvents: num(raw?.accessEvents),
});

export const fromRawUser = (raw: any): AppUser => ({
  id: raw.id,
  name: str(raw.name),
  phone: str(raw.phone),
  role: str(raw.role),
  roleLabel: str(raw.roleLabel),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  unitNumber: raw.unitNumber ?? null,
  billingId: raw.billingId ?? null,
  contract: str(raw.contract),
  platform: str(raw.platform),
  push: Boolean(raw.push),
  parking: raw.parking ?? null,
  installed: raw.installed ?? null,
  lastActive: raw.lastActive ?? null,
  installmentState: raw.installmentState ?? null,
  lastBill: raw.lastBill ? { id: raw.lastBill.id, month: str(raw.lastBill.month), total: num(raw.lastBill.total), status: str(raw.lastBill.status) } : null,
});

export const fromRawInstallment = (raw: any): Installment => ({
  contract: str(raw?.contract),
  total: num(raw?.total),
  downPayment: num(raw?.downPayment),
  monthly: num(raw?.monthly),
  term: num(raw?.term),
  outstanding: num(raw?.outstanding),
  overdue: num(raw?.overdue),
  progress: num(raw?.progress),
  paidCount: num(raw?.paidCount),
  state: str(raw?.state),
  next: raw?.next ? { number: num(raw.next.number), dueDate: str(raw.next.dueDate), amount: num(raw.next.amount), balance: num(raw.next.balance), state: str(raw.next.state) } : null,
  autopay: Boolean(raw?.autopay),
  managerName: str(raw?.managerName),
});

export const fromRawBill = (raw: any): UtilityBill => ({
  id: raw.id,
  month: str(raw.month),
  lines: list(raw.lines).filter((l) => Array.isArray(l)).map((l) => [str(l[0]), num(l[1])] as [string, number]),
  total: num(raw.total),
  dueDate: raw.dueDate ?? null,
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  paidAt: raw.paidAt ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const app = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });
const post = <T>(scope: RealtyScope | undefined, path: string, body: unknown = {}) => app<T>(scope, path, { method: "POST", body });

export async function getAppStats(scope?: RealtyScope, signal?: AbortSignal): Promise<AppStats> {
  return fromRawStats(await app(scope, "/stats/", { signal }));
}

export async function getAppUsers(scope?: RealtyScope, signal?: AbortSignal): Promise<AppUser[]> {
  return list(await app(scope, "/app-users/", { signal })).map(fromRawUser);
}

export async function getAppDevices(scope?: RealtyScope, signal?: AbortSignal): Promise<AppDevice[]> {
  return list(await app(scope, "/devices/", { signal })).map((d) => ({
    id: d.id,
    projectName: str(d.projectName),
    type: str(d.type),
    typeLabel: str(d.typeLabel || d.type),
    name: str(d.name),
    status: str(d.status),
    lastSeen: d.lastSeen ?? null,
  }));
}

export async function getPushes(scope?: RealtyScope, signal?: AbortSignal): Promise<AppPush[]> {
  return list(await app(scope, "/pushes/", { signal })).map((p) => ({
    id: p.id,
    title: str(p.title),
    text: str(p.text),
    toLabel: str(p.toLabel),
    sent: p.sent ?? null,
    delivered: num(p.delivered),
    opened: num(p.opened),
    openRate: num(p.openRate),
  }));
}

/** Журнал доступа. Форма сверена на test2 07.10: `{id, who, projectName, device, via, viaLabel, at}`; запасные имена полей оставлены. */
export async function getAppAccessLog(scope?: RealtyScope, signal?: AbortSignal): Promise<AccessEvent[]> {
  return list(await app(scope, "/access-log/?limit=40", { signal })).map((e, i) => ({
    id: e.id ?? i,
    at: str(e.at ?? e.time ?? e.createdAt),
    who: str(e.who ?? e.userName ?? e.appUserName ?? e.name),
    deviceName: str(e.deviceName ?? e.device),
    projectName: str(e.projectName),
    via: str(e.viaLabel ?? e.via),
    text: str(e.text ?? e.event ?? e.action),
  }));
}

/** Рассрочка покупателя; нет рассрочки — 404 → `null`. */
export async function getInstallment(userId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Installment | null> {
  try {
    return fromRawInstallment(await app(scope, `/app-users/${userId}/installment/`, { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getUtilityBills(userId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<UtilityBill[]> {
  return list(await app(scope, `/utility-bills/?appUserId=${userId}`, { signal })).map(fromRawBill);
}

export async function getGuestPasses(userId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<GuestPass[]> {
  return list(await app(scope, `/guest-passes/?appUserId=${userId}`, { signal })).map((g) => ({
    id: g.id,
    plate: str(g.plate),
    validUntil: g.validUntil ?? g.expiresAt ?? null,
    status: str(g.status),
    statusLabel: str(g.statusLabel),
  }));
}

export async function openGate(userId: number, type: "barrier" | "intercom", scope?: RealtyScope): Promise<void> {
  await post(scope, `/app-users/${userId}/open/`, { type });
}

export async function createGuestPass(userId: number, plate: string, scope?: RealtyScope): Promise<void> {
  await post(scope, "/guest-passes/", { appUserId: userId, plate: plate.trim(), hours: 24 });
}

export async function revokeGuestPass(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/guest-passes/${id}/revoke/`);
}

export async function payUtilityBill(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/utility-bills/${id}/pay/`, { method: "app" });
}

export async function sendMeterReadings(userId: number, body: { cold: string; hot: string; el: string }, scope?: RealtyScope): Promise<void> {
  await post(scope, `/app-users/${userId}/meter-readings/`, body);
}

export async function setUserPush(userId: number, push: boolean, scope?: RealtyScope): Promise<void> {
  await app(scope, `/app-users/${userId}/`, { method: "PATCH", body: { push } });
}

/** `to`: `all` / `buyers` / `residents` / id ЖК строкой. */
export async function sendPush(body: { title: string; text: string; to: string }, scope?: RealtyScope): Promise<void> {
  await post(scope, "/pushes/", { ...body, title: body.title.trim(), text: body.text.trim() });
}

export async function toggleAppDevice(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/devices/${id}/toggle/`);
}

/** Колонка «Оплата» (гайд §6): покупатель — по рассрочке, жилец — по последнему счёту. */
export function paymentState(user: Pick<AppUser, "role" | "installmentState" | "lastBill">): { key: string; tone: "success" | "warning" | "error" | null; amount: number | null } {
  if (user.role === "buyer") {
    const s = user.installmentState ?? "";
    return { key: `buyer_${s || "none"}`, tone: s === "overdue" ? "error" : s === "due" ? "warning" : s === "completed" ? "success" : null, amount: null };
  }
  const b = user.lastBill;
  if (!b) return { key: "resident_none", tone: null, amount: null };
  return { key: `resident_${b.status}`, tone: b.status === "paid" ? "success" : b.status === "overdue" ? "error" : b.status === "due" ? "warning" : null, amount: b.total };
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const residentAppKeys = {
  all: ["django", "resident-app"] as const,
  scoped: (scope: RealtyScope | undefined) => [...residentAppKeys.all, ...scopeKey(scope)] as const,
  stats: (scope: RealtyScope | undefined) => [...residentAppKeys.scoped(scope), "stats"] as const,
  users: (scope: RealtyScope | undefined) => [...residentAppKeys.scoped(scope), "users"] as const,
  devices: (scope: RealtyScope | undefined) => [...residentAppKeys.scoped(scope), "devices"] as const,
  pushes: (scope: RealtyScope | undefined) => [...residentAppKeys.scoped(scope), "pushes"] as const,
  access: (scope: RealtyScope | undefined) => [...residentAppKeys.scoped(scope), "access"] as const,
  installment: (scope: RealtyScope | undefined, id: number) => [...residentAppKeys.scoped(scope), "installment", id] as const,
  bills: (scope: RealtyScope | undefined, id: number) => [...residentAppKeys.scoped(scope), "bills", id] as const,
  passes: (scope: RealtyScope | undefined, id: number) => [...residentAppKeys.scoped(scope), "passes", id] as const,
};
