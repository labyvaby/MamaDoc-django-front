import { apiRequest } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  organizationId: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: number;
  organizationId: number;
  category: { id: number; name: string; slug: string } | null;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  basePrice: string;
  isActive: boolean;
  requiresDoctor: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ───────────────────────────────────────────────────────────────

export interface CategoryPayload {
  parentId?: number | null;
  name: string;
  slug: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ServicePayload {
  categoryId?: number | null;
  name: string;
  slug: string;
  description?: string | null;
  durationMinutes: number;
  basePrice: string;
  isActive?: boolean;
  requiresDoctor?: boolean;
  sortOrder?: number;
}

// ── API functions ──────────────────────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>("/catalog/categories/");
}

export function createCategory(payload: CategoryPayload): Promise<Category> {
  return apiRequest<Category>("/catalog/categories/", {
    method: "POST",
    body: payload,
  });
}

export function updateCategory(
  id: number,
  payload: Partial<CategoryPayload>,
): Promise<Category> {
  return apiRequest<Category>(`/catalog/categories/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function getServices(signal?: AbortSignal): Promise<Service[]> {
  return apiRequest<Service[]>("/catalog/services/", { signal });
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
