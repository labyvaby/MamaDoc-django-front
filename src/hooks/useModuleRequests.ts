import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../api/queryKeys";
import { getModuleRequests, type ModuleRequest } from "../api/tenancy";
import { usePermissions } from "./usePermissions";

/** Открытые заявки организации; ключ под djangoQueryKeys — сброс при смене организации. */
export function useModuleRequests() {
  const { activeOrganization } = usePermissions();
  const organizationId = activeOrganization?.id;
  return useQuery<ModuleRequest[]>({
    queryKey: djangoQueryKeys.tenancy.requests(organizationId),
    queryFn: () => getModuleRequests(organizationId),
    staleTime: 60 * 1000,
  });
}
