import { useQuery } from "@tanstack/react-query";
import { useActiveScope } from "../../hooks/useActiveScope";
import { getPatients, DjangoPatient } from "../patients";
import { DJANGO_LIST_STALE_TIME_MS } from "../queryKeys";

export function usePatientsList(params: { search?: string } = {}) {
  const scope = useActiveScope();
  return useQuery<DjangoPatient[]>({
    queryKey: ["django", "patients", "list", { ...params, ...scope }],
    queryFn: ({ signal }) => getPatients(scope, params, signal),
    enabled: scope.isReady,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
}

export default usePatientsList;
