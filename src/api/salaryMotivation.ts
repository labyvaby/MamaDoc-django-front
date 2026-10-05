import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Планы и мотивация» застройщика (AIVIO, группа «Персонал») — планы продаж
 * менеджеров, факт из CRM, премии по схеме бонусов и приказ.
 *
 * Контракт — гайд бэка `frontend-sales.md` §11 (05.10.2026).
 * - факт из CRM = подписанные договоры месяца по менеджеру (возвраты не
 *   считаются); `factSource: "manual"` — исправлен вручную, `fact: null`
 *   в PATCH возвращает факт из CRM;
 * - после утверждения планы и факт месяца менять нельзя → 400 с номером
 *   приказа; приказ сразу в ЭДО (`orderDocumentId`);
 * - смотреть — `salary.view`, менять — `salary.manage`.
 */

const SALARY_API = "/v2/salary";

export interface BonusTier {
  /** Выполнение плана от, %. */
  from: number;
  /** Премия, % от факта. */
  pct: number;
}

export interface BonusScheme {
  tiers: BonusTier[];
  teamBonus: number;
  /** Порог командного бонуса, % плана команды. */
  teamThreshold: number;
}

export interface MotivationRow {
  employeeId: number;
  employeeName: string;
  position: string;
  plan: number;
  fact: number;
  deals: number;
  pct: number;
  bonus: number;
  factSource: "crm" | "manual" | string;
}

export interface ApprovedOrder {
  number: string;
  total: number;
  orderDocumentId: number | null;
}

export interface MotivationSummary {
  month: string;
  monthLabel: string;
  months: string[];
  teamPlan: number;
  teamFact: number;
  teamPct: number;
  dealsTotal: number;
  avgDeal: number;
  bonusFund: number;
  teamBonusMet: boolean;
  approved: ApprovedOrder | null;
  scheme: BonusScheme;
  history: { month: string; plan: number; fact: number }[];
  rows: MotivationRow[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;

const fromRawScheme = (raw: any): BonusScheme => ({
  tiers: Array.isArray(raw?.tiers) ? raw.tiers.map((t: any) => ({ from: num(t.from), pct: num(t.pct) })).sort((a: BonusTier, b: BonusTier) => a.from - b.from) : [],
  teamBonus: num(raw?.teamBonus),
  teamThreshold: num(raw?.teamThreshold),
});

const fromRawApproved = (raw: any): ApprovedOrder | null => {
  if (!raw) return null;
  if (typeof raw === "string") return { number: raw, total: 0, orderDocumentId: null };
  return { number: raw.number ?? "", total: num(raw.total), orderDocumentId: raw.orderDocumentId ?? null };
};

export const fromRawMotivation = (raw: any): MotivationSummary => ({
  month: raw?.month ?? "",
  monthLabel: raw?.monthLabel ?? "",
  months: Array.isArray(raw?.months) ? raw.months : [],
  teamPlan: num(raw?.teamPlan),
  teamFact: num(raw?.teamFact),
  teamPct: num(raw?.teamPct),
  dealsTotal: num(raw?.dealsTotal),
  avgDeal: num(raw?.avgDeal),
  bonusFund: num(raw?.bonusFund),
  teamBonusMet: Boolean(raw?.teamBonusMet),
  approved: fromRawApproved(raw?.approved),
  scheme: fromRawScheme(raw?.scheme),
  history: Array.isArray(raw?.history) ? raw.history.map((h: any) => ({ month: h.month, plan: num(h.plan), fact: num(h.fact) })) : [],
  rows: Array.isArray(raw?.rows)
    ? raw.rows.map((r: any) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName ?? "",
        position: r.position ?? "",
        plan: num(r.plan),
        fact: num(r.fact),
        deals: num(r.deals),
        pct: num(r.pct),
        bonus: num(r.bonus),
        factSource: r.factSource ?? "crm",
      }))
    : [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const salary = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${SALARY_API}${path}`, { ...options, headers: realtyHeaders(scope) });

/** Сводка месяца `YYYY-MM`; без месяца — текущий. */
export async function getMotivation(month: string | null, scope?: RealtyScope, signal?: AbortSignal): Promise<MotivationSummary> {
  return fromRawMotivation(await salary(scope, `/motivation/${month ? `?month=${month}` : ""}`, { signal }));
}

export async function updateBonusScheme(scheme: BonusScheme, scope?: RealtyScope): Promise<BonusScheme> {
  return fromRawScheme(await salary(scope, "/bonus-scheme/", { method: "PATCH", body: scheme }));
}

/** «Установить планы» — ответ: свежая сводка месяца. */
export async function setPlans(month: string, plans: { employeeId: number; plan: number }[], scope?: RealtyScope): Promise<MotivationSummary> {
  return fromRawMotivation(await salary(scope, "/motivation/plans/", { method: "POST", body: { month, plans } }));
}

/** ✎ План и факт сотрудника. `fact: null` — вернуть факт из CRM. */
export async function updatePlanRow(employeeId: number, body: { month: string; plan?: number; fact?: number | null; deals?: number }, scope?: RealtyScope): Promise<void> {
  await salary(scope, `/motivation/plans/${employeeId}/`, { method: "PATCH", body });
}

export async function approveBonuses(month: string, scope?: RealtyScope): Promise<ApprovedOrder> {
  const raw = await salary<unknown>(scope, "/motivation/approve/", { method: "POST", body: { month } });
  return fromRawApproved(raw) ?? { number: "", total: 0, orderDocumentId: null };
}

/**
 * Премия по схеме: ступень — последняя, чей порог `from` ≤ выполнения.
 * Нужна для подсказки в форме схемы; сумму премий считает бэк.
 */
export function tierFor(scheme: Pick<BonusScheme, "tiers">, pct: number): BonusTier | null {
  let found: BonusTier | null = null;
  for (const tier of [...scheme.tiers].sort((a, b) => a.from - b.from)) if (pct >= tier.from) found = tier;
  return found;
}

/** Ступени схемы: пороги растут строго, проценты неотрицательны. */
export function schemeErrors(scheme: BonusScheme): string[] {
  const errors: string[] = [];
  const tiers = scheme.tiers;
  if (tiers.length === 0) errors.push("noTiers");
  if (tiers.some((t) => t.from < 0 || t.pct < 0)) errors.push("negative");
  if (tiers.some((t, i) => i > 0 && t.from <= tiers[i - 1].from)) errors.push("order");
  if (scheme.teamBonus < 0 || scheme.teamThreshold < 0) errors.push("negative");
  return [...new Set(errors)];
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const motivationKeys = {
  all: ["django", "salary", "motivation"] as const,
  month: (scope: RealtyScope | undefined, month: string | null) => [...motivationKeys.all, ...scopeKey(scope), month ?? "current"] as const,
};
