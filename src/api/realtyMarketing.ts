import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Маркетинг и ROI» застройщика (AIVIO) — рекламные кампании (план расхода по
 * каналу) и сводка: лиды, договоры, расход, стоимость заявки, ROMI.
 *
 * Контракт — гайд бэка `frontend-sales.md` §10 (05.10.2026, новое).
 * - канал кампании — строка `source` лидов: выбирать из того же списка,
 *   иначе расход и лиды попадут в разные строки;
 * - расход кампании раскладывается по дням; без `endDate` — однодневная;
 * - `costPerLead`/`romi` — `null`, когда считать не из чего;
 * - кампания — план, не платёж: деньги проводятся в «Касса и банк»;
 * - филиал режет бэк; менять — `realty.manage`.
 */

const MARKETING_API = "/v2/realty/marketing";

export const MARKETING_PERIODS = [7, 30, 90, 365] as const;
export type MarketingPeriod = (typeof MARKETING_PERIODS)[number];

export const CAMPAIGN_STATUSES = ["planned", "active", "finished"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface MarketingChannel {
  source: string;
  leads: number;
  deals: number;
  spend: number;
  /** Договоры / лиды, %. */
  conversion: number;
  revenue: number;
  costPerLead: number | null;
  romi: number | null;
}

export interface MarketingSummary {
  dateFrom: string;
  dateTo: string;
  budget: number;
  leads: number;
  leadsPrev: number;
  leadsChangePct: number | null;
  deals: number;
  revenue: number;
  costPerLead: number | null;
  romi: number | null;
  campaigns: number;
  channels: MarketingChannel[];
}

export interface Campaign {
  id: number;
  name: string;
  source: string;
  startDate: string;
  endDate: string | null;
  budget: number;
  note: string;
  status: CampaignStatus | string;
  statusLabel: string;
  branchName: string | null;
  createdBy: string;
}

export interface CampaignInput {
  name: string;
  source: string;
  budget: string;
  startDate: string | null;
  endDate: string | null;
  note: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));

const fromRawChannel = (raw: any): MarketingChannel => ({
  source: raw.source || "",
  leads: num(raw.leads),
  deals: num(raw.deals),
  spend: num(raw.spend),
  conversion: num(raw.conversion),
  revenue: num(raw.revenue),
  costPerLead: numOrNull(raw.costPerLead),
  romi: numOrNull(raw.romi),
});

export const fromRawSummary = (raw: any): MarketingSummary => ({
  dateFrom: raw?.dateFrom ?? "",
  dateTo: raw?.dateTo ?? "",
  budget: num(raw?.budget),
  leads: num(raw?.leads),
  leadsPrev: num(raw?.leadsPrev),
  leadsChangePct: numOrNull(raw?.leadsChangePct),
  deals: num(raw?.deals),
  revenue: num(raw?.revenue),
  costPerLead: numOrNull(raw?.costPerLead),
  romi: numOrNull(raw?.romi),
  campaigns: num(raw?.campaigns),
  channels: Array.isArray(raw?.channels) ? raw.channels.map(fromRawChannel) : [],
});

const fromRawCampaign = (raw: any): Campaign => ({
  id: raw.id,
  name: raw.name ?? "",
  source: raw.source ?? "",
  startDate: raw.startDate ?? "",
  endDate: raw.endDate || null,
  budget: num(raw.budget),
  note: raw.note ?? "",
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  branchName: raw.branchName ?? null,
  createdBy: raw.createdBy ?? "",
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const marketing = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${MARKETING_API}${path}`, { ...options, headers: realtyHeaders(scope) });

export async function getMarketingSummary(period: MarketingPeriod, scope?: RealtyScope, signal?: AbortSignal): Promise<MarketingSummary> {
  return fromRawSummary(await marketing(scope, `/summary/?period=${period}`, { signal }));
}

/** Все кампании: срез по статусу — на клиенте. */
export async function getCampaigns(scope?: RealtyScope, signal?: AbortSignal): Promise<Campaign[]> {
  const raw = await marketing<unknown[]>(scope, "/campaigns/", { signal });
  return (raw ?? []).map(fromRawCampaign);
}

/** Тело кампании: пустые даты и заметку не шлём — бэк поставит сегодня / однодневную. */
export function campaignBody(input: CampaignInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: input.name.trim(), source: input.source.trim(), budget: input.budget };
  if (input.startDate) body.startDate = input.startDate;
  if (input.endDate) body.endDate = input.endDate;
  if (input.note.trim()) body.note = input.note.trim();
  return body;
}

export async function createCampaign(input: CampaignInput, scope?: RealtyScope): Promise<Campaign> {
  return fromRawCampaign(await marketing(scope, "/campaigns/", { method: "POST", body: campaignBody(input) }));
}

/** Правка: конец и заметку можно стереть — их шлём всегда. */
export async function updateCampaign(id: number, input: CampaignInput, scope?: RealtyScope): Promise<Campaign> {
  const body = { ...campaignBody(input), endDate: input.endDate, note: input.note.trim() };
  return fromRawCampaign(await marketing(scope, `/campaigns/${id}/`, { method: "PATCH", body }));
}

export async function deleteCampaign(id: number, scope?: RealtyScope): Promise<void> {
  await marketing(scope, `/campaigns/${id}/`, { method: "DELETE" });
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyMarketingKeys = {
  all: ["django", "realty", "marketing"] as const,
  summary: (scope: RealtyScope | undefined, period: MarketingPeriod) => [...realtyMarketingKeys.all, ...scopeKey(scope), "summary", period] as const,
  campaigns: (scope: RealtyScope | undefined) => [...realtyMarketingKeys.all, ...scopeKey(scope), "campaigns"] as const,
};
