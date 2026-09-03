import { useQuery } from "@tanstack/react-query";
import { useActiveScope } from "../../hooks/useActiveScope";
import { getAppointments, DjangoAppointment } from "../appointments";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../queryKeys";

export function useAppointmentsList(
  params: {
    dateFrom?: string;
    dateTo?: string;
    date?: string;
    /** Список статусов уходит через запятую — см. getAppointments. */
    status?: string | string[];
    search?: string;
    employeeId?: number | "me";
    patientId?: number;
    nightOnly?: boolean;
  } = {}
) {
  const scope = useActiveScope();
  return useQuery<DjangoAppointment[]>({
    queryKey: djangoQueryKeys.appointments.list({ ...params, ...scope }),
    queryFn: ({ signal }) => getAppointments(scope, params, signal),
    enabled: scope.isReady,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
}

export default useAppointmentsList;
