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
export function getModulesCatalog(organizationId?: number | null): Promise<CatalogModule[]> {
  const query = organizationId != null ? `?organizationId=${organizationId}` : "";
  return apiRequest<CatalogModule[]>(`/tenancy/catalog/${query}`);
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
