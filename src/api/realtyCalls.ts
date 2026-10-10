import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";
import type { RealtyTaskItem } from "./realtyTasks";

/**
 * Звонки и записи застройщика (AIVIO) — журнал разговоров отдела продаж.
 *
 * Контракт — гайд бэка `frontend-sales.md` §4 (05.10.2026), формы сверены с
 * test2 06.10.2026.
 * - телефонии нет: звонок записывает менеджер (итог, расшифровка, запись —
 *   если пришла ссылка `recordingUrl`; на test2 ссылок и `waveform` нет);
 * - без `leadId` бэк сам привязывает звонок к лиду с тем же телефоном,
 *   менеджер по умолчанию — тот, кто записывает;
 * - «☑ Создать задачу» — `POST /calls/<id>/tasks/`: задача на +1 час с текстом
 *   `nextAction`;
 * - смотреть — `realty.view`, записывать, править и удалять — `realty.manage`
 *   (`DELETE /calls/<id>/` с 09.10.2026).
 */

const CALLS_API = "/v2/realty/calls";

export const CALL_FILTERS = ["all", "incoming", "outgoing", "missed", "recorded"] as const;
export type CallFilter = (typeof CALL_FILTERS)[number];

export const CALL_DIRECTIONS = ["incoming", "outgoing"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_STATUSES = ["answered", "missed", "no-answer"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export interface CallLine {
  /** «00:04» — отметка в записи. */
  time: string;
  speaker: string;
  text: string;
}

export interface Call {
  id: number;
  number: string;
  leadId: number | null;
  client: string;
  phone: string;
  managerId: number | null;
  manager: string | null;
  direction: CallDirection | string;
  status: CallStatus | string;
  statusLabel: string;
  seconds: number;
  /** Итог одной строкой: «Показ назначен». */
  result: string;
  recording: boolean;
  recordingUrl: string;
  sentiment: string;
  /** Оценка разговора 0–100; `null` — не оценивался (нет записи). */
  quality: number | null;
  summary: string;
  nextAction: string;
  transcript: CallLine[];
  /** Интерес клиента: «3-комн. · 92 м²». */
  deal: string;
  projectId: number | null;
  project: string | null;
  at: string;
  /** today / yesterday / earlier — считает бэк. */
  day: string;
}

export interface CallsSummary {
  today: number;
  averageSeconds: number;
  /** Дозвон, %. */
  answerRate: number;
  missedToday: number;
  averageQuality: number | null;
  managerQuality: { managerId: number; name: string; count: number; score: number }[];
  counts: Record<CallFilter, number>;
}

export interface CallsParams {
  filter?: CallFilter;
  search?: string;
  leadId?: number | null;
}

export interface CallInput {
  client: string;
  direction: CallDirection;
  status: CallStatus;
  phone?: string;
  leadId?: number | null;
  seconds?: number;
  result?: string;
  summary?: string;
  nextAction?: string;
  deal?: string;
  projectId?: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const fromRaw = (raw: any): Call => ({
  id: raw.id,
  number: raw.number ?? "",
  leadId: raw.leadId ?? null,
  client: raw.client ?? "",
  phone: raw.phone ?? "",
  managerId: raw.managerId ?? null,
  manager: raw.manager ?? null,
  direction: raw.direction ?? "incoming",
  status: raw.status ?? "answered",
  statusLabel: raw.statusLabel ?? "",
  seconds: Number(raw.seconds) || 0,
  result: raw.result ?? "",
  recording: Boolean(raw.recording),
  recordingUrl: raw.recordingUrl ?? "",
  sentiment: raw.sentiment ?? "",
  quality: typeof raw.quality === "number" ? raw.quality : null,
  summary: raw.summary ?? "",
  nextAction: raw.nextAction ?? "",
  transcript: Array.isArray(raw.transcript) ? raw.transcript.map((x: any) => ({ time: x.time ?? "", speaker: x.speaker ?? "", text: x.text ?? "" })) : [],
  deal: raw.deal ?? "",
  projectId: raw.projectId ?? null,
  project: raw.project ?? null,
  at: raw.at ?? raw.createdAt ?? "",
  day: raw.day ?? "",
});

const fromRawSummary = (raw: any): CallsSummary => ({
  today: Number(raw?.today) || 0,
  averageSeconds: Number(raw?.averageSeconds) || 0,
  answerRate: Number(raw?.answerRate) || 0,
  missedToday: Number(raw?.missedToday) || 0,
  averageQuality: typeof raw?.averageQuality === "number" ? raw.averageQuality : null,
  managerQuality: Array.isArray(raw?.managerQuality) ? raw.managerQuality : [],
  counts: Object.fromEntries(CALL_FILTERS.map((key) => [key, Number(raw?.counts?.[key]) || 0])) as Record<CallFilter, number>,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function listQuery(params: CallsParams): string {
  const query = new URLSearchParams();
  if (params.filter && params.filter !== "all") query.set("filter", params.filter);
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.leadId != null) query.set("leadId", String(params.leadId));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

const calls = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${CALLS_API}${path}`, { ...options, headers: realtyHeaders(scope) });

export async function getCallsSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<CallsSummary> {
  return fromRawSummary(await calls(scope, "/summary/", { signal }));
}

/** Журнал — новые сверху (так отдаёт бэк). */
export async function getCalls(params: CallsParams, scope?: RealtyScope, signal?: AbortSignal): Promise<Call[]> {
  const raw = await calls<unknown[]>(scope, `/${listQuery(params)}`, { signal });
  return (raw ?? []).map(fromRaw);
}

export async function getCall(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Call> {
  return fromRaw(await calls(scope, `/${id}/`, { signal }));
}

/** Тело без пустых полей: бэк сам ставит менеджера, время и привязку к лиду. */
export function buildCallBody(input: Partial<CallInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    body[key] = typeof value === "string" ? value.trim() : value;
  }
  return body;
}

export async function createCall(input: CallInput, scope?: RealtyScope): Promise<Call> {
  return fromRaw(await calls(scope, "/", { method: "POST", body: buildCallBody(input) }));
}

/** Правка итога. Пустая строка очищает поле — её шлём как есть. */
export async function updateCall(id: number, patch: Partial<Pick<Call, "result" | "summary" | "nextAction" | "status" | "seconds">>, scope?: RealtyScope): Promise<Call> {
  return fromRaw(await calls(scope, `/${id}/`, { method: "PATCH", body: patch }));
}

/** Удалить звонок (`realty.manage`). Задачи из звонка остаются, их ссылка на звонок обнуляется. */
export async function deleteCall(id: number, scope?: RealtyScope): Promise<void> {
  await calls(scope, `/${id}/`, { method: "DELETE" });
}

/** «☑ Создать задачу» — задача `call` на +1 час с текстом следующего шага. */
export async function createCallTask(id: number, scope?: RealtyScope): Promise<RealtyTaskItem> {
  return calls<RealtyTaskItem>(scope, `/${id}/tasks/`, { method: "POST" });
}

/** «⇩ Выгрузить журнал» — CSV бэка с теми же фильтрами. */
export async function downloadCallsCsv(params: CallsParams, scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${CALLS_API}/export/${listQuery(params)}`, { credentials: "include", headers: realtyHeaders(scope) });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить журнал (${response.status})`, response.status, null);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `calls-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 247 → «04:07». */
export function formatCallDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** «4:07», «247», «04:07» → секунды; пусто → 0; мусор → null. */
export function parseCallDuration(text: string): number | null {
  const value = text.trim();
  if (!value) return 0;
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(value);
  if (!match) return null;
  return match[2] == null ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2]);
}

/**
 * «Требуют внимания»: пропущенные и недозвоны — первыми, затем звонки со
 * следующим шагом (гайд §4). Свежие выше.
 */
export function callsNeedingAttention(list: readonly Call[], limit = 5): Call[] {
  const rank = (call: Call) => (call.status === "missed" || call.status === "no-answer" ? 0 : 1);
  return list
    .filter((call) => rank(call) === 0 || call.nextAction.trim() !== "")
    .sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at))
    .slice(0, limit);
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyCallKeys = {
  all: ["django", "realty", "calls"] as const,
  list: (scope: RealtyScope | undefined, params: CallsParams) => [...realtyCallKeys.all, ...scopeKey(scope), "list", params] as const,
  detail: (scope: RealtyScope | undefined, id: number) => [...realtyCallKeys.all, ...scopeKey(scope), "detail", id] as const,
  summary: (scope: RealtyScope | undefined) => [...realtyCallKeys.all, ...scopeKey(scope), "summary"] as const,
};
