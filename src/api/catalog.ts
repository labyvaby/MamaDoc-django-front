import { apiRequest, API_BASE } from "./client";
import { tt } from "../i18n/t";

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
  doctor: "",
  nurse: "",
  lab: "Лаборатория",
  hardware: "Аппаратные услуги",
};

// doctor/nurse вертикально-зависимы — геттеры вместо литералов (порядок
// ключей сохранён — определены выше плейсхолдером, чтобы не сдвинуть
// порядок опций фильтра при redefine).
Object.defineProperties(SERVICE_CATEGORY_LABELS, {
  doctor: { enumerable: true, get: () => tt("common:serviceCategories.doctor") },
  nurse: { enumerable: true, get: () => tt("common:serviceCategories.nurse") },
});

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

/**
 * Состав расходников услуги — несколько товаров с количеством (заказчик
 * 29.07.2026). Бэк закрыл тикет
 * MamaDoc/backend_ticket_service_related_products_multi.md — гайд
 * `frontend-service-related-products.md`:
 *   - GET отдаёт `relatedProducts: [{id, name, unit, price, stock, quantity,
 *     autoWriteOff}]` (`id` — товар, не строка состава), пустой массив без состава;
 *   - запись — `relatedProducts: [{productId, quantity, autoWriteOff}]`, полная
 *     синхронизация как у `branchIds`; `[]` очищает; отсутствие поля не трогает;
 *   - `relatedProductId`/`relatedProduct` остались алиасом первого элемента и
 *     помечены deprecated (снесём отдельным тикетом, когда уберём одиночную ветку);
 *   - два поля записи одновременно → 400, поэтому payload шлёт ровно одно.
 *
 * Проверено на живом API 30.07.2026 (услуга «Установка импланта (Импланон)»,
 * орг. 4): GET отдаёт `relatedProducts: [{id, name, unit, price, stock,
 * quantity, autoWriteOff, billable}]` — контракт выше в силе, `billable`
 * задеплоен.
 *
 * ⚠ `front_consumables_integration.md` §1.1 описывает это поле иначе — читать
 * `relatedProductLinks[]` с `productId/productName/unitQuantity/sortOrder`.
 * Живой прод таких имён не отдаёт и не принимает; в гайд, судя по составу
 * полей, попали внутренние имена модели бэка. Идём по факту API, не по гайду —
 * при переименовании на бэке состав услуги молча опустеет в UI (полей нет →
 * пустой массив), это первое, что надо проверить.
 */
export const SERVICE_RELATED_PRODUCTS_MULTI_ENABLED = true;

/** Максимум товаров в составе услуги — лимит бэка (400 при превышении). */
export const SERVICE_RELATED_PRODUCTS_MAX = 20;

export interface RelatedProductRef {
  id: number;
  name: string;
  /** Нормализовано из строки-decimal бэка ("9000.00"). */
  price: number;
  /** Нормализовано из строки-decimal бэка ("10.000"). */
  stock: number;
}

/**
 * Строка состава услуги. `id` — id **товара** (бэк сделал так намеренно, чтобы
 * старый нормализатор `{id, name, price, stock}` продолжал работать).
 *
 * ⚠ `stock` — остаток по всей организации: в справочнике услуги филиала нет.
 * Остаток склада филиала приходит в API приёма (`consumptions[].stockOnHand`) и
 * законно отличается от этого числа.
 */
export interface ServiceRelatedProduct extends RelatedProductRef {
  /** Единица измерения товара; пустая строка, если бэк её не отдал. */
  unit: string;
  /** Сколько товара уходит на одну услугу (decimal, до 3 знаков; > 0). */
  quantity: number;
  /** Списывать ли со склада при завершении приёма. */
  autoWriteOff: boolean;
  /**
   * Оплачивается сверх цены услуги: `price × quantity` попадает в сумму приёма
   * (кейс «Импланон» — имплант дороже самой услуги). `false` — стоимость товара
   * считается включённой в цену услуги, как было до 30.07.2026.
   *
   * Независим от `autoWriteOff`: платный товар может не списываться (принёс
   * пациент), а бесплатный — списываться.
   */
  billable: boolean;
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
  /**
   * @deprecated Алиас первого элемента `relatedProducts` (бэк гарантирует
   * `relatedProductId == relatedProducts[0].id`). Удалим вместе с полем на бэке.
   */
  relatedProductId: number | null;
  /** @deprecated См. `relatedProductId`. */
  relatedProduct: RelatedProductRef | null;
  /**
   * Состав расходников услуги; пустой массив — состава нет. До появления
   * плюрального поля на бэке нормализуется из одиночной привязки, поэтому
   * фолбэк остаётся рабочим на не-обновлённом окружении.
   */
  relatedProducts: ServiceRelatedProduct[];
  /** Branches visible to the current user. */
  branches: BranchRef[];
  /** True when the service is also assigned to branches outside the caller's scope. */
  hasHiddenBranches: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ───────────────────────────────────────────────────────────────

/**
 * Строка состава на запись. `quantity` — строка-decimal (бэк принимает и число,
 * по умолчанию 1, до 3 знаков, > 0); `autoWriteOff` по умолчанию true.
 */
export interface ServiceRelatedProductPayload {
  productId: number;
  quantity?: string;
  autoWriteOff?: boolean;
  /** Оплачивается сверх цены услуги; по умолчанию на бэке false. */
  billable?: boolean;
}

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
  /** @deprecated Одиночная привязка; null/отсутствие — без привязки. */
  relatedProductId?: number | null;
  /** @deprecated Набор товаров с `quantity = 1` и `autoWriteOff = true`. */
  relatedProductIds?: number[];
  /** Состав расходников; `[]` — без состава. Взаимоисключающе с полями выше (400). */
  relatedProducts?: ServiceRelatedProductPayload[];
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
  /** @deprecated Одиночная привязка; null очищает. */
  relatedProductId?: number | null;
  /** @deprecated Набор товаров с `quantity = 1` и `autoWriteOff = true`. */
  relatedProductIds?: number[];
  /**
   * Состав расходников — полная синхронизация: массив заменяет текущий набор,
   * `[]` очищает, отсутствие поля не трогает состав. Не отправлять «на всякий
   * случай»: пустой массив стирает состав.
   */
  relatedProducts?: ServiceRelatedProductPayload[];
}

/** Строка состава как её держит форма (количество — строка из поля ввода). */
export interface RelatedProductInput {
  productId: number;
  /** Введённое количество; пусто/невалидно → 1 (значение по умолчанию бэка). */
  quantity?: string;
  autoWriteOff?: boolean;
  /** Оплачивается сверх цены услуги. */
  billable?: boolean;
}

/**
 * Количество из поля ввода в строку-decimal бэка: запятая как разделитель,
 * не больше `RELATED_QUANTITY_SCALE` знаков, строго > 0. Null — невалидно
 * (форма не даёт сохранить и показывает ошибку, вместо молчаливой замены на 1).
 */
export const RELATED_QUANTITY_SCALE = 3;

export function parseRelatedQuantity(input: string | undefined): number | null {
  const raw = (input ?? "").trim().replace(",", ".");
  if (raw === "") return null;
  if (!/^\d*(\.\d*)?$/.test(raw)) return null;
  const decimals = raw.split(".")[1] ?? "";
  if (decimals.length > RELATED_QUANTITY_SCALE) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Тело запроса для состава услуги. Шлём **ровно одно** поле: два поля записи
 * одновременно бэк отклоняет с 400 (см. гайд §1), поэтому одиночный алиас
 * `relatedProductId` уходит только в выключенном мульти-режиме — и количество
 * с платностью там передать нечем: количество всегда 1, товар — в цене услуги.
 */
export function relatedProductsPayload(
  items: RelatedProductInput[],
): Pick<ServiceUpdatePayload, "relatedProductId" | "relatedProducts"> {
  if (!SERVICE_RELATED_PRODUCT_ENABLED) return {};
  if (!SERVICE_RELATED_PRODUCTS_MULTI_ENABLED) {
    return { relatedProductId: items[0]?.productId ?? null };
  }
  return {
    relatedProducts: items.map((item) => ({
      productId: item.productId,
      quantity: String(parseRelatedQuantity(item.quantity) ?? 1),
      autoWriteOff: item.autoWriteOff !== false,
      billable: item.billable === true,
    })),
  };
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

/**
 * Состав услуги: плюральное поле бэка, если оно есть, иначе — одиночная
 * привязка как массив из одного элемента (окружение без деплоя).
 *
 * `quantity` бэка — строка-decimal; при фолбэке из одиночного поля количество
 * неизвестно, поэтому 1 (то же, что подразумевает старый контракт).
 * `autoWriteOff` по умолчанию true — как на бэке.
 */
function normalizeRelatedProducts(service: Service): ServiceRelatedProduct[] {
  const raw = Array.isArray(service.relatedProducts) ? service.relatedProducts : null;
  if (raw) {
    return raw
      .map((item): ServiceRelatedProduct | null => {
        const base = normalizeRelatedProduct(item);
        if (!base) return null;
        return {
          ...base,
          unit: item.unit ?? "",
          quantity: parseFloat(String(item.quantity)) || 1,
          autoWriteOff: item.autoWriteOff !== false,
          // По умолчанию false, в отличие от autoWriteOff: пока бэк поля не
          // отдаёт, состав не должен внезапно начать добавлять деньги в чек.
          billable: item.billable === true,
        };
      })
      .filter((p): p is ServiceRelatedProduct => p !== null);
  }
  const single = normalizeRelatedProduct(service.relatedProduct);
  return single
    ? [{ ...single, unit: "", quantity: 1, autoWriteOff: true, billable: false }]
    : [];
}

function normalizeService(service: Service): Service {
  return {
    ...service,
    // Пока бэк не отдаёт category, поле undefined → нормализуем в null.
    category: service.category ?? null,
    relatedProductId: service.relatedProductId ?? null,
    relatedProduct: normalizeRelatedProduct(service.relatedProduct),
    relatedProducts: normalizeRelatedProducts(service),
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
