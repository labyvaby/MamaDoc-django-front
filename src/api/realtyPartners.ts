import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Риелторы и партнёры» застройщика (AIVIO): агентства и частные риелторы,
 * их лиды (с закреплением клиента) и комиссии.
 *
 * Контракт — гайд бэка `frontend-sales.md` §9 (05.10.2026).
 * - партнёры и банки — общие для организации; партнёрские лиды и комиссии
 *   режет филиал (карточка партнёра считает только видимое);
 * - лид от партнёра с телефоном, который уже закреплён или есть в CRM →
 *   409 `DUPLICATE` («Клиент уже закреплён за … до …»), партнёр на паузе → 409;
 * - «В CRM →» — `convert/` → карточка CRM-лида (`source: "Партнёр"`);
 * - комиссия начисляется сама при продаже квартиры клиенту партнёра;
 *   утвердить не «Начисленную» → 409; «Выплатить все» — только видимые;
 * - `commission` — ставки по ЖК: ключ — id ЖК строкой, значение — %;
 * - смотреть — `realty.view`, менять — `realty.manage`.
 */

const REALTY_API = "/v2/realty";

export const PARTNER_TYPES = ["agency", "private", "platform"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_LEAD_STATUSES = ["active", "expired", "converted"] as const;
export type PartnerLeadStatus = (typeof PARTNER_LEAD_STATUSES)[number];

export const COMMISSION_STATUSES = ["accrued", "approved", "paid"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export interface PartnersSummary {
  partners: number;
  agents: number;
  partnerLeads: number;
  partnerLeadsMonth: number;
  /** Доля партнёрских продаж, %. */
  partnerSalesShare: number;
  toPay: number;
  approvedCount: number;
}

export interface Partner {
  id: number;
  number: string;
  name: string;
  type: PartnerType | string;
  typeLabel: string;
  contact: string;
  phone: string;
  agents: string[];
  /** Ставка комиссии по ЖК, %: ключ — id ЖК. */
  commission: Record<string, number>;
  status: "active" | "paused" | string;
  rating: number | null;
  leads: number;
  deals: number;
  revenue: number;
  commissionTotal: number;
  commissionPaid: number;
  toPay: number;
  rateMin: number | null;
  rateMax: number | null;
  hasUnpaid: boolean;
}

export interface PartnerLead {
  id: number;
  number: string;
  partnerId: number | null;
  partnerName: string;
  agent: string;
  client: string;
  phone: string;
  projectName: string;
  stage: string;
  stageName: string;
  budget: number;
  status: PartnerLeadStatus | string;
  statusLabel: string;
  /** Клиент закреплён за партнёром до этой даты. */
  fixedUntil: string | null;
  /** CRM-лид после «В CRM →». */
  leadId: number | null;
  closed: string | null;
}

export interface Commission {
  id: number;
  number: string;
  partnerId: number | null;
  partnerName: string;
  /** Номер договора. */
  deal: string;
  buyer: string;
  /** Сумма сделки. */
  amount: number;
  pct: number;
  commission: number;
  status: CommissionStatus | string;
  statusLabel: string;
}

export interface PartnerInput {
  name: string;
  type: PartnerType;
  contact?: string;
  phone?: string;
  agents?: string[];
  commission?: Record<string, number>;
}

export interface PartnerLeadInput {
  partnerId: number;
  client: string;
  phone: string;
  agent?: string;
  projectId?: number | null;
  budget?: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));

const fromRawSummary = (raw: any): PartnersSummary => ({
  partners: num(raw?.partners),
  agents: num(raw?.agents),
  partnerLeads: num(raw?.partnerLeads),
  partnerLeadsMonth: num(raw?.partnerLeadsMonth),
  partnerSalesShare: num(raw?.partnerSalesShare),
  toPay: num(raw?.toPay),
  approvedCount: num(raw?.approvedCount),
});

export const fromRawPartner = (raw: any): Partner => ({
  id: raw.id,
  number: raw.number ?? "",
  name: raw.name ?? "",
  type: raw.type ?? "",
  typeLabel: raw.typeLabel ?? "",
  contact: raw.contact ?? "",
  phone: raw.phone ?? "",
  agents: Array.isArray(raw.agents) ? raw.agents.map((a: any) => (typeof a === "string" ? a : (a?.name ?? ""))).filter(Boolean) : [],
  commission: raw.commission && typeof raw.commission === "object" ? Object.fromEntries(Object.entries(raw.commission).map(([k, v]) => [k, num(v)])) : {},
  status: raw.status ?? "active",
  rating: numOrNull(raw.rating),
  leads: num(raw.leads),
  deals: num(raw.deals),
  revenue: num(raw.revenue),
  commissionTotal: num(raw.commissionTotal),
  commissionPaid: num(raw.commissionPaid),
  toPay: num(raw.toPay),
  rateMin: numOrNull(raw.rateMin),
  rateMax: numOrNull(raw.rateMax),
  hasUnpaid: Boolean(raw.hasUnpaid),
});

const fromRawLead = (raw: any): PartnerLead => ({
  id: raw.id,
  number: raw.number ?? "",
  partnerId: raw.partnerId ?? null,
  partnerName: raw.partnerName ?? "",
  agent: raw.agent ?? "",
  client: raw.client ?? "",
  phone: raw.phone ?? "",
  projectName: raw.projectName ?? "",
  stage: raw.stage ?? "",
  stageName: raw.stageName ?? "",
  budget: num(raw.budget),
  status: raw.status ?? "active",
  statusLabel: raw.statusLabel ?? "",
  fixedUntil: raw.fixedUntil || null,
  leadId: raw.leadId ?? null,
  closed: raw.closed || null,
});

const fromRawCommission = (raw: any): Commission => ({
  id: raw.id,
  number: raw.number ?? "",
  partnerId: raw.partnerId ?? null,
  partnerName: raw.partnerName ?? "",
  deal: raw.deal ?? "",
  buyer: raw.buyer ?? "",
  amount: num(raw.amount),
  pct: num(raw.pct),
  commission: num(raw.commission),
  status: raw.status ?? "accrued",
  statusLabel: raw.statusLabel ?? "",
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const realty = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${REALTY_API}${path}`, { ...options, headers: realtyHeaders(scope) });

const byPartner = (partnerId: number | null | undefined) => (partnerId != null ? `?partnerId=${partnerId}` : "");

export async function getPartnersSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<PartnersSummary> {
  return fromRawSummary(await realty(scope, "/partners/summary/", { signal }));
}

/** Все партнёры (и на паузе): фильтр статуса — на клиенте. */
export async function getPartners(scope?: RealtyScope, signal?: AbortSignal): Promise<Partner[]> {
  const raw = await realty<unknown[]>(scope, "/partners/", { signal });
  return (raw ?? []).map(fromRawPartner);
}

export async function getPartner(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Partner> {
  return fromRawPartner(await realty(scope, `/partners/${id}/`, { signal }));
}

export async function getPartnerLeads(partnerId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<PartnerLead[]> {
  const raw = await realty<unknown[]>(scope, `/partner-leads/${byPartner(partnerId)}`, { signal });
  return (raw ?? []).map(fromRawLead);
}

export async function getCommissions(partnerId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Commission[]> {
  const raw = await realty<unknown[]>(scope, `/commissions/${byPartner(partnerId)}`, { signal });
  return (raw ?? []).map(fromRawCommission);
}

export async function createPartner(input: PartnerInput, scope?: RealtyScope): Promise<Partner> {
  const body: Record<string, unknown> = { name: input.name.trim(), type: input.type };
  if (input.contact?.trim()) body.contact = input.contact.trim();
  if (input.phone?.trim()) body.phone = input.phone.trim();
  if (input.agents?.length) body.agents = input.agents;
  if (input.commission && Object.keys(input.commission).length) body.commission = input.commission;
  return fromRawPartner(await realty(scope, "/partners/", { method: "POST", body }));
}

/** Ответ команды над партнёром — свежая карточка; иначе перечитываем. */
async function partnerCommand(scope: RealtyScope | undefined, id: number, path: string, body?: object): Promise<Partner> {
  const raw = await realty<{ id?: number } | null>(scope, `/partners/${id}/${path}`, { method: "POST", body: body ?? {} });
  return raw && raw.id === id ? fromRawPartner(raw) : getPartner(id, scope);
}

export const setPartnerRates = (id: number, commission: Record<string, number>, scope?: RealtyScope) => partnerCommand(scope, id, "rates/", { commission });

/** «Приостановить» / «Активировать». */
export const togglePartner = (id: number, scope?: RealtyScope) => partnerCommand(scope, id, "toggle/");

export async function createPartnerLead(input: PartnerLeadInput, scope?: RealtyScope): Promise<PartnerLead> {
  const body: Record<string, unknown> = { partnerId: input.partnerId, client: input.client.trim(), phone: input.phone.trim() };
  if (input.agent?.trim()) body.agent = input.agent.trim();
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.budget != null) body.budget = input.budget;
  return fromRawLead(await realty(scope, "/partner-leads/", { method: "POST", body }));
}

/** «В CRM →» — ответ: карточка CRM-лида, нужен её `id`. */
export async function convertPartnerLead(id: number, scope?: RealtyScope): Promise<{ id: number }> {
  return realty<{ id: number }>(scope, `/partner-leads/${id}/convert/`, { method: "POST", body: {} });
}

export async function approveCommission(id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/commissions/${id}/approve/`, { method: "POST", body: {} });
}

export async function payCommission(id: number, scope?: RealtyScope): Promise<void> {
  await realty(scope, `/commissions/${id}/pay/`, { method: "POST", body: {} });
}

export async function payAllCommissions(scope?: RealtyScope): Promise<{ count: number; total: number }> {
  const raw = await realty<{ count?: number; total?: unknown }>(scope, "/commissions/pay-all/", { method: "POST", body: {} });
  return { count: num(raw?.count), total: num(raw?.total) };
}

/** «⇩ Реестр» — CSV комиссий. */
export async function downloadCommissionsCsv(scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${REALTY_API}/commissions/export/`, { credentials: "include", headers: realtyHeaders(scope) });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить реестр (${response.status})`, response.status, null);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `commissions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** «2–3 %» / «1,5 %» / «—» — диапазон ставок партнёра. */
export function rateRange(partner: Pick<Partner, "rateMin" | "rateMax" | "commission">): string {
  const rates = Object.values(partner.commission);
  const min = partner.rateMin ?? (rates.length ? Math.min(...rates) : null);
  const max = partner.rateMax ?? (rates.length ? Math.max(...rates) : null);
  if (min == null || max == null) return "—";
  const f = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return min === max ? `${f(min)} %` : `${f(min)}–${f(max)} %`;
}

/** «Гульнара, Асель , ,Бакыт» → ["Гульнара", "Асель", "Бакыт"]. */
export const parseAgents = (text: string) =>
  text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyPartnerKeys = {
  all: ["django", "realty", "partners"] as const,
  summary: (scope: RealtyScope | undefined) => [...realtyPartnerKeys.all, ...scopeKey(scope), "summary"] as const,
  list: (scope: RealtyScope | undefined) => [...realtyPartnerKeys.all, ...scopeKey(scope), "list"] as const,
  detail: (scope: RealtyScope | undefined, id: number) => [...realtyPartnerKeys.all, ...scopeKey(scope), "detail", id] as const,
  leads: (scope: RealtyScope | undefined, partnerId: number | null) => [...realtyPartnerKeys.all, ...scopeKey(scope), "leads", partnerId] as const,
  commissions: (scope: RealtyScope | undefined, partnerId: number | null) => [...realtyPartnerKeys.all, ...scopeKey(scope), "commissions", partnerId] as const,
};
