import React from "react";

import type { RealtyScope } from "../api/realestate";
import { useActiveScope } from "./useActiveScope";

/**
 * Скоуп запросов модулей AIVIO (`/api/v2/realty`, `/edo`, …): организация уходит
 * заголовком `X-Organization-Id`, филиал фильтрует бэк по сессии — фронт кладёт
 * его только в ключи кэша, чтобы смена филиала не показывала чужие данные.
 * Объект стабилен между рендерами, пока не сменились организация и филиал.
 */
export function useRealtyScope(): RealtyScope {
  const { organizationId, branchId, orgReady } = useActiveScope();
  return React.useMemo(() => ({ organizationId, branchId, orgReady }), [organizationId, branchId, orgReady]);
}

export default useRealtyScope;
