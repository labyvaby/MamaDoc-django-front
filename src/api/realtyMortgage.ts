import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Ипотека и банки» застройщика (AIVIO) — заявки покупателей, решения банков,
 * калькулятор, банки-партнёры.
 *
 * Контракт — гайд бэка `frontend-sales.md` §8 (05.10.2026). Сводка, банк и
 * калькулятор приведены в гайде целиком; у заявки гайд даёт форму
 * «сокращено» — элементы `banks[]` разбираем защитно (`bankId`/`id`,
 * `name`/`bankName`), сверить с живым ответом.
 * - отправить в банки: банк не подходит по сроку/взносу → 400 с названием;
 *   фронт серит такие банки заранее тем же правилом (`bankFits`);
 * - выбрать банк у неодобренной заявки → 409 `INVALID_STATE`;
 * - смотреть — `realty.view`, менять — `realty.manage`.
 */

const REALTY_API = "/v2/realty";

export const MORTGAGE_STATUSES = ["draft", "sent", "approved", "signed", "rejected"] as const;
export type MortgageStatus = (typeof MORTGAGE_STATUSES)[number];

export const MORTGAGE_PROGRAMS = ["standard", "gik", "family"] as const;
export type MortgageProgram = (typeof MORTGAGE_PROGRAMS)[number];

export const BANK_DECISIONS = ["review", "approved", "rejected"] as const;
export type BankDecision = (typeof BANK_DECISIONS)[number];

export interface MortgageSummary {
  inWork: number;
  waitingBanks: number;
  approvedMonth: number;
  approvedMonthAmount: number;
  approvalRate: number;
  averageRate: number | null;
  decisions: number;
  funnel: Record<MortgageStatus, number>;
}

export interface Bank {
  id: number;
  code: string;
  name: string;
  mortgageRate: number;
  /** Лет. */
  maxTerm: number;
  /** Минимальный взнос, %. */
  minDown: number;
  approvalDays: number;
  partner: boolean;
  /** Госпрограмма (ГИК). */
  state: boolean;
  applications: number;
  approved: number;
  decided: number;
}

export interface ApplicationBank {
  bankId: number;
  name: string;
  status: string;
  statusLabel: string;
  rate: number | null;
  comment: string;
  /** Ежемесячный платёж по ставке банка; `null` — решения ещё нет. */
  monthly: number | null;
}

export interface ApplicationDoc {
  id: number;
  name: string;
  ok: boolean;
  fileUrl: string;
}

export interface MortgageApplication {
  id: number;
  number: string;
  buyer: string;
  phone: string;
  leadId: number | null;
  unitId: number | null;
  unitNumber: number | null;
  projectName: string;
  price: number;
  downPayment: number;
  downPct: number;
  amount: number;
  /** Лет. */
  term: number;
  income: number | null;
  status: MortgageStatus | string;
  statusLabel: string;
  program: string;
  programLabel: string;
  manager: string;
  banks: ApplicationBank[];
  docs: ApplicationDoc[];
  history: { at: string; by: string; text: string }[];
  /** id выбранного банка. */
  bankChosen: number | null;
  createdAt: string;
}

export interface CalculatorResult {
  down: number;
  amount: number;
  monthly: number;
  total: number;
  over: number;
  /** Долговая нагрузка, % дохода (0 — доход не указан). */
  load: number;
  banks: { bankId: number; name: string; rate: number; term: number; monthly: number; state: boolean }[];
}

export interface CalculatorParams {
  price: number;
  /** Взнос, %. */
  down: number;
  years: number;
  rate?: number | null;
  income?: number | null;
}

export interface ApplicationInput {
  buyer: string;
  years: number;
  income: number;
  price?: number | null;
  unitId?: number | null;
  /** Взнос, %. */
  down: number;
  phone?: string;
  leadId?: number | null;
  program: MortgageProgram;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));

const fromRawSummary = (raw: any): MortgageSummary => ({
  inWork: num(raw?.inWork),
  waitingBanks: num(raw?.waitingBanks),
  approvedMonth: num(raw?.approvedMonth),
  approvedMonthAmount: num(raw?.approvedMonthAmount),
  approvalRate: num(raw?.approvalRate),
  averageRate: numOrNull(raw?.averageRate),
  decisions: num(raw?.decisions),
  funnel: Object.fromEntries(MORTGAGE_STATUSES.map((key) => [key, num(raw?.funnel?.[key])])) as Record<MortgageStatus, number>,
});

const fromRawBank = (raw: any): Bank => ({
  id: raw.id,
  code: raw.code ?? "",
  name: raw.name ?? "",
  mortgageRate: num(raw.mortgageRate),
  maxTerm: num(raw.maxTerm),
  minDown: num(raw.minDown),
  approvalDays: num(raw.approvalDays),
  partner: Boolean(raw.partner),
  state: Boolean(raw.state),
  applications: num(raw.applications),
  approved: num(raw.approved),
  decided: num(raw.decided),
});

const fromRawApplicationBank = (raw: any): ApplicationBank => ({
  bankId: raw.bankId ?? raw.bank?.id ?? raw.id,
  name: raw.name ?? raw.bankName ?? raw.bank?.name ?? "",
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  rate: numOrNull(raw.rate),
  comment: raw.comment ?? "",
  monthly: numOrNull(raw.monthly),
});

export const fromRawApplication = (raw: any): MortgageApplication => ({
  id: raw.id,
  number: raw.number ?? "",
  buyer: raw.buyer ?? "",
  phone: raw.phone ?? "",
  leadId: raw.leadId ?? null,
  unitId: raw.unitId ?? null,
  unitNumber: raw.unitNumber ?? null,
  projectName: raw.projectName ?? "",
  price: num(raw.price),
  downPayment: num(raw.downPayment),
  downPct: num(raw.downPct),
  amount: num(raw.amount),
  term: num(raw.term),
  income: numOrNull(raw.income),
  status: raw.status ?? "draft",
  statusLabel: raw.statusLabel ?? "",
  program: raw.program ?? "",
  programLabel: raw.programLabel ?? "",
  manager: raw.manager ?? "",
  banks: Array.isArray(raw.banks) ? raw.banks.map(fromRawApplicationBank) : [],
  docs: Array.isArray(raw.docs) ? raw.docs.map((d: any) => ({ id: d.id, name: d.name ?? "", ok: Boolean(d.ok), fileUrl: d.fileUrl ?? "" })) : [],
  history: Array.isArray(raw.history) ? raw.history.map((h: any) => ({ at: h.at ?? "", by: h.by ?? "", text: h.text ?? "" })) : [],
  bankChosen: raw.bankChosen && typeof raw.bankChosen === "object" ? (raw.bankChosen.id ?? raw.bankChosen.bankId ?? null) : (raw.bankChosen ?? null),
  createdAt: raw.createdAt ?? "",
});

const fromRawCalculator = (raw: any): CalculatorResult => ({
  down: num(raw?.down),
  amount: num(raw?.amount),
  monthly: num(raw?.monthly),
  total: num(raw?.total),
  over: num(raw?.over),
  load: num(raw?.load),
  banks: Array.isArray(raw?.banks)
    ? raw.banks.map((b: any) => ({ bankId: b.bankId ?? b.id, name: b.name ?? "", rate: num(b.rate), term: num(b.term), monthly: num(b.monthly), state: Boolean(b.state) }))
    : [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const realty = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${REALTY_API}${path}`, { ...options, headers: realtyHeaders(scope) });

export async function getMortgageSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<MortgageSummary> {
  return fromRawSummary(await realty(scope, "/mortgage-applications/summary/", { signal }));
}

/** Все заявки одним списком: срезы по статусу и поиск — на клиенте, со счётчиками. */
export async function getMortgageApplications(scope?: RealtyScope, signal?: AbortSignal): Promise<MortgageApplication[]> {
  const raw = await realty<unknown[]>(scope, "/mortgage-applications/", { signal });
  return (raw ?? []).map(fromRawApplication);
}

export async function getMortgageApplication(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<MortgageApplication> {
  return fromRawApplication(await realty(scope, `/mortgage-applications/${id}/`, { signal }));
}

export async function getBanks(scope?: RealtyScope, signal?: AbortSignal): Promise<Bank[]> {
  const raw = await realty<unknown[]>(scope, "/banks/", { signal });
  return (raw ?? []).map(fromRawBank);
}

export async function calculateMortgage(params: CalculatorParams, scope?: RealtyScope, signal?: AbortSignal): Promise<CalculatorResult> {
  const query = new URLSearchParams({ price: String(params.price), down: String(params.down), years: String(params.years) });
  if (params.rate != null) query.set("rate", String(params.rate));
  if (params.income != null) query.set("income", String(params.income));
  return fromRawCalculator(await realty(scope, `/mortgage/calculator/?${query}`, { signal }));
}

export async function createMortgageApplication(input: ApplicationInput, scope?: RealtyScope): Promise<MortgageApplication> {
  const body: Record<string, unknown> = { buyer: input.buyer.trim(), years: input.years, income: input.income, down: input.down, program: input.program };
  if (input.unitId != null) body.unitId = input.unitId;
  else if (input.price != null) body.price = input.price;
  if (input.phone?.trim()) body.phone = input.phone.trim();
  if (input.leadId != null) body.leadId = input.leadId;
  return fromRawApplication(await realty(scope, "/mortgage-applications/", { method: "POST", body }));
}

/** Ответ команд — свежая заявка; если бэк ответил иначе — перечитываем. */
async function command(scope: RealtyScope | undefined, id: number, path: string, body?: object): Promise<MortgageApplication> {
  const raw = await realty<{ id?: number } | null>(scope, `/mortgage-applications/${id}/${path}`, { method: "POST", body: body ?? {} });
  return raw && raw.id === id ? fromRawApplication(raw) : getMortgageApplication(id, scope);
}

export const sendToBanks = (id: number, bankIds: number[], scope?: RealtyScope) => command(scope, id, "send/", { bankIds });

export const recordBankDecision = (id: number, bankId: number, decision: { status: BankDecision; rate?: number | null; comment?: string }, scope?: RealtyScope) =>
  command(scope, id, `banks/${bankId}/decision/`, decision);

export const addApplicationDocument = (id: number, doc: { name: string; fileUrl?: string }, scope?: RealtyScope) => command(scope, id, "documents/", doc);

export const chooseBank = (id: number, bankId: number, scope?: RealtyScope) => command(scope, id, "choose/", { bankId });

/**
 * Банк принимает заявку по сроку и взносу — то же правило, что у бэка
 * (`term ≤ maxTerm`, `downPct ≥ minDown`; `downPct` — из ответа, бэк
 * округляет до 0,1). Ноль в справочнике банка — ограничения нет.
 */
export function bankFits(bank: Pick<Bank, "maxTerm" | "minDown">, application: Pick<MortgageApplication, "term" | "downPct">): boolean {
  return (bank.maxTerm <= 0 || application.term <= bank.maxTerm) && application.downPct >= bank.minDown;
}

/** Поиск по заявкам: номер, покупатель, ЖК, номер квартиры. */
export function matchesApplication(app: MortgageApplication, search: string): boolean {
  const query = search.trim().toLocaleLowerCase("ru");
  if (!query) return true;
  return [app.number, app.buyer, app.projectName, app.unitNumber != null ? String(app.unitNumber) : "", app.manager].some((field) => field.toLocaleLowerCase("ru").includes(query));
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyMortgageKeys = {
  all: ["django", "realty", "mortgage"] as const,
  summary: (scope: RealtyScope | undefined) => [...realtyMortgageKeys.all, ...scopeKey(scope), "summary"] as const,
  list: (scope: RealtyScope | undefined) => [...realtyMortgageKeys.all, ...scopeKey(scope), "list"] as const,
  detail: (scope: RealtyScope | undefined, id: number) => [...realtyMortgageKeys.all, ...scopeKey(scope), "detail", id] as const,
  banks: (scope: RealtyScope | undefined) => [...realtyMortgageKeys.all, ...scopeKey(scope), "banks"] as const,
  calculator: (scope: RealtyScope | undefined, params: CalculatorParams) => [...realtyMortgageKeys.all, ...scopeKey(scope), "calculator", params] as const,
};
