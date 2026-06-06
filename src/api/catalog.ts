import { apiRequest, API_BASE } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Service {
  id: number;
  organizationId: number;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  basePrice: string;
  isActive: boolean;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ───────────────────────────────────────────────────────────────

export interface ServicePayload {
  name: string;
  /** Slug is optional — backend auto-generates from name if omitted. */
  slug?: string;
  description?: string | null;
  durationMinutes?: number;
  basePrice?: string;
  isActive?: boolean;
  sortOrder?: number;
}

// ── API functions ──────────────────────────────────────────────────────────

export function getServices(signal?: AbortSignal): Promise<Service[]> {
  return apiRequest<Service[]>("/catalog/services/", { signal });
}

export function getService(id: number): Promise<Service> {
  return apiRequest<Service>(`/catalog/services/${id}/`);
}

export function createService(payload: ServicePayload): Promise<Service> {
  return apiRequest<Service>("/catalog/services/", {
    method: "POST",
    body: payload,
  });
}

export function updateService(
  id: number,
  payload: Partial<ServicePayload>,
): Promise<Service> {
  return apiRequest<Service>(`/catalog/services/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteService(id: number): Promise<void> {
  return apiRequest<void>(`/catalog/services/${id}/`, { method: "DELETE" });
}

/**
 * Upload or replace the service image.
 * Uses native fetch with multipart/form-data (not JSON).
 */
export async function uploadServiceImage(id: number, file: File): Promise<Service> {
  const form = new FormData();
  form.append("image", file);
  const resp = await fetch(`${API_BASE}/catalog/services/${id}/image/`, {
    method: "PUT",
    credentials: "include",
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(text || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<Service>;
}

/**
 * Remove the service image.
 */
export async function deleteServiceImage(id: number): Promise<void> {
  const resp = await fetch(`${API_BASE}/catalog/services/${id}/image/`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(text || `HTTP ${resp.status}`);
  }
}
