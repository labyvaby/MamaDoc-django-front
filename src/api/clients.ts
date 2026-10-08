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
