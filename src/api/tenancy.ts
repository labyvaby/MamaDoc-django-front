import { apiRequest } from "./client";

/**
 * Раздел «Модули» — read-only витрина каталога.
 * Контракт: GET /api/tenancy/catalog/ (см. docs/specs/2026-09-20-modules-catalog-settings-design.md).
 * Возвращает опциональные модули (ярусы shared+vertical) для активной
 * организации с флагом isEnabled. Тумблинг на клиенте не предусмотрен.
 */
export interface CatalogModule {
  code: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  isEnabled: boolean;
}

export function getModulesCatalog(): Promise<CatalogModule[]> {
  return apiRequest<CatalogModule[]>("/tenancy/catalog/");
}
