import { apiRequest, API_BASE } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BranchRef {
  id: number;
  name: string;
}

/**
 * Категории услуг (заказчик 15.07.2026, для фильтра). ⚠ Бэкенд поле
 * ``category`` ПОКА не хранит (проверено на живом API 15.07.2026 — в ответе
 * его нет, msgspec молча дропнет его в POST/PATCH) — тикет
 * MamaDoc/backend_ticket_service_categories.md. До деплоя бэка UI категорий
 * скрыт флагом; после — переключить в true, других правок не нужно.
 */
export const SERVICE_CATEGORIES_ENABLED = false;

export type ServiceCategory = "doctor" | "nurse" | "lab" | "hardware";

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  doctor: "Услуги врачей",
  nurse: "Услуги медсестёр",
  lab: "Лаборатория",
  hardware: "Аппаратные услуги",
};

export const SERVICE_CATEGORY_OPTIONS = Object.keys(
  SERVICE_CATEGORY_LABELS,
) as ServiceCategory[];

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
  /** Категория услуги; null — без категории. */
  category: ServiceCategory | null;
  /** Branches visible to the current user. */
  branches: BranchRef[];
  /** True when the service is also assigned to branches outside the caller's scope. */
  hasHiddenBranches: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ───────────────────────────────────────────────────────────────

export interface ServiceCreatePayload {
  name: string;
  /** Required: at least one active branch in the organization. */
  branchIds: number[];
  slug?: string;
  description?: string;
  durationMinutes?: number;
  basePrice?: string;
  isActive?: boolean;
  sortOrder?: number;
  /** Категория; null/отсутствие — без категории. */
  category?: ServiceCategory | null;
}

export interface ServiceUpdatePayload {
  name?: string;
  slug?: string;
  description?: string;
  durationMinutes?: number;
  basePrice?: string;
  isActive?: boolean;
  sortOrder?: number;
  /**
   * When present and non-empty → sync branch assignments.
   * When absent → do not change branches.
   * Empty array → the backend returns 400.
   */
  branchIds?: number[];
  /** Категория; null очищает (тикет: PATCH category=null → без категории). */
  category?: ServiceCategory | null;
}

function normalizeService(service: Service): Service {
  return {
    ...service,
    // Пока бэк не отдаёт category, поле undefined → нормализуем в null.
    category: service.category ?? null,
    branches: Array.isArray(service.branches) ? service.branches : [],
    hasHiddenBranches: Boolean(service.hasHiddenBranches),
  };
}

// ── API functions ──────────────────────────────────────────────────────────

export function getServices(branchId?: number | null, signal?: AbortSignal): Promise<Service[]> {
  const params = branchId != null ? `?branchId=${branchId}` : "";
  return apiRequest<Service[]>(`/catalog/services/${params}`, { signal }).then((services) =>
    (Array.isArray(services) ? services : []).map(normalizeService),
  );
}

export function getService(id: number): Promise<Service> {
  return apiRequest<Service>(`/catalog/services/${id}/`).then(normalizeService);
}

export function createService(payload: ServiceCreatePayload): Promise<Service> {
  return apiRequest<Service>("/catalog/services/", {
    method: "POST",
    body: payload,
  }).then(normalizeService);
}

export function updateService(
  id: number,
  payload: ServiceUpdatePayload,
): Promise<Service> {
  return apiRequest<Service>(`/catalog/services/${id}/`, {
    method: "PATCH",
    body: payload,
  }).then(normalizeService);
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
  const service = (await resp.json()) as Service;
  return normalizeService(service);
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
