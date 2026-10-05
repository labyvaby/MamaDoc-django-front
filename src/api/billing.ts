import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Финансы → Биллинг» застройщика (AIVIO): счета рассрочки покупателей
 * квартир — график взносов, оплаты, напоминания, ссылки на оплату, автосбор.
 *
 * Контракт — гайд бэка `frontend-billing.md` и справочник
 * `aivio-api-reference.md` (раздел «Биллинг»), 04.10.2026; бэк проверен на
 * test2. Базовый путь `/api/v2/realty/billing-accounts/`.
 * - организация — заголовком `X-Organization-Id`, филиал режет бэк по сессии;
 * - смотреть: `treasury.view` или `realty.view`; действия: `treasury.manage`
 *   или `realty.manage` (бэк пускает по любому из двух);
 * - деньги приходят строками-decimal (`"546000.00"`), здесь → числа;
 * - списки — плоские массивы, без пагинации;
 * - счёт создаётся сам при продаже квартиры в рассрочку
 *   (`sell` с `payment: "installment"`), «Новая рассрочка» — для ручных.
 */

const BILLING_API = "/v2/realty/billing-accounts";

type Decimal = string;

// ─── Модель ────────────────────────────────────────────────────────────────

export type BillingFilter = "all" | "overdue" | "due" | "upcoming" | "completed";
export const BILLING_FILTERS: readonly BillingFilter[] = ["all", "overdue", "due", "upcoming", "completed"];

/** Состояние счёта: просрочен / сегодня / по графику / выплачен. */
export type BillingState = Exclude<BillingFilter, "all">;
/** Состояние строки графика; частичная оплата — `paid > 0 && balance > 0`. */
export type ScheduleState = "paid" | "overdue" | "due" | "upcoming";

export type PaymentMethod = "cash" | "card" | "transfer" | "qr";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "card", "transfer", "qr"];
export type PaymentKind = "installment" | "down_payment";
export type ReminderChannel = "whatsapp" | "sms" | "call";
export const REMINDER_CHANNELS: readonly ReminderChannel[] = ["whatsapp", "sms", "call"];

export interface BillingSummary {
  /** Ожидается в этом месяце, сом. */
  expected: number;
  received: number;
  collectedPct: number;
  overdue: number;
  overdueCount: number;
  active: number;
  activeAutopay: number;
  remindersToday: number;
  counts: Record<BillingFilter, number>;
  /** Ближайшие поступления для календаря справа. */
  calendar: { accountId: number; buyer: string; unitNumber: number; dueDate: string; balance: number }[];
}

export interface ScheduleRow {
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  state: ScheduleState;
}

export interface BillingPayment {
  id: number;
  number: string;
  date: string;
  amount: number;
  method: string;
  methodLabel: string;
  note: string;
  kind: PaymentKind;
}

export interface BillingReminder {
  id: number;
  channel: string;
  sentAt: string;
  sentBy: string | null;
  note: string;
}

export interface AutopayAttempt {
  id: number;
  accountId: number;
  attemptedAt: string;
  amount: number;
  result: string;
  resultLabel: string;
  message: string;
}

export interface BillingAccount {
  id: number;
  number: string;
  buyer: string;
  phone: string;
  projectId: number;
  project: string;
  unitId: number;
  unitNumber: number;
  contract: string;
  /** Срок рассрочки, месяцев. */
  term: number;
  startDate: string;
  total: number;
  downPayment: number;
  monthly: number;
  paidAmount: number;
  paidCount: number;
  progress: number;
  outstanding: number;
  overdue: number;
  state: BillingState;
  stateLabel: string;
  next: ScheduleRow | null;
  lastReminder: string | null;
  manager: string | null;
  autopay: boolean;
  /** Онлайн-оплата настроена у организации — можно слать ссылку на оплату. */
  payLinkEnabled: boolean;
  downPaymentPaid: number;
  downPaymentDue: number;
  schedule: ScheduleRow[];
  payments: BillingPayment[];
  reminders: BillingReminder[];
  autopayAttempts: AutopayAttempt[];
}

// ─── Переходники ───────────────────────────────────────────────────────────

const money = (value: Decimal | number | null | undefined) => Number(value ?? 0) || 0;

interface RawScheduleRow {
  number: number;
  dueDate: string;
  amount: Decimal;
  paid: Decimal;
  balance: Decimal;
  state: ScheduleState;
}

interface RawAccount {
  id: number;
  number: string;
  buyer: string;
  phone: string;
  projectId: number;
  project: string;
  unitId: number;
  unitNumber: number;
  contract: string;
  term: number;
  startDate: string;
  total: Decimal;
  downPayment: Decimal;
  monthly: Decimal;
  paidAmount: Decimal;
  paidCount: number;
  progress: number;
  outstanding: Decimal;
  overdue: Decimal;
  state: BillingState;
  stateLabel: string;
  next: RawScheduleRow | null;
  lastReminder: string | null;
  manager: string | null;
  autopay: boolean;
  payLinkEnabled?: boolean;
  downPaymentPaid?: Decimal;
  downPaymentDue?: Decimal;
  schedule?: RawScheduleRow[];
  payments?: (Omit<BillingPayment, "amount" | "kind"> & { amount: Decimal; kind?: PaymentKind })[];
  reminders?: BillingReminder[];
  autopayAttempts?: (Omit<AutopayAttempt, "amount"> & { amount: Decimal })[];
}

interface RawSummary {
  expected: Decimal;
  received: Decimal;
  collectedPct: number;
  overdue: Decimal;
  overdueCount: number;
  active: number;
  activeAutopay: number;
  remindersToday: number;
  counts: Record<BillingFilter, number>;
  calendar: { accountId: number; buyer: string; unitNumber: number; dueDate: string; balance: Decimal }[];
}

const fromRawRow = (row: RawScheduleRow): ScheduleRow => ({
  ...row,
  amount: money(row.amount),
  paid: money(row.paid),
  balance: money(row.balance),
});

export function fromRawAccount(raw: RawAccount): BillingAccount {
  return {
    ...raw,
    total: money(raw.total),
    downPayment: money(raw.downPayment),
    monthly: money(raw.monthly),
    paidAmount: money(raw.paidAmount),
    outstanding: money(raw.outstanding),
    overdue: money(raw.overdue),
    next: raw.next ? fromRawRow(raw.next) : null,
    payLinkEnabled: raw.payLinkEnabled ?? false,
    downPaymentPaid: money(raw.downPaymentPaid),
    downPaymentDue: money(raw.downPaymentDue),
    schedule: (raw.schedule ?? []).map(fromRawRow),
    payments: (raw.payments ?? []).map((p) => ({ ...p, amount: money(p.amount), kind: p.kind ?? "installment" })),
    reminders: raw.reminders ?? [],
    autopayAttempts: (raw.autopayAttempts ?? []).map((a) => ({ ...a, amount: money(a.amount) })),
  };
}

export function fromRawSummary(raw: RawSummary): BillingSummary {
  return {
    ...raw,
    expected: money(raw.expected),
    received: money(raw.received),
    overdue: money(raw.overdue),
    counts: { ...{ all: 0, overdue: 0, due: 0, upcoming: 0, completed: 0 }, ...raw.counts },
    calendar: raw.calendar.map((item) => ({ ...item, balance: money(item.balance) })),
  };
}

/** Строка графика оплачена частично: внесено, но остаток ещё есть. */
export const isPartiallyPaid = (row: ScheduleRow) => row.paid > 0 && row.balance > 0;

// ─── Запросы ───────────────────────────────────────────────────────────────

function billing<T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}): Promise<T> {
  return apiRequest<T>(`${BILLING_API}${path}`, { ...options, headers: realtyHeaders(scope) });
}

export interface BillingListParams {
  filter: BillingFilter;
  search: string;
  projectId?: number | null;
}

function listQuery({ filter, search, projectId }: BillingListParams): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (search.trim()) params.set("search", search.trim());
  if (projectId != null) params.set("projectId", String(projectId));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getBillingSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<BillingSummary> {
  return fromRawSummary(await billing<RawSummary>(scope, "/summary/", { signal }));
}

export async function getBillingAccounts(params: BillingListParams, scope?: RealtyScope, signal?: AbortSignal): Promise<BillingAccount[]> {
  const raw = await billing<RawAccount[]>(scope, `/${listQuery(params)}`, { signal });
  return raw.map(fromRawAccount);
}

export async function getBillingAccount(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<BillingAccount> {
  return fromRawAccount(await billing<RawAccount>(scope, `/${id}/`, { signal }));
}

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  /** YYYY-MM-DD; не задана — сегодня по Бишкеку (решает бэк). */
  date: string | null;
  note: string;
  kind: PaymentKind;
}

export async function acceptBillingPayment(id: number, input: PaymentInput, scope?: RealtyScope): Promise<void> {
  await billing<unknown>(scope, `/${id}/payments/`, { method: "POST", body: { ...input, amount: input.amount.toFixed(2) } });
}

export async function remindBillingAccount(id: number, channel: ReminderChannel, note: string, scope?: RealtyScope): Promise<void> {
  await billing<unknown>(scope, `/${id}/remind/`, { method: "POST", body: { channel, note } });
}

/** Напоминание всем — только просроченным и «сегодня» (выбирает бэк). */
export async function remindAllBilling(scope?: RealtyScope): Promise<{ count: number; accountIds: number[] }> {
  return billing(scope, "/remind/", { method: "POST", body: {} });
}

export interface PayLink {
  url: string;
  amount: number;
  expiresAt: string;
  sentVia: string | null;
}

export async function createBillingPayLink(id: number, channel: "whatsapp" | "sms" | null, scope?: RealtyScope): Promise<PayLink> {
  const raw = await billing<Omit<PayLink, "amount"> & { amount: Decimal }>(scope, `/${id}/pay-link/`, { method: "POST", body: { channel } });
  return { ...raw, amount: money(raw.amount) };
}

/**
 * Автосбор: денег с карты не списывает (эквайринга с картой нет) — бэк шлёт
 * покупателям с долгом ссылку на оплату.
 */
export async function runBillingAutopay(scope?: RealtyScope): Promise<{ count: number; collected: number }> {
  const raw = await billing<{ count: number; collected: Decimal }>(scope, "/run-autopay/", { method: "POST", body: {} });
  return { count: raw.count, collected: money(raw.collected) };
}

export async function setBillingAutopay(id: number, autopay: boolean, scope?: RealtyScope): Promise<BillingAccount> {
  return fromRawAccount(await billing<RawAccount>(scope, `/${id}/`, { method: "PATCH", body: { autopay } }));
}

export interface NewInstallmentInput {
  buyer: string;
  phone: string;
  total: number;
  downPayment: number;
  term: number;
  startDate: string;
  unitId: number;
  contract: string;
  autopay: boolean;
}

export async function createBillingAccount(input: NewInstallmentInput, scope?: RealtyScope): Promise<BillingAccount> {
  const body = { ...input, total: input.total.toFixed(2), downPayment: input.downPayment.toFixed(2) };
  return fromRawAccount(await billing<RawAccount>(scope, "/", { method: "POST", body }));
}

/**
 * «⇩ Реестр» — CSV по тем же фильтрам, что таблица. Файл отдаётся только с
 * сессией и заголовком организации, поэтому качаем fetch-ем в blob, а не ссылкой.
 */
export async function downloadBillingRegistry(params: BillingListParams, scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${BILLING_API}/export/${listQuery(params)}`, {
    credentials: "include",
    headers: realtyHeaders(scope),
  });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить реестр (${response.status})`, response.status, null);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billing-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ключи: организация и филиал — в ключе; команды инвалидируют всё дерево. */
const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const billingKeys = {
  all: ["django", "billing"] as const,
  summary: (scope: RealtyScope | undefined) => [...billingKeys.all, ...scopeKey(scope), "summary"] as const,
  list: (scope: RealtyScope | undefined, params: BillingListParams) => [...billingKeys.all, ...scopeKey(scope), "list", params] as const,
  account: (scope: RealtyScope | undefined, id: number) => [...billingKeys.all, ...scopeKey(scope), "account", id] as const,
};
