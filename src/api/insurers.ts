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
  options?: { includeInactive?: boolean },
): Promise<DjangoInsurer[]> {
  const qs = options?.includeInactive ? "?includeInactive=1" : "";
  return apiRequest<DjangoInsurer[]>(`/finance/insurers/${qs}`, { signal });
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
