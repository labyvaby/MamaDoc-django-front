import { apiRequest } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CashboxMethod = "cash" | "card" | "balance" | "mixed" | "insurance";
export type CashboxEntryType = "payment" | "refund" | "expense" | "sale" | "supply";

export interface CashboxFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  method?: CashboxMethod;
  patientId?: number;
  appointmentId?: number;
  createdById?: number;
  /** Required for superuser; regular users omit or pass null for "all orgs" */
  organizationId?: number | null;
}

export interface CashboxSummary {
  dateFrom: string;
  dateTo: string;
  organizationId: number | null;
  branchId: number | null;
  cashIncome: string;
  cardIncome: string;
  cashRefunds: string;
  cardRefunds: string;
  grossIncome: string;
  refundedTotal: string;
  netIncome: string;
  balancePayments: string;
  balanceRefunds: string;
  /** Покрытие страховыми — информационно, НЕ входит в gross/net income */
  insuranceIncome: string;
  insuranceRefunds: string;
  paymentCount: number;
  refundCount: number;
  // Expense fields (new)
  cashExpenses: string;
  cardExpenses: string;
  totalExpenses: string;
  /** netIncome + salesTotal − totalExpenses − supplyTotal */
  netCashFlow: string;
  expenseCount: number;
  // Продажи товаров (приход кассы)
  salesCashIncome: string;
  salesCardIncome: string;
  salesTotal: string;
  saleCount: number;
  // Закупки — приходы товара с суммой (расход кассы)
  supplyCashExpenses: string;
  supplyCardExpenses: string;
  supplyTotal: string;
  supplyCount: number;
}

export interface CashboxEntry {
  id: number;
  entryType: CashboxEntryType;
  method: CashboxMethod;
  amount: string;
  appointmentId: number | null;
  patientId: number | null;
  patientName: string | null;
  branchId: number | null;
  branchName: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  reason: string | null;
  note: string | null;
  // Expense-specific fields (present when entryType === "expense")
  categoryId: number | null;
  categoryName: string | null;
  expenseDate: string | null;
  description: string | null;
  isVoided: boolean | null;
  // Insurance-payment fields (present when method === "insurance")
  insurerName?: string | null;
  policyNumber?: string | null;
}

export interface CashboxEntriesResponse {
  results: CashboxEntry[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface CashboxEntriesFilters extends CashboxFilters {
  /** Один тип, список типов (объединённая лента) или "all" — все пять. */
  entryType: CashboxEntryType | CashboxEntryType[] | "all";
  page?: number;
  pageSize?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(filters: CashboxFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.date) q.set("date", filters.date);
  if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) q.set("dateTo", filters.dateTo);
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.method) q.set("method", filters.method);
  if (filters.patientId != null) q.set("patientId", String(filters.patientId));
  if (filters.appointmentId != null) q.set("appointmentId", String(filters.appointmentId));
  if (filters.createdById != null) q.set("createdById", String(filters.createdById));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return q;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getCashboxSummary(
  filters: CashboxFilters = {},
  signal?: AbortSignal,
): Promise<CashboxSummary> {
  const q = buildParams(filters);
  const qs = q.toString();
  return apiRequest<CashboxSummary>(`/cashbox/summary/${qs ? `?${qs}` : ""}`, { signal });
}

export function getCashboxEntries(
  filters: CashboxEntriesFilters,
  signal?: AbortSignal,
): Promise<CashboxEntriesResponse> {
  const q = buildParams(filters);
  q.set(
    "entryType",
    Array.isArray(filters.entryType) ? filters.entryType.join(",") : filters.entryType,
  );
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return apiRequest<CashboxEntriesResponse>(`/cashbox/entries/?${q.toString()}`, { signal });
}
