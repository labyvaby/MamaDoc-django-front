import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

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
  photoUrl: string | null;
  dob: string | null;
  address: string;
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
  dob?: string | null;
  address?: string;
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

export function getClientContacts(
  id: number,
  organizationId: number,
  signal?: AbortSignal,
): Promise<DjangoClientContact[]> {
  return apiRequest<DjangoClientContact[]>(
    `/clients/${id}/contacts/?organizationId=${organizationId}`,
    { signal },
  );
}

export type CreateClientContactPayload = Omit<DjangoClientContact, "id" | "clientId" | "isSelf">;

export function createClientContact(
  id: number,
  organizationId: number,
  payload: CreateClientContactPayload,
): Promise<DjangoClientContact> {
  return apiRequest<DjangoClientContact>(
    `/clients/${id}/contacts/?organizationId=${organizationId}`,
    { method: "POST", body: payload },
  );
}

export function updateClientContact(
  clientId: number,
  contactId: number,
  organizationId: number,
  payload: Partial<CreateClientContactPayload>,
): Promise<DjangoClientContact> {
  return apiRequest<DjangoClientContact>(
    `/clients/${clientId}/contacts/${contactId}/?organizationId=${organizationId}`,
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
