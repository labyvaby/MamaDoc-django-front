import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Финансы» застройщика (AIVIO): касса и банк, платёжный календарь, бюджеты
 * проектов, дебиторка / кредиторка — `/api/v2/treasury`.
 *
 * Контракт — гайд бэка `frontend-finance.md` (05.10.2026).
 * - смотреть — `treasury.view`, действия — `treasury.manage`, «Сверка» — `edo.manage`;
 * - филиал режет бэк по сессии: `branchId` в тела не кладём;
 * - деньги — строки `"38420000.00"` → числа здесь, даты — ISO `YYYY-MM-DD`;
 * - перевод между своими счетами — только `/transfers/`, не операцией.
 *
 * Открытые вопросы (форма не описана в гайде, разбираем защитно):
 * - элементы `meta.accountTypes` / `debtTypes` / `agingBuckets` — строка или `{id, name}`;
 * - карточка `GET /planned-payments/<id>/` — считаем, что это строка календаря
 *   плюс `originalDate` и `note`.
 */

const TREASURY_API = "/v2/treasury";

export const CASH_PERIODS = [7, 30, 45] as const;
export type CashPeriod = (typeof CASH_PERIODS)[number];
/** Горизонт прогноза и «Списка» календаря (гайд §3). */
export const FORECAST_DAYS = 45;

export type AccountType = "bank" | "cash" | "fx" | "escrow";
export type CashType = "in" | "out";
export type DebtDirection = "receivable" | "payable";
export type CalendarKind = "planned" | "billing" | "operation";

export interface MetaOption {
  id: string;
  name: string;
}

export interface TreasuryMeta {
  accountTypes: MetaOption[];
  articles: (MetaOption & { group: "income" | "expense" | string })[];
  sources: (MetaOption & { group: "in" | "out" | string })[];
  debtTypes: MetaOption[];
  agingBuckets: MetaOption[];
}

export interface CashSummary {
  period: number;
  dateFrom: string;
  dateTo: string;
  liquidBalance: number;
  escrowBalance: number;
  inflow: number;
  inflowCount: number;
  outflow: number;
  outflowCount: number;
  net: number;
  opsCount: number;
  accountsCount: number;
}

export interface TreasuryAccount {
  id: number;
  name: string;
  type: AccountType | string;
  typeLabel: string;
  bank: string;
  number: string;
  currency: string;
  /** Курс к сому; у сомовых счетов — 1. */
  rate: number;
  /** Остаток в валюте счёта (у валютного — доллары). */
  fx: number;
  /** Остаток в сомах. */
  balance: number;
  projectId: number | null;
  projectName: string | null;
  isActive: boolean;
  escrowRatePct: number | null;
  releaseCondition: string;
  periodOpsCount: number;
  /** Остаток на конец каждого дня (в валюте счёта), старые → новые. */
  series: number[];
}

export interface CashOperation {
  id: number;
  number: string;
  date: string;
  type: CashType | string;
  amount: number;
  article: string;
  articleName: string;
  counterparty: string;
  projectId: number | null;
  projectName: string | null;
  accountId: number | null;
  accountName: string;
  doc: string;
  note: string;
  status: "done" | "cancelled" | string;
  isTransfer: boolean;
  transferPairId: number | null;
  documentId: number | null;
  documentNumber: string;
  documentTitle: string;
  documentStatus: string;
  billingAccountId: number | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string;
}

export interface ArticleAmount {
  article: string;
  articleName: string;
  amount: number;
}

export interface CashByArticle {
  period: number;
  inflowTotal: number;
  outflowTotal: number;
  inflow: ArticleAmount[];
  outflow: ArticleAmount[];
  weeks: { start: string; end: string; in: number; out: number }[];
  byProject: { projectId: number | null; projectName: string; amount: number }[];
  companyOutflow: number;
}

export interface EscrowTerms {
  accountId: number;
  name: string;
  bank: string;
  number: string;
  balance: number;
  projectId: number | null;
  projectName: string | null;
  contractsCount: number;
  releaseCondition: string;
  plannedCommissioning: string | null;
  plannedCommissioningLabel: string;
  ratePct: number | null;
}

export interface CalendarItem {
  key: string;
  kind: CalendarKind | string;
  /** id в `/planned-payments/` (`kind = "planned"`); у рассрочки — `null`. */
  id: number | null;
  date: string;
  type: CashType | string;
  amount: number;
  title: string;
  counterparty: string;
  category: string;
  categoryName: string;
  source: string;
  sourceLabel: string;
  projectId: number | null;
  projectName: string | null;
  doc: string;
  status: string;
  done: boolean;
  moved: boolean;
  originalDate: string | null;
  billingAccountId: number | null;
  installmentNumber: number | null;
  documentId: number | null;
  /** «Остаток после» — только в `/payment-calendar/`. */
  runningBalance: number | null;
  note: string;
  /** Операция, которой исполнен плановый платёж (только в карточке `/planned-payments/<id>/`). */
  settledOperationId: number | null;
  settledOperationNumber: string;
}

export interface ForecastDay {
  date: string;
  /** `null` — прошлый день в сетке месяца. */
  balance: number | null;
  in: number;
  out: number;
  gap: boolean;
  items: CalendarItem[];
}

export interface CashForecast {
  startBalance: number;
  minBalance: number;
  minBalanceDate: string | null;
  hasGap: boolean;
  gapDate: string | null;
  gapBalance: number;
  next30: { inflow: number; inflowCount: number; outflow: number; outflowCount: number };
  days: ForecastDay[];
}

export interface PaymentCalendar {
  startBalance: number;
  days: number;
  totals: { inflow: number; inflowCount: number; outflow: number; outflowCount: number };
  items: CalendarItem[];
}

export interface CalendarMonth {
  month: string;
  days: ForecastDay[];
}

export interface BudgetLine {
  id: number;
  article: string;
  articleName: string;
  plan: number;
  committed: number;
  fact: number;
  remaining: number;
  progress: number;
  over: boolean;
  /** `overrun` — перерасход, `ahead` — освоение опережает срок. */
  risk: "overrun" | "ahead" | string | null;
}

export interface BudgetEconomics {
  revenuePlan: number;
  soldRevenue: number;
  reservedRevenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  areaTotal: number;
  /** `budget` — площадь задана в бюджете, `units` — сумма площадей квартир. */
  areaSource: "budget" | "units" | string;
  costPerSqm: number | null;
  avgSalePricePerSqm: number | null;
  contractedRevenuePct: number | null;
  breakevenPct: number | null;
}

export interface BudgetRevision {
  id: number;
  at: string;
  kind: string;
  kindLabel: string;
  article: string;
  note: string;
  byName: string;
  indexPct: number | null;
  changes: { article: string; field: string; before: number | null; after: number | null }[];
}

export interface ProjectBudget {
  projectId: number;
  projectName: string;
  revenuePlan: number;
  updated: string | null;
  plan: number;
  committed: number;
  fact: number;
  progress: number;
  committedPct: number;
  /** `null` — у ЖК нет дат стройки. */
  elapsedPct: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  risksCount: number;
  lines: BudgetLine[];
  economics: BudgetEconomics;
  history: BudgetRevision[];
}

export interface DebtSummary {
  direction: DebtDirection;
  total: number;
  overdueTotal: number;
  count: number;
  overdueCount: number;
  counterpartyCount: number;
  aging: { bucket: string; label: string; amount: number }[];
  byType: { type: string; typeLabel: string; amount: number }[];
}

export interface Debt {
  /** `billing` — взнос покупателя (id = счёт биллинга), `debt` — запись долга. */
  source: "billing" | "debt" | string;
  id: number;
  key: string;
  number: string;
  direction: DebtDirection | string;
  counterparty: string;
  phone: string;
  type: string;
  typeLabel: string;
  doc: string;
  documentId: number | null;
  amount: number;
  due: string;
  issued: string | null;
  /** > 0 — дней просрочки, ≤ 0 — дней до срока со знаком минус. */
  days: number;
  bucket: string;
  projectId: number | null;
  projectName: string | null;
  status: string;
  retention: boolean;
  disputed: boolean;
  paidAt: string | null;
  billingAccountId: number | null;
  lastReminder: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
/** Массив или DRF-страница `{results}` — гайды AIVIO уже расходились с продом по пагинации. */
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);

const fromRawOption = (raw: any): MetaOption =>
  typeof raw === "string" ? { id: raw, name: raw } : { id: str(raw?.id ?? raw?.code ?? raw?.key ?? raw?.bucket), name: str(raw?.name ?? raw?.label ?? raw?.id) };

export const fromRawMeta = (raw: any): TreasuryMeta => ({
  accountTypes: list(raw?.accountTypes).map(fromRawOption),
  articles: list(raw?.articles).map((a) => ({ ...fromRawOption(a), group: str(a?.group) })),
  sources: list(raw?.sources).map((s) => ({ ...fromRawOption(s), group: str(s?.group) })),
  debtTypes: list(raw?.debtTypes).map(fromRawOption),
  agingBuckets: list(raw?.agingBuckets).map(fromRawOption),
});

export const fromRawCashSummary = (raw: any): CashSummary => ({
  period: num(raw?.period),
  dateFrom: str(raw?.dateFrom),
  dateTo: str(raw?.dateTo),
  liquidBalance: num(raw?.liquidBalance),
  escrowBalance: num(raw?.escrowBalance),
  inflow: num(raw?.inflow),
  inflowCount: num(raw?.inflowCount),
  outflow: num(raw?.outflow),
  outflowCount: num(raw?.outflowCount),
  net: num(raw?.net),
  opsCount: num(raw?.opsCount),
  accountsCount: num(raw?.accountsCount),
});

export const fromRawAccount = (raw: any): TreasuryAccount => ({
  id: raw.id,
  name: str(raw.name),
  type: str(raw.type),
  typeLabel: str(raw.typeLabel),
  bank: str(raw.bank),
  number: str(raw.number),
  currency: str(raw.currency) || "KGS",
  rate: num(raw.rate) || 1,
  fx: num(raw.fx ?? raw.balance),
  balance: num(raw.balance),
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? null,
  isActive: raw.isActive !== false,
  escrowRatePct: numOrNull(raw.escrowRatePct),
  releaseCondition: str(raw.releaseCondition),
  periodOpsCount: num(raw.periodOpsCount),
  series: list(raw.series).map(num),
});

export const fromRawOperation = (raw: any): CashOperation => ({
  id: raw.id,
  number: str(raw.number),
  date: str(raw.date),
  type: str(raw.type),
  amount: num(raw.amount),
  article: str(raw.article),
  articleName: str(raw.articleName),
  counterparty: str(raw.counterparty),
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? null,
  accountId: raw.accountId ?? null,
  accountName: str(raw.accountName),
  doc: str(raw.doc),
  note: str(raw.note),
  status: str(raw.status) || "done",
  isTransfer: Boolean(raw.isTransfer),
  transferPairId: raw.transferPairId ?? null,
  documentId: raw.documentId ?? null,
  documentNumber: str(raw.documentNumber),
  documentTitle: str(raw.documentTitle),
  documentStatus: str(raw.documentStatus),
  billingAccountId: raw.billingAccountId ?? null,
  createdAt: str(raw.createdAt),
  cancelledAt: raw.cancelledAt ?? null,
  cancelReason: str(raw.cancelReason),
});

const fromRawArticle = (raw: any): ArticleAmount => ({ article: str(raw.article), articleName: str(raw.articleName || raw.article), amount: num(raw.amount) });

export const fromRawByArticle = (raw: any): CashByArticle => ({
  period: num(raw?.period),
  inflowTotal: num(raw?.inflowTotal),
  outflowTotal: num(raw?.outflowTotal),
  inflow: list(raw?.inflow).map(fromRawArticle),
  outflow: list(raw?.outflow).map(fromRawArticle),
  weeks: list(raw?.weeks).map((w) => ({ start: str(w.start), end: str(w.end), in: num(w.in), out: num(w.out) })),
  byProject: list(raw?.byProject).map((p) => ({ projectId: p.projectId ?? null, projectName: str(p.projectName), amount: num(p.amount) })),
  companyOutflow: num(raw?.companyOutflow),
});

export const fromRawEscrow = (raw: any): EscrowTerms => ({
  accountId: raw?.accountId,
  name: str(raw?.name),
  bank: str(raw?.bank),
  number: str(raw?.number),
  balance: num(raw?.balance),
  projectId: raw?.projectId ?? null,
  projectName: raw?.projectName ?? null,
  contractsCount: num(raw?.contractsCount),
  releaseCondition: str(raw?.releaseCondition),
  plannedCommissioning: raw?.plannedCommissioning ?? null,
  plannedCommissioningLabel: str(raw?.plannedCommissioningLabel),
  ratePct: numOrNull(raw?.ratePct),
});

export const fromRawItem = (raw: any): CalendarItem => ({
  key: str(raw.key) || `${raw.kind}-${raw.id ?? raw.billingAccountId}-${raw.date}-${raw.installmentNumber ?? ""}`,
  kind: str(raw.kind),
  id: raw.id ?? null,
  date: str(raw.date),
  type: str(raw.type),
  amount: num(raw.amount),
  title: str(raw.title),
  counterparty: str(raw.counterparty),
  category: str(raw.category),
  categoryName: str(raw.categoryName),
  source: str(raw.source),
  sourceLabel: str(raw.sourceLabel),
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? null,
  doc: str(raw.doc),
  status: str(raw.status),
  // В карточке `/planned-payments/<id>/` поля `done` нет — исполненность видна по операции оплаты.
  done: Boolean(raw.done) || raw.settledOperationId != null,
  moved: Boolean(raw.moved),
  originalDate: raw.originalDate ?? null,
  billingAccountId: raw.billingAccountId ?? null,
  installmentNumber: raw.installmentNumber ?? null,
  documentId: raw.documentId ?? null,
  runningBalance: numOrNull(raw.runningBalance),
  note: str(raw.note),
  settledOperationId: raw.settledOperationId ?? null,
  settledOperationNumber: str(raw.settledOperationNumber),
});

const fromRawDay = (raw: any): ForecastDay => ({
  date: str(raw.date),
  balance: numOrNull(raw.balance),
  in: num(raw.in),
  out: num(raw.out),
  gap: Boolean(raw.gap),
  items: list(raw.items).map(fromRawItem),
});

const fromRawTotals = (raw: any) => ({ inflow: num(raw?.inflow), inflowCount: num(raw?.inflowCount), outflow: num(raw?.outflow), outflowCount: num(raw?.outflowCount) });

export const fromRawForecast = (raw: any): CashForecast => ({
  startBalance: num(raw?.startBalance),
  minBalance: num(raw?.minBalance),
  minBalanceDate: raw?.minBalanceDate ?? null,
  hasGap: Boolean(raw?.hasGap),
  gapDate: raw?.gapDate ?? null,
  gapBalance: num(raw?.gapBalance),
  next30: fromRawTotals(raw?.next30),
  days: list(raw?.days).map(fromRawDay),
});

export const fromRawCalendar = (raw: any): PaymentCalendar => ({
  startBalance: num(raw?.startBalance),
  days: num(raw?.days),
  totals: fromRawTotals(raw?.totals),
  items: list(raw?.items).map(fromRawItem),
});

const fromRawLine = (raw: any): BudgetLine => ({
  id: raw.id,
  article: str(raw.article),
  articleName: str(raw.articleName || raw.article),
  plan: num(raw.plan),
  committed: num(raw.committed),
  fact: num(raw.fact),
  remaining: num(raw.remaining),
  progress: num(raw.progress),
  over: Boolean(raw.over),
  risk: raw.risk || null,
});

const fromRawRevision = (raw: any): BudgetRevision => ({
  id: raw.id,
  at: str(raw.at),
  kind: str(raw.kind),
  kindLabel: str(raw.kindLabel),
  article: str(raw.article),
  note: str(raw.note),
  byName: str(raw.byName),
  indexPct: numOrNull(raw.indexPct),
  changes: list(raw.changes).map((c) => ({ article: str(c.article), field: str(c.field), before: numOrNull(c.before), after: numOrNull(c.after) })),
});

export const fromRawBudget = (raw: any): ProjectBudget => {
  const e = raw?.economics ?? {};
  return {
    projectId: raw.projectId,
    projectName: str(raw.projectName),
    revenuePlan: num(raw.revenuePlan),
    updated: raw.updated ?? null,
    plan: num(raw.plan),
    committed: num(raw.committed),
    fact: num(raw.fact),
    progress: num(raw.progress),
    committedPct: num(raw.committedPct),
    elapsedPct: numOrNull(raw.elapsedPct),
    periodStart: raw.periodStart ?? null,
    periodEnd: raw.periodEnd ?? null,
    risksCount: num(raw.risksCount),
    lines: list(raw.lines).map(fromRawLine),
    economics: {
      revenuePlan: num(e.revenuePlan ?? raw.revenuePlan),
      soldRevenue: num(e.soldRevenue),
      reservedRevenue: num(e.reservedRevenue),
      cost: num(e.cost),
      margin: num(e.margin),
      marginPct: numOrNull(e.marginPct),
      areaTotal: num(e.areaTotal),
      areaSource: str(e.areaSource),
      costPerSqm: numOrNull(e.costPerSqm),
      avgSalePricePerSqm: numOrNull(e.avgSalePricePerSqm),
      contractedRevenuePct: numOrNull(e.contractedRevenuePct),
      breakevenPct: numOrNull(e.breakevenPct),
    },
    history: list(raw.history).map(fromRawRevision),
  };
};

export const fromRawDebtSummary = (raw: any): DebtSummary => ({
  direction: raw?.direction,
  total: num(raw?.total),
  overdueTotal: num(raw?.overdueTotal),
  count: num(raw?.count),
  overdueCount: num(raw?.overdueCount),
  counterpartyCount: num(raw?.counterpartyCount),
  aging: list(raw?.aging).map((a) => ({ bucket: str(a.bucket), label: str(a.label), amount: num(a.amount) })),
  byType: list(raw?.byType).map((b) => ({ type: str(b.type), typeLabel: str(b.typeLabel || b.type), amount: num(b.amount) })),
});

export const fromRawDebt = (raw: any): Debt => ({
  source: str(raw.source),
  id: raw.id,
  key: str(raw.key) || `${raw.source}-${raw.id}`,
  number: str(raw.number),
  direction: str(raw.direction),
  counterparty: str(raw.counterparty),
  phone: str(raw.phone),
  type: str(raw.type),
  typeLabel: str(raw.typeLabel),
  doc: str(raw.doc),
  documentId: raw.documentId ?? null,
  amount: num(raw.amount),
  due: str(raw.due),
  issued: raw.issued ?? null,
  days: num(raw.days),
  bucket: str(raw.bucket),
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? null,
  status: str(raw.status),
  retention: Boolean(raw.retention),
  disputed: Boolean(raw.disputed),
  paidAt: raw.paidAt ?? null,
  billingAccountId: raw.billingAccountId ?? null,
  lastReminder: raw.lastReminder ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

const treasury = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${TREASURY_API}${path}`, { ...options, headers: realtyHeaders(scope) });

/** Пустые значения в query не шлём. */
export function treasuryQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") qs.set(key, String(value));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

export async function getTreasuryMeta(scope?: RealtyScope, signal?: AbortSignal): Promise<TreasuryMeta> {
  return fromRawMeta(await treasury(scope, "/meta/", { signal }));
}

// Касса и банк

export interface OperationsParams {
  period: CashPeriod;
  accountId?: number | null;
  type?: CashType | null;
  q?: string;
  status?: "done" | "cancelled" | "all";
}

const operationsQuery = (params: OperationsParams) =>
  treasuryQuery({ period: params.period, accountId: params.accountId, type: params.type, q: params.q?.trim(), status: params.status && params.status !== "done" ? params.status : null });

export async function getCashSummary(period: CashPeriod, scope?: RealtyScope, signal?: AbortSignal): Promise<CashSummary> {
  return fromRawCashSummary(await treasury(scope, `/cash-operations/summary/?period=${period}`, { signal }));
}

/** Список без `limit`: «Показаны 80 из N» считаем на клиенте (гайд §2). */
export async function getCashOperations(params: OperationsParams, scope?: RealtyScope, signal?: AbortSignal): Promise<CashOperation[]> {
  return list(await treasury(scope, `/cash-operations/${operationsQuery(params)}`, { signal })).map(fromRawOperation);
}

export async function getCashOperation(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<CashOperation> {
  return fromRawOperation(await treasury(scope, `/cash-operations/${id}/`, { signal }));
}

export async function getCashByArticle(period: CashPeriod, scope?: RealtyScope, signal?: AbortSignal): Promise<CashByArticle> {
  return fromRawByArticle(await treasury(scope, `/cash-operations/by-article/?period=${period}`, { signal }));
}

export async function getTreasuryAccounts(days: number, scope?: RealtyScope, signal?: AbortSignal): Promise<TreasuryAccount[]> {
  return list(await treasury(scope, `/accounts/?days=${days}`, { signal })).map(fromRawAccount);
}

export async function getEscrowTerms(accountId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<EscrowTerms> {
  return fromRawEscrow(await treasury(scope, `/accounts/${accountId}/escrow/`, { signal }));
}

export interface OperationInput {
  type: CashType;
  accountId: number;
  amount: string;
  article: string;
  counterparty: string;
  projectId: number | null;
  doc: string;
  note: string;
  date: string | null;
}

/** Тело операции: пустые необязательные поля не шлём — бэк поставит сегодня и «Компания». */
export function operationBody(input: OperationInput): Record<string, unknown> {
  const body: Record<string, unknown> = { type: input.type, accountId: input.accountId, amount: input.amount, article: input.article, counterparty: input.counterparty.trim() };
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.doc.trim()) body.doc = input.doc.trim();
  if (input.note.trim()) body.note = input.note.trim();
  if (input.date) body.date = input.date;
  return body;
}

export async function createCashOperation(input: OperationInput, scope?: RealtyScope): Promise<CashOperation> {
  return fromRawOperation(await treasury(scope, "/cash-operations/", { method: "POST", body: operationBody(input) }));
}

export interface TransferInput {
  from: number;
  to: number;
  amount: string;
  /** Сумма зачисления — для перевода между валютами. */
  toAmount: string | null;
  note: string;
  date: string | null;
}

export function transferBody(input: TransferInput): Record<string, unknown> {
  const body: Record<string, unknown> = { from: input.from, to: input.to, amount: input.amount };
  if (input.toAmount) body.toAmount = input.toAmount;
  if (input.note.trim()) body.note = input.note.trim();
  if (input.date) body.date = input.date;
  return body;
}

export async function createTransfer(input: TransferInput, scope?: RealtyScope): Promise<{ out: CashOperation; in: CashOperation }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- разбор ответа
  const raw = await treasury<any>(scope, "/transfers/", { method: "POST", body: transferBody(input) });
  return { out: fromRawOperation(raw?.out ?? {}), in: fromRawOperation(raw?.in ?? {}) };
}

export async function cancelCashOperation(id: number, reason: string, scope?: RealtyScope): Promise<CashOperation> {
  return fromRawOperation(await treasury(scope, `/cash-operations/${id}/cancel/`, { method: "POST", body: reason.trim() ? { reason: reason.trim() } : {} }));
}

/** «⇩ Выписка» — CSV (`;`, UTF-8 с BOM) с теми же фильтрами, что журнал. */
export async function downloadStatement(params: OperationsParams, scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${TREASURY_API}/cash-operations/export/${operationsQuery(params)}`, { credentials: "include", headers: realtyHeaders(scope) });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить выписку (${response.status})`, response.status, null);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `statement-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Платёжный календарь

/** `items = false` — только флаги (для бейджа меню). */
export async function getCashForecast(days: number, scope?: RealtyScope, signal?: AbortSignal, items = true): Promise<CashForecast> {
  return fromRawForecast(await treasury(scope, `/cash-forecast/?days=${days}${items ? "" : "&items=0"}`, { signal }));
}

export async function getPaymentCalendar(days: number, scope?: RealtyScope, signal?: AbortSignal): Promise<PaymentCalendar> {
  return fromRawCalendar(await treasury(scope, `/payment-calendar/?days=${days}`, { signal }));
}

export async function getCalendarMonth(month: string, scope?: RealtyScope, signal?: AbortSignal): Promise<CalendarMonth> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- разбор ответа
  const raw = await treasury<any>(scope, `/payment-calendar/month/?month=${month}`, { signal });
  return { month: str(raw?.month) || month, days: list(raw?.days).map(fromRawDay) };
}

export async function getPlannedPayment(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<CalendarItem> {
  // В карточке нет `kind` (это всегда плановый платёж) — без него не нашлась бы кнопка «Оплатить».
  const raw = await treasury<Record<string, unknown>>(scope, `/planned-payments/${id}/`, { signal });
  return fromRawItem({ kind: "planned", ...raw });
}

/** «Оплатить» (выплата) / «Получено» (поступление); без счёта — основной расчётный. */
export async function settlePlannedPayment(item: Pick<CalendarItem, "id" | "type">, body: { accountId?: number | null; date?: string | null }, scope?: RealtyScope): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.accountId != null) payload.accountId = body.accountId;
  if (body.date) payload.date = body.date;
  await treasury(scope, `/planned-payments/${item.id}/${item.type === "in" ? "receive" : "pay"}/`, { method: "POST", body: payload });
}

export async function movePlannedPayment(id: number, to: { days: number } | { date: string }, scope?: RealtyScope): Promise<CalendarItem> {
  return fromRawItem(await treasury(scope, `/planned-payments/${id}/move/`, { method: "POST", body: to }));
}

/** Отмена оставляет платёж в истории, удаление — стирает (204). */
export async function cancelPlannedPayment(id: number, scope?: RealtyScope): Promise<void> {
  await treasury(scope, `/planned-payments/${id}/cancel/`, { method: "POST", body: {} });
}

export async function deletePlannedPayment(id: number, scope?: RealtyScope): Promise<void> {
  await treasury(scope, `/planned-payments/${id}/`, { method: "DELETE" });
}

/** «Перенести крупнейшую выплату»: `null` — нечего переносить. */
export async function fixCashGap(date: string, shiftDays: number, scope?: RealtyScope): Promise<CalendarItem | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- разбор ответа
  const raw = await treasury<any>(scope, "/payment-calendar/fix-gap/", { method: "POST", body: { date, shiftDays } });
  return raw?.moved ? fromRawItem(raw.moved) : null;
}

export interface TrancheInput {
  amount: string;
  counterparty: string;
  date: string | null;
  projectId: number | null;
  title: string;
}

export async function requestTranche(input: TrancheInput, scope?: RealtyScope): Promise<void> {
  const body: Record<string, unknown> = { amount: input.amount, counterparty: input.counterparty.trim() };
  if (input.date) body.date = input.date;
  else body.days = 5;
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.title.trim()) body.title = input.title.trim();
  await treasury(scope, "/payment-calendar/request-tranche/", { method: "POST", body });
}

export interface PlannedPaymentInput {
  type: CashType;
  date: string;
  title: string;
  counterparty: string;
  amount: string;
  category: string;
  projectId: number | null;
  doc: string;
}

export function plannedPaymentBody(input: PlannedPaymentInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: input.type,
    date: input.date,
    title: input.title.trim(),
    counterparty: input.counterparty.trim(),
    amount: input.amount,
    category: input.category,
    source: "manual",
  };
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.doc.trim()) body.doc = input.doc.trim();
  return body;
}

export async function createPlannedPayment(input: PlannedPaymentInput, scope?: RealtyScope): Promise<CalendarItem> {
  return fromRawItem(await treasury(scope, "/planned-payments/", { method: "POST", body: plannedPaymentBody(input) }));
}

// Бюджеты проектов

export async function getBudgets(scope?: RealtyScope, signal?: AbortSignal): Promise<ProjectBudget[]> {
  return list(await treasury(scope, "/budgets/", { signal })).map(fromRawBudget);
}

export async function getBudget(projectId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ProjectBudget> {
  return fromRawBudget(await treasury(scope, `/budgets/${projectId}/`, { signal }));
}

export type BudgetLinePatch = Partial<Record<"plan" | "committed" | "fact", string>> & { note?: string };

export async function updateBudgetLine(projectId: number, article: string, patch: BudgetLinePatch, scope?: RealtyScope): Promise<ProjectBudget> {
  return fromRawBudget(await treasury(scope, `/budgets/${projectId}/lines/${encodeURIComponent(article)}/`, { method: "PATCH", body: patch }));
}

/** Корректировка плана: материалы, отделка, инженерка × (1 + index/100). */
export async function reviseBudget(projectId: number, body: { index: number; revenuePlan?: string; note?: string }, scope?: RealtyScope): Promise<ProjectBudget> {
  return fromRawBudget(await treasury(scope, `/budgets/${projectId}/revise/`, { method: "POST", body }));
}

export async function updateBudget(projectId: number, body: { areaTotal?: number; revenuePlan?: string; note?: string }, scope?: RealtyScope): Promise<ProjectBudget> {
  return fromRawBudget(await treasury(scope, `/budgets/${projectId}/`, { method: "PATCH", body }));
}

// Дебиторка / кредиторка

export async function getDebtSummary(direction: DebtDirection, scope?: RealtyScope, signal?: AbortSignal): Promise<DebtSummary> {
  return fromRawDebtSummary(await treasury(scope, `/debts/summary/?direction=${direction}`, { signal }));
}

export async function getDebts(direction: DebtDirection, scope?: RealtyScope, signal?: AbortSignal): Promise<Debt[]> {
  return list(await treasury(scope, `/debts/?direction=${direction}`, { signal })).map(fromRawDebt);
}

/** `channel` — в query, не в теле (гайд §5). */
export async function remindReceivable(billingAccountId: number, channel: "whatsapp" | "sms" | "call", scope?: RealtyScope): Promise<{ lastReminder: string | null }> {
  const raw = await treasury<{ lastReminder?: string | null }>(scope, `/receivables/${billingAccountId}/remind/?channel=${channel}`, { method: "POST", body: {} });
  return { lastReminder: raw?.lastReminder ?? null };
}

export async function remindAllReceivables(scope?: RealtyScope): Promise<{ count: number }> {
  const raw = await treasury<{ count?: number }>(scope, "/receivables/remind-all/", { method: "POST", body: {} });
  return { count: num(raw?.count) };
}

export async function payDebt(id: number, body: { accountId?: number | null; date?: string | null }, scope?: RealtyScope): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (body.accountId != null) payload.accountId = body.accountId;
  if (body.date) payload.date = body.date;
  await treasury(scope, `/debts/${id}/pay/`, { method: "POST", body: payload });
}

export interface DebtInput {
  direction: DebtDirection;
  counterparty: string;
  type: string;
  amount: string;
  due: string;
  issued: string | null;
  doc: string;
  projectId: number | null;
  retention: boolean;
  disputed: boolean;
  /** Поставить оплату в платёжный календарь. */
  planPayment: boolean;
}

export function debtBody(input: DebtInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    direction: input.direction,
    counterparty: input.counterparty.trim(),
    type: input.type,
    amount: input.amount,
    due: input.due,
    retention: input.retention,
    disputed: input.disputed,
  };
  if (input.issued) body.issued = input.issued;
  if (input.doc.trim()) body.doc = input.doc.trim();
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.direction === "payable" && input.planPayment) body.planPayment = true;
  return body;
}

export async function createDebt(input: DebtInput, scope?: RealtyScope): Promise<Debt> {
  return fromRawDebt(await treasury(scope, "/debts/", { method: "POST", body: debtBody(input) }));
}

// ─── Хелперы экранов ────────────────────────────────────────────────────────

/** Кнопка строки календаря: выплата — «Оплатить», поступление — «Получено», рассрочка — ссылка на счёт. */
export function calendarAction(item: Pick<CalendarItem, "kind" | "type" | "done">): "pay" | "receive" | "billing" | null {
  if (item.kind === "billing") return "billing";
  if (item.kind !== "planned" || item.done) return null;
  return item.type === "in" ? "receive" : "pay";
}

export interface ForecastWeek {
  start: string;
  end: string;
  in: number;
  out: number;
  /** Остаток на конец недели. */
  balance: number | null;
  /** Минимальный остаток внутри недели. */
  min: number | null;
}

/** «По неделям» прогноза — по 7 дней от первого дня (гайд §3). */
export function forecastWeeks(days: ForecastDay[]): ForecastWeek[] {
  const weeks: ForecastWeek[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const balances = chunk.map((d) => d.balance).filter((b): b is number => b != null);
    weeks.push({
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      in: chunk.reduce((sum, d) => sum + d.in, 0),
      out: chunk.reduce((sum, d) => sum + d.out, 0),
      balance: balances.length ? balances[balances.length - 1] : null,
      min: balances.length ? Math.min(...balances) : null,
    });
  }
  return weeks;
}

/** «Структура выплат» — выплаты прогноза по `sourceLabel`, крупные сверху. */
export function payoutStructure(days: ForecastDay[]): { label: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const day of days)
    for (const item of day.items) {
      if (item.type !== "out") continue;
      const label = item.sourceLabel || item.categoryName || "—";
      sums.set(label, (sums.get(label) ?? 0) + item.amount);
    }
  return [...sums.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
}

/** Панель «Автоматизация взыскания»: срок через 0–3 дня, просрочка 1–14 и больше 30 дней. */
export function collectionCounters(debts: Pick<Debt, "days">[]): { soon: number; early: number; late: number } {
  return {
    soon: debts.filter((d) => d.days >= -3 && d.days <= 0).length,
    early: debts.filter((d) => d.days >= 1 && d.days <= 14).length,
    late: debts.filter((d) => d.days > 30).length,
  };
}

/** Поиск долгов по контрагенту, документу, объекту и телефону — на клиенте: бэк по тексту не ищет. */
export function matchesDebtSearch(debt: Pick<Debt, "counterparty" | "doc" | "number" | "projectName" | "typeLabel" | "phone">, search: string): boolean {
  const q = search.trim().toLocaleLowerCase("ru");
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return (
    [debt.counterparty, debt.doc, debt.number, debt.projectName ?? "", debt.typeLabel].some((field) => field.toLocaleLowerCase("ru").includes(q)) ||
    (digits.length >= 3 && debt.phone.replace(/\D/g, "").includes(digits))
  );
}

/** Сетка месяца с понедельника: недели по 7 ячеек, `null` — дни соседних месяцев. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** «2026-10» ± n месяцев. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const treasuryKeys = {
  all: ["django", "treasury"] as const,
  scoped: (scope: RealtyScope | undefined) => [...treasuryKeys.all, ...scopeKey(scope)] as const,
  meta: (scope: RealtyScope | undefined) => [...treasuryKeys.scoped(scope), "meta"] as const,
  cashSummary: (scope: RealtyScope | undefined, period: CashPeriod) => [...treasuryKeys.scoped(scope), "cash-summary", period] as const,
  operations: (scope: RealtyScope | undefined, params: OperationsParams) => [...treasuryKeys.scoped(scope), "operations", params] as const,
  operation: (scope: RealtyScope | undefined, id: number) => [...treasuryKeys.scoped(scope), "operation", id] as const,
  byArticle: (scope: RealtyScope | undefined, period: CashPeriod) => [...treasuryKeys.scoped(scope), "by-article", period] as const,
  accounts: (scope: RealtyScope | undefined, days: number) => [...treasuryKeys.scoped(scope), "accounts", days] as const,
  escrow: (scope: RealtyScope | undefined, id: number) => [...treasuryKeys.scoped(scope), "escrow", id] as const,
  forecast: (scope: RealtyScope | undefined, days: number, items: boolean) => [...treasuryKeys.scoped(scope), "forecast", days, items] as const,
  calendar: (scope: RealtyScope | undefined, days: number) => [...treasuryKeys.scoped(scope), "calendar", days] as const,
  month: (scope: RealtyScope | undefined, month: string) => [...treasuryKeys.scoped(scope), "month", month] as const,
  planned: (scope: RealtyScope | undefined, id: number) => [...treasuryKeys.scoped(scope), "planned", id] as const,
  budgets: (scope: RealtyScope | undefined) => [...treasuryKeys.scoped(scope), "budgets"] as const,
  debtSummary: (scope: RealtyScope | undefined, direction: DebtDirection) => [...treasuryKeys.scoped(scope), "debt-summary", direction] as const,
  debts: (scope: RealtyScope | undefined, direction: DebtDirection) => [...treasuryKeys.scoped(scope), "debts", direction] as const,
};
