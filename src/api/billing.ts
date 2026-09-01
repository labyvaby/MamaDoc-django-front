import { apiRequest } from "./client";

export type Money = string;
export type BillingPage<T> = { items: T[]; nextCursor: string | null };

export interface BillingDashboard {
  revenueTotal: Money;
  outstandingTotal: Money;
  activeSubscriptionsCount: number;
  debtorsCount: number;
  debtorsCriticalCount: number;
  dailyRevenue: Array<{ date: string; total: Money }>;
}

export interface BillingContract {
  id: number;
  organizationId: number;
  number: number | null;
  name: string;
  clientId: number;
  clientName: string;
  offeringId: number;
  offeringName: string;
  offeringKind: "service" | "course" | "rental" | string;
  status: "active" | "paused" | "ended" | string;
  startsOn: string;
  endsOn: string | null;
  priceOverride: Money | null;
  effectivePrice: Money;
  billingCycle: string;
  effectiveBillingCycle: string;
  billingDay: number | null;
  nextChargeOn: string | null;
  autoCharge: boolean;
  chargeLeadDays: number;
  paymentTermDays: number | null;
  graceDays: number;
  notifyOnCharge: boolean;
  notifyDaysBeforeDue: number;
  notifyOnOverdue: boolean;
  sessionsLeft: number | null;
  depositState: string;
  debt: Money;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCharge {
  id: number;
  organizationId: number;
  number: number;
  clientId: number;
  clientName: string;
  subscriptionId: number;
  offeringId: number;
  offeringName: string;
  purpose: string;
  periodKey: string;
  periodLabel: string;
  amount: Money;
  paidAmount: Money;
  dueDate: string;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled" | string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPayment {
  id: number;
  organizationId: number;
  clientId: number;
  clientName: string;
  chargeId: number | null;
  amount: Money;
  fee: Money;
  method: string;
  status: string;
  providerTxnId: string;
  refundOfId: number | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingDebtor {
  clientId: number;
  clientName: string;
  clientPhone: string;
  severity: "small" | "medium" | "critical" | string;
  daysOverdue: number;
  unpaidCount: number;
  amountOverdue: Money;
}

export interface BillingOffering {
  id: number;
  organizationId: number;
  kind: "service" | "course" | "rental" | string;
  name: string;
  category: string;
  priceAmount: Money;
  billingCycle: string;
  status: string;
  capacity: number | null;
  profile: Record<string, unknown>;
  clientsCount: number;
  revenueTotal: Money | null;
  occupancy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingClient {
  id: number;
  organizationId: number;
  clientType: "individual" | "company";
  fullName: string;
  phone: string;
  email: string;
  status: string;
  balance: Money;
  debt: Money;
  legalName: string;
  inn: string;
  note: string;
  joinedAt: string;
}

export interface ContractDefaults {
  organizationId: number;
  billingCycle: string;
  autoCharge: boolean;
  chargeLeadDays: number;
  paymentTermDays: number | null;
  graceDays: number;
  notifyOnCharge: boolean;
  notifyDaysBeforeDue: number;
  notifyOnOverdue: boolean;
  updatedAt: string;
}

export interface PayLinkResult {
  token: string;
  url: string;
  expiresAt: string;
  providerPayUrl: string;
}

type Scope = { organizationId?: number };
type ListFilters = Scope & { q?: string; status?: string; cursor?: string; pageSize?: number };

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function moneyHeaders(): HeadersInit {
  return { "Idempotency-Key": crypto.randomUUID() };
}

export const billingApi = {
  dashboard: (params: Scope & { dateFrom: string; dateTo: string }) =>
    apiRequest<BillingDashboard>(`/v2/billing/dashboard/${query(params)}`),

  contracts: (params: ListFilters & { offeringKind?: string }) =>
    apiRequest<BillingPage<BillingContract>>(`/v2/billing/contracts/${query(params)}`),
  createContract: (body: Record<string, unknown>) =>
    apiRequest<BillingContract>("/v2/billing/contracts/", { method: "POST", headers: moneyHeaders(), body }),
  contractAction: (id: number, action: "pause" | "resume", scope: Scope) =>
    apiRequest<BillingContract>(`/v2/billing/contracts/${id}/${action}/${query(scope)}`, { method: "POST" }),
  endContract: (id: number, endsOn: string, scope: Scope) =>
    apiRequest<BillingContract>(`/v2/billing/contracts/${id}/end/${query(scope)}`, { method: "POST", body: { endsOn } }),

  charges: (params: ListFilters & { clientId?: number; contractId?: number; offeringId?: number }) =>
    apiRequest<BillingPage<BillingCharge>>(`/v2/billing/charges/${query(params)}`),
  createCharge: (body: Record<string, unknown>) =>
    apiRequest<BillingCharge>("/v2/billing/charges/", { method: "POST", headers: moneyHeaders(), body }),
  chargeAction: (id: number, action: "issue" | "cancel", scope: Scope) =>
    apiRequest<BillingCharge>(`/v2/billing/charges/${id}/${action}/${query(scope)}`, { method: "POST" }),
  createPayLink: (chargeId: number, organizationId?: number) =>
    apiRequest<PayLinkResult>("/v2/billing/pay-links/", {
      method: "POST",
      body: { chargeId, ...(organizationId ? { organizationId } : {}) },
    }),

  payments: (params: ListFilters & { clientId?: number; method?: string }) =>
    apiRequest<BillingPage<BillingPayment>>(`/v2/billing/payments/${query(params)}`),
  createPayment: (body: Record<string, unknown>) =>
    apiRequest<BillingPayment>("/v2/billing/payments/", { method: "POST", headers: moneyHeaders(), body }),
  refundPayment: (id: number, amount: string | undefined, scope: Scope) =>
    apiRequest<BillingPayment>(`/v2/billing/payments/${id}/refund/${query(scope)}`, {
      method: "POST",
      headers: moneyHeaders(),
      body: amount ? { amount } : {},
    }),

  debtors: (scope: Scope) => apiRequest<BillingDebtor[]>(`/v2/billing/debtors/${query(scope)}`),
  remindDebtors: (clientIds: number[], organizationId?: number) =>
    apiRequest<{ sentCount: number }>("/v2/billing/debtors/remind/", {
      method: "POST",
      body: { clientIds, ...(organizationId ? { organizationId } : {}) },
    }),

  offerings: (params: Scope & { q?: string; kind?: string; status?: string }) =>
    apiRequest<BillingOffering[]>(`/offerings/${query(params)}`),
  createOffering: (body: Record<string, unknown>) =>
    apiRequest<BillingOffering>("/offerings/", { method: "POST", body }),
  archiveOffering: (id: number, scope: Scope) =>
    apiRequest<void>(`/offerings/${id}/${query(scope)}`, { method: "DELETE" }),

  clients: (params: Scope & { q?: string }) =>
    apiRequest<BillingClient[]>(`/clients/${query(params)}`),
  createClient: (body: Record<string, unknown>) =>
    apiRequest<BillingClient>("/clients/", { method: "POST", body }),
  updateClient: (id: number, body: Record<string, unknown>, scope: Scope) =>
    apiRequest<BillingClient>(`/clients/${id}/${query(scope)}`, { method: "PATCH", body }),

  contractDefaults: (scope: Scope) =>
    apiRequest<ContractDefaults>(`/v2/billing/contract-defaults/${query(scope)}`),
  updateContractDefaults: (body: Partial<ContractDefaults>, scope: Scope) =>
    apiRequest<ContractDefaults>(`/v2/billing/contract-defaults/${query(scope)}`, { method: "PATCH", body }),
};
