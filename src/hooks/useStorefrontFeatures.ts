import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { getStorefrontFeatures, type FeatureSignals } from "../api/tenancy";
import { usePermissions } from "./usePermissions";

/** Признаки товаров без модуля; ключ под djangoQueryKeys — сброс при смене организации. */
export function useStorefrontFeatures() {
  const { activeOrganization } = usePermissions();
  const organizationId = activeOrganization?.id;
  return useQuery<FeatureSignals>({
    queryKey: djangoQueryKeys.tenancy.features(organizationId),
    queryFn: () => getStorefrontFeatures(organizationId),
    staleTime: 60 * 1000,
  });
}
