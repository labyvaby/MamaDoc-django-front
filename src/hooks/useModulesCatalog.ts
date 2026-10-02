import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { CatalogModule, getModulesCatalog } from "../api/tenancy";
import { usePermissions } from "./usePermissions";

/**
 * Запрос витрины для организации. Ключ — под djangoQueryKeys.all и с id
 * организации: смена организации (switchContext) снимает его вместе с
 * остальными данными контекста. Запрос несёт ту же организацию, что и ключ.
 */
export function modulesCatalogQuery(organizationId: number | null | undefined) {
  return {
    queryKey: djangoQueryKeys.tenancy.catalog(organizationId),
    queryFn: () => getModulesCatalog(organizationId),
    staleTime: 5 * 60 * 1000,
  };
}

export function useModulesCatalog() {
  const { activeOrganization } = usePermissions();
  return useQuery<CatalogModule[]>(modulesCatalogQuery(activeOrganization?.id));
}
