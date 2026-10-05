import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";
import type { RealtyTaskItem } from "./realtyTasks";

/**
 * Лиды застройщика (AIVIO) — «CRM · воронка» и «Лиды и клиенты».
 *
 * Контракт — гайд бэка `frontend-sales.md` §0–3 (05.10.2026), формы сверены с
 * test2 06.10.2026. Заменяют для застройщика MamaDoc-воронку `/api/deals/` и
 * «Пациентов» `/api/patients/`: у ролей AIVIO там 403, клиент — это сам лид.
 * - этапы фиксированные (6, как в прототипе), названия — `stageName` от бэка;
 * - список — одним массивом, колонки доски группирует фронт по `stage`;
 * - перенос карточки — `PATCH {stage, position}`; этап бэк двигает и сам
 *   (бронь → «Бронирование», договор → «Договор / оплата», только вперёд);
 * - смотреть — `realty.view`, менять — `realty.manage`;
 * - деньги — строки-decimal, здесь → числа.
 */

const LEADS_API = "/v2/realty/leads";

export const LEAD_STAGES = ["new", "contact", "measure", "estimate", "contract", "build"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_TEMPS = ["hot", "warm", "cold"] as const;
export type LeadTemp = (typeof LEAD_TEMPS)[number];

/** Источник — свободная строка; это список прототипа для выбора в форме. */
export const LEAD_SOURCES = ["Instagram", "Сайт", "Рекомендация", "2ГИС", "YouTube", "Звонок", "Выставка", "Партнёр"] as const;

/** Чипы «Лидов»: все активные, без дела, просроченные. */
export type LeadsFilter = "active" | "notask" | "overdue";

export interface LeadComment {
  id: number;
  authorId: number | null;
  author: string;
  text: string;
  createdAt: string;
}

export interface Lead {
  id: number;
  client: string;
  phone: string;
  /** Запрос клиента текстом: «2-комн. · 67 м²». */
  project: string;
  /** «ЖК «Ала-Тоо Residence»». */
  location: string;
  projectId: number | null;
  projectName: string | null;
  unitId: number | null;
  unitNumber: number | null;
  budget: number;
  stage: LeadStage | string;
  stageName: string;
  source: string;
  managerId: number | null;
  manager: string | null;
  temp: LeadTemp | string;
  /** Следующее дело текстом; пусто — «без дела». */
  task: string;
  overdue: boolean;
  position: number;
  created: string;
  comments: LeadComment[];
}

export interface LeadStageChange {
  id: number;
  fromStage: string;
  toStage: string;
  fromName: string;
  toName: string;
  by: string;
  at: string;
}

export interface LeadDetail extends Lead {
  stageHistory: LeadStageChange[];
  tasks: RealtyTaskItem[];
}

export interface LeadsParams {
  search?: string;
  managerId?: number | null;
  /** Только горячие. */
  hot?: boolean;
  filter?: LeadsFilter;
  /** Один этап: «Из CRM — сделки на этапе договора» в мотивации. */
  stage?: LeadStage;
}

export interface LeadInput {
  client: string;
  phone?: string;
  project?: string;
  projectId?: number | null;
  budget?: number | null;
  source?: string;
  managerId?: number | null;
  temp?: LeadTemp;
  task?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const money = (value: unknown) => Number(value ?? 0) || 0;

function fromRaw(raw: any): Lead {
  return {
    id: raw.id,
    client: raw.client ?? "",
    phone: raw.phone ?? "",
    project: raw.project ?? "",
    location: raw.location ?? "",
    projectId: raw.projectId ?? null,
    projectName: raw.projectName ?? null,
    unitId: raw.unitId ?? null,
    unitNumber: raw.unitNumber ?? null,
    budget: money(raw.budget),
    stage: raw.stage ?? "new",
    stageName: raw.stageName ?? "",
    source: raw.source ?? "",
    managerId: raw.managerId ?? null,
    manager: raw.manager ?? null,
    temp: raw.temp ?? "warm",
    task: raw.task ?? "",
    overdue: Boolean(raw.overdue),
    position: raw.position ?? 0,
    created: raw.created ?? "",
    comments: raw.comments ?? [],
  };
}

function fromRawDetail(raw: any): LeadDetail {
  return { ...fromRaw(raw), stageHistory: raw.stageHistory ?? [], tasks: raw.tasks ?? [] };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function listQuery(params: LeadsParams): string {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.managerId != null) query.set("managerId", String(params.managerId));
  if (params.hot) query.set("temp", "hot");
  if (params.filter && params.filter !== "active") query.set("filter", params.filter);
  if (params.stage) query.set("stage", params.stage);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

const leads = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${LEADS_API}${path}`, { ...options, headers: { ...realtyHeaders(scope), ...(options.headers as Record<string, string> | undefined) } });

export async function getLeads(params: LeadsParams, scope?: RealtyScope, signal?: AbortSignal): Promise<Lead[]> {
  const raw = await leads<unknown[]>(scope, `/${listQuery(params)}`, { signal });
  return (raw ?? []).map(fromRaw);
}

export async function getLead(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<LeadDetail> {
  return fromRawDetail(await leads(scope, `/${id}/`, { signal }));
}

export async function createLead(input: LeadInput, scope?: RealtyScope): Promise<LeadDetail> {
  const body: Record<string, unknown> = { client: input.client.trim() };
  if (input.phone) body.phone = input.phone;
  if (input.project?.trim()) body.project = input.project.trim();
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.budget != null) body.budget = input.budget;
  if (input.source) body.source = input.source;
  // Гайд: ответственного присылать всегда — без него лид останется ничьим.
  if (input.managerId != null) body.managerId = input.managerId;
  if (input.temp) body.temp = input.temp;
  if (input.task?.trim()) body.task = input.task.trim();
  return fromRawDetail(await leads(scope, "/", { method: "POST", body }));
}

export async function updateLead(
  id: number,
  patch: Partial<{ stage: string; position: number; temp: string; managerId: number | null; task: string; budget: number }>,
  scope?: RealtyScope,
): Promise<LeadDetail> {
  return fromRawDetail(await leads(scope, `/${id}/`, { method: "PATCH", body: patch }));
}

export async function addLeadComment(id: number, text: string, scope?: RealtyScope): Promise<LeadComment> {
  return leads<LeadComment>(scope, `/${id}/comments/`, { method: "POST", body: { text } });
}

export async function deleteLead(id: number, scope?: RealtyScope): Promise<void> {
  await leads(scope, `/${id}/`, { method: "DELETE" });
}

/** «⇩ Экспорт» — CSV (`;`, UTF-8 BOM) с теми же фильтрами, что список. */
export async function downloadLeadsCsv(params: LeadsParams, scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${LEADS_API}/export/${listQuery(params)}`, { credentials: "include", headers: realtyHeaders(scope) });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить лиды (${response.status})`, response.status, null);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** KPI «Конверсия в договор» — из аналитики CRM за 30 дней, %. */
export async function getLeadsConversion(scope?: RealtyScope, signal?: AbortSignal): Promise<number | null> {
  const raw = await apiRequest<{ conversion?: number | null }>("/v2/realty/analytics/summary/?period=30", { headers: realtyHeaders(scope), signal });
  return typeof raw.conversion === "number" ? raw.conversion : null;
}

/** KPI воронки и «Лидов» — из того же списка, что на экране (гайд §2). */
export function leadsStats(list: readonly Lead[]) {
  return {
    count: list.length,
    budget: list.reduce((sum, lead) => sum + lead.budget, 0),
    hot: list.filter((lead) => lead.temp === "hot").length,
    notask: list.filter((lead) => !lead.task.trim()).length,
    overdue: list.filter((lead) => lead.overdue).length,
  };
}

/** Колонки доски: этапы в порядке воронки, внутри — по `position`. */
export function groupByStage(list: readonly Lead[]): Record<LeadStage, Lead[]> {
  const columns = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, [] as Lead[]])) as Record<LeadStage, Lead[]>;
  for (const lead of list) {
    const stage = (LEAD_STAGES as readonly string[]).includes(lead.stage) ? (lead.stage as LeadStage) : "new";
    columns[stage].push(lead);
  }
  for (const stage of LEAD_STAGES) columns[stage].sort((a, b) => a.position - b.position || a.id - b.id);
  return columns;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyLeadKeys = {
  all: ["django", "realty", "leads"] as const,
  list: (scope: RealtyScope | undefined, params: LeadsParams) => [...realtyLeadKeys.all, ...scopeKey(scope), "list", params] as const,
  detail: (scope: RealtyScope | undefined, id: number) => [...realtyLeadKeys.all, ...scopeKey(scope), "detail", id] as const,
  conversion: (scope: RealtyScope | undefined) => [...realtyLeadKeys.all, ...scopeKey(scope), "conversion"] as const,
};
