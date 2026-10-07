import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Эксплуатация застройщика (AIVIO): приёмка квартир и ключи, сервис жильцов
 * (обращения с SLA, уведомления по дому, дома) — `/api/v2/estate-ops`.
 *
 * Контракт — гайд бэка `frontend-hr-ops.md` §4–5 (05.10.2026).
 * - смотреть — `estate_ops.view`, действия — `estate_ops.manage`;
 * - филиал режет бэк по филиалу ЖК; деньги и даты — как во всём AIVIO;
 * - дефект стройконтроля, акт АПП в ЭДО и push создаёт сервер.
 */

const API = "/v2/estate-ops";

export const HANDOVER_STATUSES = ["scheduled", "inspected", "defects", "done"] as const;
export const REQUEST_FILTERS = ["open", "new", "in_progress", "done", "closed", "all"] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];
export const NOTIFY_CHANNELS = ["push", "whatsapp", "sms"] as const;
/** Каналы уведомления в select макета → `channels`. */
export const NOTICE_CHANNEL_PRESETS: { key: string; channels: string[] }[] = [
  { key: "push_whatsapp", channels: ["push", "whatsapp"] },
  { key: "push", channels: ["push"] },
  { key: "whatsapp", channels: ["whatsapp"] },
  { key: "push_sms", channels: ["push", "sms"] },
];

export interface HistoryEntry {
  at: string;
  by: string;
  text: string;
}

export interface HandoverSummary {
  weekAhead: number;
  today: number;
  scheduledTotal: number;
  withDefects: number;
  openDefects: number;
  keysIssued: number;
  soldUnits: number;
  keysIssuedPct: number;
  avgDays: number | null;
  perWeek: number[];
  keysCumulative: number[];
}

export interface HandoverDefect {
  id: number;
  title: string;
  room: string;
  fixBy: string | null;
  done: boolean;
  doneAt: string | null;
  contractorName: string;
  defectId: number | null;
}

export interface Handover {
  id: number;
  number: string;
  projectId: number | null;
  projectName: string;
  unitId: number | null;
  unitNumber: number | string | null;
  floor: number | null;
  rooms: number | null;
  area: number | null;
  billingAccountId: number | null;
  buyer: string;
  phone: string;
  date: string;
  time: string;
  status: string;
  statusLabel: string;
  managerId: number | null;
  manager: string;
  notify: string;
  keys: boolean;
  keysCount: number;
  keysAt: string | null;
  actNumber: string;
  meters: [string, string][];
  checklistTotal: number;
  checklistChecked: number;
  checklistBad: number;
  defectsTotal: number;
  defectsOpen: number;
  checklist: { id: number; index: number; room: string; item: string; ok: boolean | null }[];
  defects: HandoverDefect[];
  history: HistoryEntry[];
}

export interface WaitingHandover {
  billingAccountId: number;
  buyer: string;
  phone: string;
  projectId: number | null;
  projectName: string;
  unitId: number | null;
  unitNumber: number | string | null;
  contract: string;
}

export interface ProjectReadiness {
  projectId: number;
  projectName: string;
  address: string;
  deadlineLabel: string;
  constructionReadiness: number;
  sold: number;
  scheduled: number;
  inspected: number;
  done: number;
  donePct: number;
}

export interface OpenHandoverDefect {
  id: number;
  handoverId: number;
  handoverNumber: string;
  projectName: string;
  unitNumber: number | string | null;
  buyer: string;
  title: string;
  room: string;
  fixBy: string | null;
  done: boolean;
  overdueDays: number;
  contractorName: string;
  defectId: number | null;
}

export interface RequestsSummary {
  open: number;
  new: number;
  overdue: number;
  avgResolutionHours: number | null;
  rating: number | null;
  ratedCount: number;
  byCategory: { category: string; categoryLabel: string; count: number }[];
  slaNorms: { label: string; hours: number }[];
}

export interface ResidentRequest {
  id: number;
  number: string;
  projectId: number | null;
  projectName: string;
  unitNumber: number | string | null;
  resident: string;
  residentPhone: string;
  category: string;
  categoryLabel: string;
  title: string;
  description: string;
  created: string;
  sla: number;
  slaDeadline: string | null;
  slaLeftHours: number | null;
  slaOverdue: boolean;
  status: string;
  statusLabel: string;
  urgent: boolean;
  fromApp: boolean;
  assigneeId: number | null;
  assignee: string;
  rating: number | null;
  defectId: number | null;
  messages: { id: number; at: string; by: string; fromResident: boolean; text: string }[];
  history: HistoryEntry[];
  similar: { id: number; number: string; title: string; statusLabel: string }[];
}

export interface Notice {
  id: number;
  number: string;
  projectId: number | null;
  projectName: string;
  audience: string;
  channels: string[];
  channel: string;
  title: string;
  text: string;
  date: string;
  status: string;
  statusLabel: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
  delivered: number | null;
  deliveredPct: number | null;
  author: string;
}

export interface House {
  projectId: number;
  projectName: string;
  address: string;
  requestsTotal: number;
  requestsClosed: number;
  requestsOpen: number;
  settled: number;
  sold: number;
  managementCompany: string;
  byCategory: { category: string; categoryLabel: string; count: number }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);
const history = (value: unknown): HistoryEntry[] => list(value).map((h) => ({ at: str(h.at), by: str(h.by), text: str(h.text) }));
const byCategory = (value: unknown) => list(value).map((c) => ({ category: str(c.category), categoryLabel: str(c.categoryLabel || c.category), count: num(c.count) }));

export const fromRawHandoverSummary = (raw: any): HandoverSummary => ({
  weekAhead: num(raw?.weekAhead),
  today: num(raw?.today),
  scheduledTotal: num(raw?.scheduledTotal),
  withDefects: num(raw?.withDefects),
  openDefects: num(raw?.openDefects),
  keysIssued: num(raw?.keysIssued),
  soldUnits: num(raw?.soldUnits),
  keysIssuedPct: num(raw?.keysIssuedPct),
  avgDays: numOrNull(raw?.avgDays),
  perWeek: list(raw?.perWeek).map(num),
  keysCumulative: list(raw?.keysCumulative).map(num),
});

export const fromRawHandover = (raw: any): Handover => ({
  id: raw.id,
  number: str(raw.number),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  unitId: raw.unitId ?? null,
  unitNumber: raw.unitNumber ?? null,
  floor: numOrNull(raw.floor),
  rooms: numOrNull(raw.rooms),
  area: numOrNull(raw.area),
  billingAccountId: raw.billingAccountId ?? null,
  buyer: str(raw.buyer),
  phone: str(raw.phone),
  date: str(raw.date),
  time: str(raw.time).slice(0, 5),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  managerId: raw.managerId ?? null,
  manager: str(raw.manager),
  notify: str(raw.notify),
  keys: Boolean(raw.keys),
  keysCount: num(raw.keysCount),
  keysAt: raw.keysAt ?? null,
  actNumber: str(raw.actNumber),
  meters: list(raw.meters).filter((m) => Array.isArray(m)).map((m) => [str(m[0]), str(m[1])] as [string, string]),
  checklistTotal: num(raw.checklistTotal),
  checklistChecked: num(raw.checklistChecked),
  checklistBad: num(raw.checklistBad),
  defectsTotal: num(raw.defectsTotal),
  defectsOpen: num(raw.defectsOpen),
  checklist: list(raw.checklist).map((c) => ({ id: c.id, index: num(c.index), room: str(c.room), item: str(c.item), ok: c.ok ?? null })),
  defects: list(raw.defects).map((d) => ({
    id: d.id,
    title: str(d.title),
    room: str(d.room),
    fixBy: d.fixBy ?? null,
    done: Boolean(d.done),
    doneAt: d.doneAt ?? null,
    contractorName: str(d.contractorName),
    defectId: d.defectId ?? null,
  })),
  history: history(raw.history),
});

export const fromRawRequestsSummary = (raw: any): RequestsSummary => ({
  open: num(raw?.open),
  new: num(raw?.new),
  overdue: num(raw?.overdue),
  avgResolutionHours: numOrNull(raw?.avgResolutionHours),
  rating: numOrNull(raw?.rating),
  ratedCount: num(raw?.ratedCount),
  byCategory: byCategory(raw?.byCategory),
  slaNorms: list(raw?.slaNorms).map((s) => ({ label: str(s.label), hours: num(s.hours) })),
});

export const fromRawRequest = (raw: any): ResidentRequest => ({
  id: raw.id,
  number: str(raw.number),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  unitNumber: raw.unitNumber ?? null,
  resident: str(raw.resident),
  residentPhone: str(raw.residentPhone),
  category: str(raw.category),
  categoryLabel: str(raw.categoryLabel || raw.category),
  title: str(raw.title),
  description: str(raw.description),
  created: str(raw.created),
  sla: num(raw.sla),
  slaDeadline: raw.slaDeadline ?? null,
  slaLeftHours: numOrNull(raw.slaLeftHours),
  slaOverdue: Boolean(raw.slaOverdue),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  urgent: Boolean(raw.urgent),
  fromApp: Boolean(raw.fromApp),
  assigneeId: raw.assigneeId ?? null,
  assignee: str(raw.assignee),
  rating: numOrNull(raw.rating),
  defectId: raw.defectId ?? null,
  messages: list(raw.messages).map((m) => ({ id: m.id, at: str(m.at), by: str(m.by), fromResident: Boolean(m.fromResident), text: str(m.text) })),
  history: history(raw.history),
  similar: list(raw.similar).map((x) => ({ id: x.id, number: str(x.number), title: str(x.title), statusLabel: str(x.statusLabel) })),
});

export const fromRawNotice = (raw: any): Notice => ({
  id: raw.id,
  number: str(raw.number),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  audience: str(raw.audience),
  channels: list(raw.channels).map(String),
  channel: str(raw.channel),
  title: str(raw.title),
  text: str(raw.text),
  date: str(raw.date),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  scheduledAt: raw.scheduledAt ?? null,
  sentAt: raw.sentAt ?? null,
  recipients: num(raw.recipients),
  delivered: numOrNull(raw.delivered),
  deliveredPct: numOrNull(raw.deliveredPct),
  author: str(raw.author),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

const ops = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });
const post = <T>(scope: RealtyScope | undefined, path: string, body: unknown = {}) => ops<T>(scope, path, { method: "POST", body });

export function opsQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") qs.set(key, String(value));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

// Приёмка и ключи

export async function getHandoverSummary(projectId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<HandoverSummary> {
  return fromRawHandoverSummary(await ops(scope, `/handovers/summary/${opsQuery({ projectId })}`, { signal }));
}

export async function getHandovers(params: { dateFrom?: string; dateTo?: string; date?: string; projectId?: number | null; status?: string; search?: string }, scope?: RealtyScope, signal?: AbortSignal): Promise<Handover[]> {
  return list(await ops(scope, `/handovers/${opsQuery({ ...params, search: params.search?.trim() })}`, { signal })).map(fromRawHandover);
}

export async function getHandover(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Handover> {
  return fromRawHandover(await ops(scope, `/handovers/${id}/`, { signal }));
}

export async function getWaitingHandovers(scope?: RealtyScope, signal?: AbortSignal): Promise<WaitingHandover[]> {
  return list(await ops(scope, "/handovers/waiting/", { signal })).map((w) => ({
    billingAccountId: w.billingAccountId,
    buyer: str(w.buyer),
    phone: str(w.phone),
    projectId: w.projectId ?? null,
    projectName: str(w.projectName),
    unitId: w.unitId ?? null,
    unitNumber: w.unitNumber ?? null,
    contract: str(w.contract),
  }));
}

export async function getReadiness(scope?: RealtyScope, signal?: AbortSignal): Promise<ProjectReadiness[]> {
  return list(await ops(scope, "/handovers/readiness/", { signal })).map((r) => ({
    projectId: r.projectId,
    projectName: str(r.projectName),
    address: str(r.address),
    deadlineLabel: str(r.deadlineLabel),
    constructionReadiness: num(r.constructionReadiness),
    sold: num(r.sold),
    scheduled: num(r.scheduled),
    inspected: num(r.inspected),
    done: num(r.done),
    donePct: num(r.donePct),
  }));
}

export async function getOpenHandoverDefects(scope?: RealtyScope, signal?: AbortSignal): Promise<OpenHandoverDefect[]> {
  return list(await ops(scope, "/handover-defects/?open=true", { signal })).map((d) => ({
    id: d.id,
    handoverId: d.handoverId,
    handoverNumber: str(d.handoverNumber),
    projectName: str(d.projectName),
    unitNumber: d.unitNumber ?? null,
    buyer: str(d.buyer),
    title: str(d.title),
    room: str(d.room),
    fixBy: d.fixBy ?? null,
    done: Boolean(d.done),
    overdueDays: num(d.overdueDays),
    contractorName: str(d.contractorName),
    defectId: d.defectId ?? null,
  }));
}

export async function createHandover(body: { billingAccountId: number; date: string; time: string; managerId: number | null; notify: string }, scope?: RealtyScope): Promise<Handover> {
  const payload: Record<string, unknown> = { billingAccountId: body.billingAccountId, date: body.date, time: body.time, notify: body.notify };
  if (body.managerId != null) payload.managerId = body.managerId;
  return fromRawHandover(await post(scope, "/handovers/", payload));
}

export async function tickChecklist(id: number, itemId: number, ok: boolean | null, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await ops(scope, `/handovers/${id}/checklist/${itemId}/`, { method: "PATCH", body: { ok } }));
}

export async function inspectHandover(id: number, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await post(scope, `/handovers/${id}/inspect/`));
}

export async function rescheduleHandover(id: number, body: { date: string; time: string; reason: string }, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await post(scope, `/handovers/${id}/reschedule/`, { ...body, reason: body.reason.trim() }));
}

export async function remindHandover(id: number, channel: string, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await post(scope, `/handovers/${id}/remind/`, { channel }));
}

export async function addHandoverDefect(id: number, body: { title: string; room: string; contractorId: number | null; fixBy: string | null }, scope?: RealtyScope): Promise<Handover> {
  const payload: Record<string, unknown> = { title: body.title.trim(), room: body.room };
  if (body.contractorId != null) payload.contractorId = body.contractorId;
  if (body.fixBy) payload.fixBy = body.fixBy;
  return fromRawHandover(await post(scope, `/handovers/${id}/defects/`, payload));
}

export async function resolveHandoverDefect(id: number, defectId: number, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await post(scope, `/handovers/${id}/defects/${defectId}/resolve/`));
}

/** Акт АПП в ЭДО и выдача ключей; только из `inspected` / `defects`. */
export async function signHandover(id: number, body: { keysCount: number; meters?: [string, string][] }, scope?: RealtyScope): Promise<Handover> {
  return fromRawHandover(await post(scope, `/handovers/${id}/sign/`, body.meters ? body : { keysCount: body.keysCount }));
}

// Сервис жильцов

export async function getRequestsSummary(projectId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<RequestsSummary> {
  return fromRawRequestsSummary(await ops(scope, `/requests/summary/${opsQuery({ projectId })}`, { signal }));
}

export async function getResidentRequests(params: { status: RequestFilter; projectId?: number | null; search?: string }, scope?: RealtyScope, signal?: AbortSignal): Promise<ResidentRequest[]> {
  return list(await ops(scope, `/requests/${opsQuery({ status: params.status, projectId: params.projectId, search: params.search?.trim() })}`, { signal })).map(fromRawRequest);
}

export async function getResidentRequest(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ResidentRequest> {
  return fromRawRequest(await ops(scope, `/requests/${id}/`, { signal }));
}

export interface RequestInput {
  resident: string;
  projectId: number;
  unitNumber: string;
  category: string;
  sla: number | null;
  title: string;
  description: string;
  urgent: boolean;
}

export async function createResidentRequest(input: RequestInput, scope?: RealtyScope): Promise<ResidentRequest> {
  const body: Record<string, unknown> = { resident: input.resident.trim(), projectId: input.projectId, category: input.category, title: input.title.trim(), description: input.description.trim(), urgent: input.urgent };
  if (input.unitNumber.trim()) body.unitNumber = input.unitNumber.trim();
  if (input.sla != null) body.sla = input.sla;
  return fromRawRequest(await post(scope, "/requests/", body));
}

export type RequestAction = "take" | "done" | "close";

export async function runRequestAction(id: number, action: RequestAction, scope?: RealtyScope): Promise<ResidentRequest> {
  return fromRawRequest(await post(scope, `/requests/${id}/${action}/`));
}

/** Сотрудник — `assigneeId`, подрядчик из списка макета — `assigneeName`. */
export async function assignRequest(id: number, body: { assigneeId?: number; assigneeName?: string; note?: string }, scope?: RealtyScope): Promise<ResidentRequest> {
  return fromRawRequest(await post(scope, `/requests/${id}/assign/`, body));
}

export async function replyRequest(id: number, text: string, scope?: RealtyScope): Promise<void> {
  await post(scope, `/requests/${id}/messages/`, { text: text.trim() });
}

export async function requestToQuality(id: number, body: { contractorId: number | null; deadline: string | null }, scope?: RealtyScope): Promise<ResidentRequest> {
  const payload: Record<string, unknown> = {};
  if (body.contractorId != null) payload.contractorId = body.contractorId;
  if (body.deadline) payload.deadline = body.deadline;
  return fromRawRequest(await post(scope, `/requests/${id}/to-quality/`, payload));
}

/** Кнопки обращения по статусу (гайд §5 «Действия»); дефект уже заведён — «В стройконтроль» не повторяем. */
export function requestActions(status: string, hasDefect = false): ("take" | "assign" | "done" | "close" | "toQuality")[] {
  const quality = hasDefect ? [] : (["toQuality"] as const);
  switch (status) {
    case "new":
      return ["take", "assign", ...quality];
    case "in_progress":
      return ["done", "assign", ...quality];
    case "done":
      return ["close"];
    default:
      return [];
  }
}

export async function getNotices(projectId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Notice[]> {
  return list(await ops(scope, `/notices/${opsQuery({ projectId })}`, { signal })).map(fromRawNotice);
}

export async function createNotice(body: { projectId: number; channels: string[]; title: string; text: string; scheduledAt: string | null }, scope?: RealtyScope): Promise<Notice> {
  return fromRawNotice(await post(scope, "/notices/", { ...body, title: body.title.trim(), text: body.text.trim(), segment: "all", section: "" }));
}

export async function runNoticeAction(id: number, action: "send" | "cancel", scope?: RealtyScope): Promise<Notice> {
  return fromRawNotice(await post(scope, `/notices/${id}/${action}/`));
}

export async function getHouses(scope?: RealtyScope, signal?: AbortSignal): Promise<House[]> {
  return list(await ops(scope, "/houses/", { signal })).map((h) => ({
    projectId: h.projectId,
    projectName: str(h.projectName),
    address: str(h.address),
    requestsTotal: num(h.requestsTotal),
    requestsClosed: num(h.requestsClosed),
    requestsOpen: num(h.requestsOpen),
    settled: num(h.settled),
    sold: num(h.sold),
    managementCompany: str(h.managementCompany),
    byCategory: byCategory(h.byCategory),
  }));
}

// ─── Хелперы ────────────────────────────────────────────────────────────────

/** Понедельник и воскресенье недели, где лежит `iso` (`YYYY-MM-DD`). */
export function weekRange(iso: string): { from: string; to: string; days: string[] } {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - dow * 86_400_000);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  return { from: days[0], to: days[6], days };
}

/** Помещения смотрового листа в порядке пунктов (для select замечания). */
export function checklistRooms(checklist: Handover["checklist"]): string[] {
  const rooms: string[] = [];
  for (const c of [...checklist].sort((a, b) => a.index - b.index)) if (c.room && !rooms.includes(c.room)) rooms.push(c.room);
  return rooms;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const estateOpsKeys = {
  all: ["django", "estate-ops"] as const,
  scoped: (scope: RealtyScope | undefined) => [...estateOpsKeys.all, ...scopeKey(scope)] as const,
  handoverSummary: (scope: RealtyScope | undefined, projectId: number | null) => [...estateOpsKeys.scoped(scope), "handover-summary", projectId] as const,
  handovers: (scope: RealtyScope | undefined, params: Record<string, unknown>) => [...estateOpsKeys.scoped(scope), "handovers", params] as const,
  handover: (scope: RealtyScope | undefined, id: number) => [...estateOpsKeys.scoped(scope), "handover", id] as const,
  waiting: (scope: RealtyScope | undefined) => [...estateOpsKeys.scoped(scope), "waiting"] as const,
  readiness: (scope: RealtyScope | undefined) => [...estateOpsKeys.scoped(scope), "readiness"] as const,
  openDefects: (scope: RealtyScope | undefined) => [...estateOpsKeys.scoped(scope), "open-defects"] as const,
  requestsSummary: (scope: RealtyScope | undefined, projectId: number | null) => [...estateOpsKeys.scoped(scope), "requests-summary", projectId] as const,
  requests: (scope: RealtyScope | undefined, params: Record<string, unknown>) => [...estateOpsKeys.scoped(scope), "requests", params] as const,
  request: (scope: RealtyScope | undefined, id: number) => [...estateOpsKeys.scoped(scope), "request", id] as const,
  notices: (scope: RealtyScope | undefined, projectId: number | null) => [...estateOpsKeys.scoped(scope), "notices", projectId] as const,
  houses: (scope: RealtyScope | undefined) => [...estateOpsKeys.scoped(scope), "houses"] as const,
};
