import { useQuery } from "@tanstack/react-query";

import { CatalogModule, getModulesCatalog } from "../api/tenancy";

export function useModulesCatalog() {
  return useQuery<CatalogModule[]>({
    queryKey: ["tenancy", "catalog"],
    queryFn: getModulesCatalog,
    staleTime: 5 * 60 * 1000,
  });
}
