import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Аналитика застройщика (AIVIO, группа меню «АНАЛИТИКА»), гайд бэка
 * `frontend-dashboard-analytics.md` §5–6 (05.10.2026):
 * - «Аналитика CRM» — `GET /api/v2/realty/analytics/summary/` (право `realty.view`):
 *   период чипом (`period` = 1 | -1 | 7 | 30 | 90) или датами (`from`/`to`, `from > to` → 400),
 *   «Мои» — `managerId`; филиал и менеджер режут всё, включая `previous`;
 *   с 07.10 (`frontend-new-modules.md` §4) — план продаж: `plan`, `managers[].plan/planPct`,
 *   `projects[].plan/planPct`, расходы каналов в `sources[]`, `activity.whatsapp`
 *   (план — из «Планов и мотивации», факт — подписанные договоры);
 * - «Сводная аналитика» — `GET /api/v2/estate-dashboard/bi/` (право `estate_dashboard.view`):
 *   без права модуля его секция `null`, KPI-поле `null`, код модуля — в `denied[]`.
 * Деньги приходят строками-decimal — здесь переводятся в числа.
 */

export const ANALYTICS_PERIODS = [1, -1, 7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export type AnalyticsRange = { period: AnalyticsPeriod } | { from: string; to: string };

export interface AnalyticsTotals {
  dateFrom: string;
  dateTo: string;
  leads: number;
  shows: number;
  bookings: number;
  deals: number;
  revenue: number;
  /** Договоры / заявки, %. */
  conversion: number;
  tasksDone: number;
}

export interface AnalyticsStage {
  stage: string;
  name: string;
  current: number;
  value: number;
  entered: number;
  advanced: number;
  lost: number;
  /** entered − advanced − lost. */
  delta: number;
}

export interface AnalyticsManager {
  managerId: number;
  name: string;
  leads: number;
  deals: number;
  revenue: number;
  calls: number;
  /** План на период; `null` — у менеджера плана нет. */
  plan: number | null;
  planPct: number | null;
}

export interface AnalyticsProject {
  projectId: number;
  name: string;
  sold: number;
  reserved: number;
  revenue: number;
  plan: number | null;
  planPct: number | null;
}

export interface AnalyticsSource {
  source: string;
  leads: number;
  deals: number;
  conversion: number;
  revenue: number;
  /** Расход на канал; `null` — бесплатный канал («Органика»). */
  spend: number | null;
  costPerLead: number | null;
  costPerDeal: number | null;
}

/** Выполнение плана: за выбранный период (`pct`) и за текущий месяц (`month*`). */
export interface AnalyticsPlan {
  amount: number;
  fact: number;
  /** `null` — плана на период нет, плашку не показываем. */
  pct: number | null;
  /** YYYY-MM. */
  month: string;
  monthPlan: number | null;
  monthFact: number;
  monthDeals: number;
  monthPct: number | null;
}

export interface AnalyticsSlot {
  label: string;
  dateFrom: string;
  dateTo: string;
  leads: number;
  contracts: number;
}

export interface UnitTrend {
  date: string;
  week: string;
  sold: number;
  reserved: number;
  free: number;
}

export interface CrmAnalytics extends AnalyticsTotals {
  previous: AnalyticsTotals | null;
  stages: AnalyticsStage[];
  tasks: { overdue: number; done: number; open: number; leadsWithoutTask: number };
  activity: { calls: number; shows: number; bookings: number; contracts: number; proposals: number; whatsapp: number };
  plan: AnalyticsPlan | null;
  managers: AnalyticsManager[];
  projects: AnalyticsProject[];
  sources: AnalyticsSource[];
  dynamics: AnalyticsSlot[];
  unitTrends: UnitTrend[];
}

export interface BiKpis {
  revenue30: number | null;
  revenue30Count: number | null;
  soldUnits: number | null;
  soldAmount: number | null;
  reservedUnits: number | null;
  avgReadiness: number | null;
  projectsCount: number | null;
  marginPct: number | null;
  marginAmount: number | null;
  budgetUsedPct: number | null;
}

export interface BiProjectBase {
  projectId: number;
  projectName: string;
  short: string;
  color: string;
}

export interface BiSales extends BiProjectBase {
  sold: number;
  reserved: number;
  total: number;
  revenue: number;
}

export interface BiReadiness extends BiProjectBase {
  readiness: number;
  deadlineLabel: string;
}

export interface BiBudget extends BiProjectBase {
  plan: number;
  fact: number;
  pct: number;
}

export interface BiForecast {
  points: { date: string; balance: number }[];
  hasGap: boolean;
  gapDate: string | null;
  gapBalance: number | null;
  todayBalance: number;
  endBalance: number;
}

export interface BiSignal {
  code: string;
  title: string;
  value: string;
  tone: string;
  view: string;
  objectId: number | null;
}

export interface BiSummary {
  date: string;
  denied: string[];
  kpis: BiKpis;
  weeks: { start: string; end: string; inflow: number }[] | null;
  salesByProject: BiSales[] | null;
  readiness: BiReadiness[] | null;
  budgets: BiBudget[] | null;
  forecast: BiForecast | null;
  signals: BiSignal[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));
const list = <T>(raw: unknown, map: (item: any) => T): T[] => (Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object").map(map) : []);
/** Секция BI: `null` — нет права модуля (рисовать нечего), массив — данные. */
const section = <T>(raw: unknown, map: (item: any) => T): T[] | null => (raw == null ? null : list(raw, map));

const fromRawTotals = (raw: any): AnalyticsTotals => ({
  dateFrom: raw?.dateFrom ?? "",
  dateTo: raw?.dateTo ?? "",
  leads: num(raw?.leads),
  shows: num(raw?.shows),
  bookings: num(raw?.bookings),
  deals: num(raw?.deals),
  revenue: num(raw?.revenue),
  conversion: num(raw?.conversion),
  tasksDone: num(raw?.tasksDone ?? raw?.tasks?.done),
});

export function fromRawCrmAnalytics(raw: any): CrmAnalytics {
  return {
    ...fromRawTotals(raw),
    previous: raw?.previous ? fromRawTotals(raw.previous) : null,
    stages: list(raw?.stages, (s) => ({
      stage: s.stage ?? "",
      name: s.name ?? s.stage ?? "",
      current: num(s.current),
      value: num(s.value),
      entered: num(s.entered),
      advanced: num(s.advanced),
      lost: num(s.lost),
      delta: num(s.delta),
    })),
    tasks: { overdue: num(raw?.tasks?.overdue), done: num(raw?.tasks?.done), open: num(raw?.tasks?.open), leadsWithoutTask: num(raw?.tasks?.leadsWithoutTask) },
    activity: {
      calls: num(raw?.activity?.calls),
      shows: num(raw?.activity?.shows),
      bookings: num(raw?.activity?.bookings),
      contracts: num(raw?.activity?.contracts),
      proposals: num(raw?.activity?.proposals),
      whatsapp: num(raw?.activity?.whatsapp),
    },
    plan: raw?.plan
      ? {
          amount: num(raw.plan.amount),
          fact: num(raw.plan.fact),
          pct: numOrNull(raw.plan.pct),
          month: raw.plan.month ?? "",
          monthPlan: numOrNull(raw.plan.monthPlan),
          monthFact: num(raw.plan.monthFact),
          monthDeals: num(raw.plan.monthDeals),
          monthPct: numOrNull(raw.plan.monthPct),
        }
      : null,
    managers: list(raw?.managers, (m) => ({
      managerId: num(m.managerId),
      name: m.name ?? "",
      leads: num(m.leads),
      deals: num(m.deals),
      revenue: num(m.revenue),
      calls: num(m.calls),
      plan: numOrNull(m.plan),
      planPct: numOrNull(m.planPct),
    })),
    projects: list(raw?.projects, (p) => ({
      projectId: num(p.projectId),
      name: p.name ?? p.projectName ?? "",
      sold: num(p.sold),
      reserved: num(p.reserved),
      revenue: num(p.revenue),
      plan: numOrNull(p.plan),
      planPct: numOrNull(p.planPct),
    })),
    sources: list(raw?.sources, (s) => ({
      source: s.source || "—",
      leads: num(s.leads),
      deals: num(s.deals),
      conversion: num(s.conversion),
      revenue: num(s.revenue),
      spend: numOrNull(s.spend),
      costPerLead: numOrNull(s.costPerLead),
      costPerDeal: numOrNull(s.costPerDeal),
    })),
    dynamics: list(raw?.dynamics, (d) => ({ label: d.label ?? "", dateFrom: d.dateFrom ?? "", dateTo: d.dateTo ?? "", leads: num(d.leads), contracts: num(d.contracts) })),
    unitTrends: list(raw?.unitTrends, (u) => ({ date: u.date ?? "", week: String(u.week ?? ""), sold: num(u.sold), reserved: num(u.reserved), free: num(u.free) })),
  };
}

const fromRawProject = (p: any): BiProjectBase => ({ projectId: num(p.projectId), projectName: p.projectName ?? "", short: p.short || p.projectName || "", color: p.color || "" });

export function fromRawBi(raw: any): BiSummary {
  const k = raw?.kpis ?? {};
  const f = raw?.forecast;
  return {
    date: raw?.date ?? "",
    denied: Array.isArray(raw?.denied) ? raw.denied.map(String) : [],
    kpis: {
      revenue30: numOrNull(k.revenue30),
      revenue30Count: numOrNull(k.revenue30Count),
      soldUnits: numOrNull(k.soldUnits),
      soldAmount: numOrNull(k.soldAmount),
      reservedUnits: numOrNull(k.reservedUnits),
      avgReadiness: numOrNull(k.avgReadiness),
      projectsCount: numOrNull(k.projectsCount),
      marginPct: numOrNull(k.marginPct),
      marginAmount: numOrNull(k.marginAmount),
      budgetUsedPct: numOrNull(k.budgetUsedPct),
    },
    weeks: section(raw?.weeks, (w) => ({ start: w.start ?? "", end: w.end ?? "", inflow: num(w.inflow) })),
    salesByProject: section(raw?.salesByProject, (p) => ({ ...fromRawProject(p), sold: num(p.sold), reserved: num(p.reserved), total: num(p.total), revenue: num(p.revenue) })),
    readiness: section(raw?.readiness, (p) => ({ ...fromRawProject(p), readiness: num(p.readiness), deadlineLabel: p.deadlineLabel ?? "" })),
    budgets: section(raw?.budgets, (p) => ({ ...fromRawProject(p), plan: num(p.plan), fact: num(p.fact), pct: num(p.pct) })),
    forecast: f
      ? {
          points: list(f.points, (p) => ({ date: p.date ?? "", balance: num(p.balance) })),
          hasGap: Boolean(f.hasGap),
          gapDate: f.gapDate || null,
          gapBalance: numOrNull(f.gapBalance),
          todayBalance: num(f.todayBalance),
          endBalance: num(f.endBalance),
        }
      : null,
    signals: list(raw?.signals, (s) => ({ code: s.code ?? "", title: s.title ?? "", value: s.value == null ? "" : String(s.value), tone: s.tone ?? "", view: s.view ?? "", objectId: numOrNull(s.objectId) })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function analyticsQuery(range: AnalyticsRange, managerId: number | null): string {
  const p = new URLSearchParams();
  if ("period" in range) p.set("period", String(range.period));
  else {
    p.set("from", range.from);
    p.set("to", range.to);
  }
  if (managerId != null) p.set("managerId", String(managerId));
  return `?${p.toString()}`;
}

export async function getCrmAnalytics(range: AnalyticsRange, managerId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<CrmAnalytics> {
  return fromRawCrmAnalytics(await apiRequest(`/v2/realty/analytics/summary/${analyticsQuery(range, managerId)}`, { headers: realtyHeaders(scope), signal }));
}

export async function getBiSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<BiSummary> {
  return fromRawBi(await apiRequest("/v2/estate-dashboard/bi/", { headers: realtyHeaders(scope), signal }));
}

/** Изменение к прошлому периоду, %; прошлый ноль — без дельты (гайд §5). */
export function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** «Конверсия в показ», %: показы / заявки; нет заявок — `null`. */
export function showRate(totals: Pick<AnalyticsTotals, "shows" | "leads"> | null | undefined): number | null {
  if (!totals || totals.leads === 0) return null;
  return Math.round((totals.shows / totals.leads) * 100);
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const estateAnalyticsKeys = {
  all: ["django", "estate-analytics"] as const,
  crm: (scope: RealtyScope | undefined, range: AnalyticsRange, managerId: number | null) => [...estateAnalyticsKeys.all, ...scopeKey(scope), "crm", range, managerId] as const,
  bi: (scope: RealtyScope | undefined) => [...estateAnalyticsKeys.all, ...scopeKey(scope), "bi"] as const,
};
