import { apiRequest } from "./client";

export type ClientType = "individual" | "company";
export type ClientStatus = "new" | "active" | "inactive" | "no_offering";

export interface DjangoClientGroupRef {
  id: number;
  name: string;
  color: string;
}

export interface DjangoClientContact {
  id: number | null;
  clientId: number;
  fullName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  note: string;
  isSelf: boolean;
}

export interface DjangoClient {
  id: number;
  organizationId: number;
  clientType: ClientType;
  fullName: string;
  phone: string;
  email: string;
  dob: string | null;
  status: ClientStatus;
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
  primaryContact: DjangoClientContact | null;
  joinedAt: string;
  updatedAt: string;
}

export interface CreateClientPayload {
  organizationId: number;
  fullName: string;
  phone: string;
  email?: string;
  clientType?: ClientType;
  status?: ClientStatus;
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
  params: { query?: string; status?: string; clientType?: string } = {},
  signal?: AbortSignal,
): Promise<DjangoClient[]> {
  const search = new URLSearchParams({ organizationId: String(organizationId) });
  if (params.query?.trim()) search.set("q", params.query.trim());
  if (params.status) search.set("status", params.status);
  if (params.clientType) search.set("clientType", params.clientType);
  return apiRequest<DjangoClient[]>(`/clients/?${search.toString()}`, { signal });
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
