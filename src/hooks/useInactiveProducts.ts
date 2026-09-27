import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { getInactiveProducts, type StorefrontProductState } from "../api/tenancy";
import { usePermissions } from "./usePermissions";

/** Товары, скрытые от клиник; ключ под djangoQueryKeys — сброс при смене организации. */
export function useInactiveProducts() {
  const { activeOrganization } = usePermissions();
  const organizationId = activeOrganization?.id;
  return useQuery<StorefrontProductState[]>({
    queryKey: djangoQueryKeys.tenancy.inactive(organizationId),
    queryFn: () => getInactiveProducts(organizationId),
    staleTime: 60 * 1000,
  });
}
