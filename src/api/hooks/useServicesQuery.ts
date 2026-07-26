import { useQuery } from "@tanstack/react-query";
import { useActiveScope } from "../../hooks/useActiveScope";
import { getServices, Service, ServiceCategory } from "../catalog";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../queryKeys";

export function useServicesList(
  params: { category?: ServiceCategory | null; search?: string } = {}
) {
  const scope = useActiveScope();
  return useQuery<Service[]>({
    queryKey: ["django", "catalog", "services", "list", { ...params, ...scope }],
    queryFn: ({ signal }) => getServices(scope, params, signal),
    enabled: scope.isReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
}

export default useServicesList;
