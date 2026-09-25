import { apiRequest } from "./client";

/**
 * Раздел «Модули» — витрина каталога.
 * Контракт: GET /api/tenancy/catalog/ (см. docs/specs/2026-09-20-modules-catalog-settings-design.md).
 * Возвращает опциональные модули (ярусы shared+vertical) для активной
 * организации с флагом isEnabled. Клиника модули не переключает; оператор
 * платформы — через setOrganizationModule (docs/specs/2026-09-25-modules-operator-toggle-design.md).
 */
export interface CatalogModule {
  code: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  isEnabled: boolean;
  /** Прямые требования модуля (коды), граф — tenancy.dependencies на бэке. */
  requires: string[];
}

/**
 * Каталог указанной организации. Сессия одна на все вкладки, поэтому
 * организацию страницы передаём явно, а не полагаемся на сессию: иначе
 * соседняя вкладка могла подсунуть каталог другой клиники. Без id — как раньше,
 * организация сессии.
 */
const orgQuery = (organizationId?: number | null): string =>
  organizationId != null ? `?organizationId=${organizationId}` : "";

export function getModulesCatalog(organizationId?: number | null): Promise<CatalogModule[]> {
  return apiRequest<CatalogModule[]>(`/tenancy/catalog/${orgQuery(organizationId)}`);
}

/**
 * Возможности без своего модуля: пользуется ли ими клиника уже сейчас.
 * Сервер смотрит на данные организации (tenancy/features.py) — витрина
 * не предлагает то, что уже работает.
 */
export interface FeatureSignals {
  onlineBooking: boolean;
  site: boolean;
  insurers: boolean;
  notifications: boolean;
  odoctor: boolean;
}

export function getStorefrontFeatures(organizationId?: number | null): Promise<FeatureSignals> {
  return apiRequest<FeatureSignals>(`/tenancy/features/${orgQuery(organizationId)}`);
}

/** Заявка клиники на подключение с витрины (docs/specs/2026-09-26-modules-storefront-design.md). */
export interface ModuleRequest {
  id: number;
  productId: string;
  productTitle: string;
  moduleCodes: string[];
  status: string;
  createdAt: string;
}

export interface ModuleRequestInput {
  productId: string;
  productTitle: string;
  moduleCodes: string[];
  contactName: string;
  contactPhone: string;
  comment: string;
}

/** Открытые заявки организации — карточки показывают «Заявка отправлена». */
export function getModuleRequests(organizationId?: number | null): Promise<ModuleRequest[]> {
  return apiRequest<ModuleRequest[]>(`/tenancy/module-requests/${orgQuery(organizationId)}`);
}

/** Отправить заявку; открытая заявка на тот же товар вернётся та же. */
export function createModuleRequest(
  organizationId: number | null | undefined,
  body: ModuleRequestInput,
): Promise<ModuleRequest> {
  return apiRequest<ModuleRequest>(`/tenancy/module-requests/${orgQuery(organizationId)}`, {
    method: "POST",
    body,
  });
}

/** Строка «модуль организации» из /api/tenancy/organizations/<id>/modules/. */
export interface OrganizationModule {
  id: number;
  organizationId: number;
  moduleCode: string;
  moduleName: string;
  moduleCategory: string;
  isEnabled: boolean;
  enabledAt: string | null;
  disabledAt: string | null;
  notes: string;
}

/**
 * Включить или выключить один модуль организации. Только суперпользователь
 * платформы; бэк проверяет зависимости модулей и при отказе отвечает 400 с
 * текстом, что переключить сначала.
 */
export function setOrganizationModule(
  organizationId: number | string,
  code: string,
  isEnabled: boolean,
): Promise<OrganizationModule> {
  return apiRequest<OrganizationModule>(
    `/tenancy/organizations/${organizationId}/modules/${encodeURIComponent(code)}/`,
    { method: "PATCH", body: { isEnabled } },
  );
}
