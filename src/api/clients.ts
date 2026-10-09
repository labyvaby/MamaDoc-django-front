import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

export type ClientType = "individual" | "company";

export interface DjangoClientStatus {
  id: number;
  code: string;
  name: string;
  color: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface DjangoClientGroupRef {
  id: number;
  name: string;
  color: string;
}

export interface DjangoClient {
  id: number;
  organizationId: number;
  clientType: ClientType;
  fullName: string;
  phone: string;
  email: string;
  photoUrl: string | null;
  dob: string | null;
  address: string;
  managerId: number | null;
  familyGroupId: number | null;
  note: string;
  balance: string;
  debt: string;
  legalName: string;
  inn: string;
  okpo: string;
  legalAddress: string;
  bankName: string;
  bankAccount: string;
  bankBik: string;
  groups: DjangoClientGroupRef[];
  joinedAt: string;
  updatedAt: string;
  customerStatus: DjangoClientStatus | null;
  isBlacklisted: boolean;
  blacklistReason: string;
}

export interface CreateClientPayload {
  organizationId: number;
  fullName: string;
  phone: string;
  email?: string;
  dob?: string | null;
  address?: string;
  clientType?: ClientType;
  customerStatusId?: number | null;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  note?: string;
  legalName?: string;
  inn?: string;
  okpo?: string;
  legalAddress?: string;
  bankName?: string;
  bankAccount?: string;
  bankBik?: string;
}

export type UpdateClientPayload = Omit<Partial<CreateClientPayload>, "organizationId" | "phone">;

export function getClients(
  organizationId: number,
  params: { query?: string; clientType?: string; birthMonth?: number | null } = {},
  signal?: AbortSignal,
): Promise<DjangoClient[]> {
  const search = new URLSearchParams({ organizationId: String(organizationId) });
  if (params.query?.trim()) search.set("q", params.query.trim());
  if (params.clientType) search.set("clientType", params.clientType);
  if (params.birthMonth) search.set("birthMonth", String(params.birthMonth));
  return apiRequest<DjangoClient[]>(`/clients/?${search.toString()}`, { signal });
}

/** Страница `GET /api/v2/clients/`: поиск идёт по всей организации. */
export interface ClientPage {
  items: DjangoClient[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function getClientPage(
  organizationId: number,
  params: { query?: string; birthMonth?: number | null; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ClientPage> {
  const search = new URLSearchParams({ organizationId: String(organizationId) });
  if (params.query?.trim()) search.set("q", params.query.trim());
  if (params.birthMonth) search.set("birthMonth", String(params.birthMonth));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  return apiRequest<ClientPage>(`/v2/clients/?${search.toString()}`, { signal });
}

export function getClient(id: number, organizationId: number, signal?: AbortSignal): Promise<DjangoClient> {
  return apiRequest<DjangoClient>(`/clients/${id}/?organizationId=${organizationId}`, { signal });
}

/** Текущий уровень лояльности клиента (проценты и суммы — строками). */
export interface ClientMetricsTier {
  id: number;
  name: string;
  discountPercent: string;
  cashbackPercent: string;
}

/** Следующий уровень и сколько до него осталось потратить. */
export interface ClientMetricsNextTier {
  name: string;
  threshold: string;
  remaining: string;
}

/**
 * Свёртка покупок клиента — `GET /api/v2/clients/<id>/metrics/`.
 *
 * `netTotal` — «потратил всего»: покупки в CRM + `importedPurchaseTotal`
 * (сумма, перенесённая из прежней учётной системы) − возвраты. По ней же
 * считается уровень лояльности. `tier`/`nextTier` — null, если у
 * организации нет активной программы (или модуль лояльности выключен).
 */
export interface ClientMetrics {
  clientId: number;
  purchaseCount: number;
  purchaseTotal: string;
  importedPurchaseTotal?: string;
  returnCount: number;
  returnTotal: string;
  netTotal: string;
  averageReceipt: string;
  updatedAt: string;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  tier?: ClientMetricsTier | null;
  nextTier?: ClientMetricsNextTier | null;
}

export function getClientMetrics(
  clientId: number,
  organizationId: number,
  signal?: AbortSignal,
): Promise<ClientMetrics> {
  return apiRequest<ClientMetrics>(`/v2/clients/${clientId}/metrics/`, {
    signal,
    headers: { "X-Organization-Id": String(organizationId) },
  });
}

// ── Долги клиента (docs/client-debts-contract.md) ─────────────────────────────

export type ClientDebtStatus = "open" | "paid" | "canceled";
/** Операция хронологии: деньги, возврат товара (долг уменьшен) или списание. */
export type ClientDebtPaymentKind = "repayment" | "return" | "write_off";
export type ClientDebtPaymentMethod = "cash" | "card" | "cashless";

/** Одна строка хронологии долга — кто, чем, когда и сколько. */
export interface ClientDebtPayment {
  id: number;
  kind: ClientDebtPaymentKind | string;
  /** `cash | card | cashless` у погашения; пусто у возврата и списания. */
  method: ClientDebtPaymentMethod | "" | string;
  amount: string;
  comment: string;
  reference: string;
  createdAt: string;
  branchId: number | null;
  branchName: string | null;
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  cashboxShiftId: number | null;
  createdById: number | null;
  createdByName: string | null;
  referenceType?: string;
  referenceId?: number | null;
}

/**
 * Долг клиента — документ со своим сроком. `paidAmount` — всё, что закрыло
 * часть долга (деньги и возвраты товара), `repaidAmount` — только деньги,
 * `outstanding` — что ещё должен (0 у погашенного и списанного).
 */
export interface ClientDebt {
  id: number;
  organizationId: number;
  clientId: number;
  amount: string;
  paidAmount: string;
  outstanding: string;
  status: ClientDebtStatus | string;
  referenceType: string;
  comment: string;
  createdAt: string;
  branchId: number | null;
  dueDate: string | null;
  referenceId: number | null;
  repaidAmount?: string;
  returnedAmount?: string;
  /** Открыт и срок возврата уже прошёл. */
  overdue?: boolean;
  branchName?: string | null;
  createdById?: number | null;
  createdByName?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  /** Короткий номер чека кассы, который открыл долг. */
  receiptNumber?: string | null;
  payments?: ClientDebtPayment[];
}

export interface ClientDebtSummary {
  clientId: number;
  outstanding: string;
  openCount?: number;
  overdueCount?: number;
}

export interface ClientDebtPage {
  items: ClientDebt[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** Открытый остаток по всем долгам фильтра, не только по странице. */
  outstandingTotal: string;
  overdueCount: number;
}

const orgHeaders = (organizationId: number) => ({ "X-Organization-Id": String(organizationId) });

/** GET /api/v2/clients/<id>/debts/ — долги клиента с хронологией, новые сверху. */
export function getClientDebts(
  clientId: number,
  organizationId: number,
  params: { status?: ClientDebtStatus } = {},
  signal?: AbortSignal,
): Promise<ClientDebt[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<ClientDebt[]>(`/v2/clients/${clientId}/debts/${qs ? `?${qs}` : ""}`, {
    signal,
    headers: orgHeaders(organizationId),
  });
}

export function getClientDebtSummary(
  clientId: number,
  organizationId: number,
  signal?: AbortSignal,
): Promise<ClientDebtSummary> {
  return apiRequest<ClientDebtSummary>(`/v2/clients/${clientId}/debts/summary/`, {
    signal,
    headers: orgHeaders(organizationId),
  });
}

/**
 * Принять погашение: сумма, способ (`cash` по умолчанию), терминал для карты и
 * QR, комментарий. Филиал — активный филиал сессии (`branchId` нужен только в
 * орг-режиме); деньги ложатся в открытую смену кассы филиала.
 */
export interface RepayClientDebtPayload {
  amount: string;
  method: ClientDebtPaymentMethod;
  cashlessMethodId?: number | null;
  branchId?: number | null;
  reference?: string;
  comment?: string;
}

export function repayClientDebt(
  clientId: number,
  debtId: number,
  organizationId: number,
  payload: RepayClientDebtPayload,
): Promise<ClientDebt> {
  return apiRequest<ClientDebt>(`/v2/clients/${clientId}/debts/${debtId}/repay/`, {
    method: "POST",
    body: payload,
    headers: orgHeaders(organizationId),
  });
}

/** Списать остаток долга — причина обязательна, это прощённые деньги. */
export function cancelClientDebt(
  clientId: number,
  debtId: number,
  organizationId: number,
  reason: string,
): Promise<ClientDebt> {
  return apiRequest<ClientDebt>(`/v2/clients/${clientId}/debts/${debtId}/cancel/`, {
    method: "POST",
    body: { reason },
    headers: orgHeaders(organizationId),
  });
}

/** GET /api/v2/clients/debts/ — реестр долгов организации страницами. */
export function getClientDebtPage(
  organizationId: number,
  params: {
    status?: ClientDebtStatus | "all";
    overdue?: boolean;
    search?: string;
    branchId?: number | null;
    limit?: number;
    offset?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ClientDebtPage> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.overdue) query.set("overdue", "1");
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.branchId != null) query.set("branchId", String(params.branchId));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<ClientDebtPage>(`/v2/clients/debts/${qs ? `?${qs}` : ""}`, {
    signal,
    headers: orgHeaders(organizationId),
  });
}

export function getClientStatuses(
  organizationId: number,
  signal?: AbortSignal,
): Promise<DjangoClientStatus[]> {
  return apiRequest<DjangoClientStatus[]>(
    `/clients/statuses/?organizationId=${organizationId}`,
    { signal },
  );
}

export function createClientStatus(
  organizationId: number,
  payload: { name: string; color?: string; sortOrder?: number },
): Promise<DjangoClientStatus> {
  return apiRequest<DjangoClientStatus>(
    `/clients/statuses/?organizationId=${organizationId}`,
    { method: "POST", body: payload },
  );
}

export function updateClientStatus(
  id: number,
  organizationId: number,
  payload: Partial<{ name: string; color: string; sortOrder: number; isActive: boolean }>,
): Promise<DjangoClientStatus> {
  return apiRequest<DjangoClientStatus>(
    `/clients/statuses/${id}/?organizationId=${organizationId}`,
    { method: "PATCH", body: payload },
  );
}

export function createClient(payload: CreateClientPayload): Promise<DjangoClient> {
  return apiRequest<DjangoClient>("/clients/", {
    method: "POST",
    body: payload,
  });
}

export function updateClient(
  id: number,
  organizationId: number,
  payload: UpdateClientPayload,
): Promise<DjangoClient> {
  return apiRequest<DjangoClient>(
    `/clients/${id}/?organizationId=${organizationId}`,
    { method: "PATCH", body: payload },
  );
}

export async function uploadClientPhoto(clientId: number, file: File): Promise<DjangoClient> {
  const form = new FormData();
  form.append("photo", await preparePhotoOrThrow(file));
  return withUploadErrors(() => apiRequest<DjangoClient>(`/clients/${clientId}/photo/`, {
    method: "PUT",
    formData: form,
  }));
}

export function deleteClientPhoto(clientId: number, organizationId: number): Promise<void> {
  return apiRequest<void>(`/clients/${clientId}/photo/?organizationId=${organizationId}`, {
    method: "DELETE",
  });
}
