import { apiRequest, API_BASE } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BranchRef {
  id: number;
  name: string;
}

/**
 * Категории услуг (заказчик 15.07.2026, для фильтра). Бэк реализовал
 * (тикет MamaDoc/backend_ticket_service_categories.md) — проверено на живом
 * API 20.07.2026 на тестовом филиале: GET отдаёт category, PATCH сохраняет
 * и очищает (null), неизвестный slug → 400.
 */
export const SERVICE_CATEGORIES_ENABLED = true;

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

/**
 * Сопутствующий товар услуги (заказчик 27.07.2026 — например «УЗИ» → «Гель
 * для УЗИ»). Бэк реализовал (тикет
 * MamaDoc/backend_ticket_service_related_product.md) — проверено на живом API
 * 28.07.2026 (услуга «Первичный прием (тест)»): GET отдаёт relatedProductId +
 * relatedProduct {id, name, price, stock}, PATCH сохраняет и очищает (null),
 * несуществующий/чужой товар → 400 «Товар N не найден или принадлежит другой
 * организации».
 */
export const SERVICE_RELATED_PRODUCT_ENABLED = true;

export interface RelatedProductRef {
  id: number;
  name: string;
  /** Нормализовано из строки-decimal бэка ("9000.00"). */
  price: number;
  /** Нормализовано из строки-decimal бэка ("10.000"). */
  stock: number;
}

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
  /** Сопутствующий товар склада; null — не привязан. */
  relatedProductId: number | null;
  relatedProduct: RelatedProductRef | null;
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
  /** Сопутствующий товар; null/отсутствие — без привязки. */
  relatedProductId?: number | null;
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
  /** Сопутствующий товар; null очищает привязку. */
  relatedProductId?: number | null;
}

/** Бэк отдаёт price/stock товара строками-decimal — приводим к числам (как mapProduct в api/warehouse.ts). */
function normalizeRelatedProduct(
  product: Service["relatedProduct"],
): RelatedProductRef | null {
  if (!product) return null;
  return {
    ...product,
    price: parseFloat(String(product.price)) || 0,
    stock: parseFloat(String(product.stock)) || 0,
  };
}

function normalizeService(service: Service): Service {
  return {
    ...service,
    // Пока бэк не отдаёт category, поле undefined → нормализуем в null.
    category: service.category ?? null,
    relatedProductId: service.relatedProductId ?? null,
    relatedProduct: normalizeRelatedProduct(service.relatedProduct),
    branches: Array.isArray(service.branches) ? service.branches : [],
    hasHiddenBranches: Boolean(service.hasHiddenBranches),
  };
}

import { Scope, scopeParams } from "./scope";

export function getServices(
  scopeOrBranchId?: Scope | number | null,
  params?: { category?: ServiceCategory | null; search?: string },
  signal?: AbortSignal,
): Promise<Service[]> {
  let query: URLSearchParams;
  if (typeof scopeOrBranchId === "number" || scopeOrBranchId === null) {
    query = scopeParams(scopeOrBranchId != null ? { branchId: scopeOrBranchId } : {});
  } else {
    query = scopeParams(scopeOrBranchId ?? {});
  }
  if (params?.category) query.set("category", params.category);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest<Service[]>(`/catalog/services/${qs ? `?${qs}` : ""}`, { signal }).then((services) =>
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
