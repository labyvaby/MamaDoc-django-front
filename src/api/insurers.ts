import { apiRequest } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DjangoInsurer {
  id: number;
  organizationId: number;
  name: string;
  contractNumber: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InsurerCreatePayload {
  name: string;
  contractNumber?: string;
  phone?: string;
  organizationId?: number | null;
}

export interface InsurerUpdatePayload {
  name?: string;
  contractNumber?: string;
  phone?: string;
  isActive?: boolean;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getInsurers(
  signal?: AbortSignal,
  options?: { includeInactive?: boolean; organizationId?: number | null },
): Promise<DjangoInsurer[]> {
  const query = new URLSearchParams();
  if (options?.includeInactive) query.set("includeInactive", "1");
  if (options?.organizationId != null) {
    query.set("organizationId", String(options.organizationId));
  }
  const qs = query.toString();
  return apiRequest<DjangoInsurer[]>(
    `/finance/insurers/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function createInsurer(
  payload: InsurerCreatePayload,
): Promise<DjangoInsurer> {
  return apiRequest<DjangoInsurer>("/finance/insurers/", {
    method: "POST",
    body: payload,
  });
}

export function updateInsurer(
  insurerId: number,
  payload: InsurerUpdatePayload,
): Promise<DjangoInsurer> {
  return apiRequest<DjangoInsurer>(`/finance/insurers/${insurerId}/`, {
    method: "PATCH",
    body: payload,
  });
}
