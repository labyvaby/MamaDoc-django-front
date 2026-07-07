/**
 * AllProceduresList — Все процедуры (Django backend).
 * Обёртка над AppointmentsRegistryView (оформление — как страница товаров).
 * Отличие от «Все приёмы»: показываются только приёмы с участием медсестры
 * (clinicalRole === "nurse"), лента сотрудников и фильтр услуг — строго по
 * медсестринским строкам, чтобы из совместного приёма не появлялась группа
 * врача. Data layer: Django REST API, без Supabase.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";

import AppointmentsRegistryView from "../appointments/components/AppointmentsRegistryView";
import { getDjangoEmployees } from "../../api/staff";
import { DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import type { DjangoAppointment, AppointmentServiceLine } from "../../api/appointments";

export const AllProceduresList: React.FC = () => {
  // Медсёстры по clinical role (не RBAC). Тот же queryKey, что в
  // AppointmentsPage (useClinicalIds) — кэш общий.
  const nurseIdsQuery = useQuery({
    queryKey: ["staff", "employees", "clinicalIds", "nurse"],
    queryFn: async ({ signal }) => {
      const res = await getDjangoEmployees({ status: "active", pageSize: 500 }, signal);
      return res.results.filter((e) => e.clinicalRole === "nurse").map((e) => e.id);
    },
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const nurseIds = React.useMemo(
    () => new Set(nurseIdsQuery.data ?? []),
    [nurseIdsQuery.data],
  );

  const nurseLines = React.useCallback(
    (h: DjangoAppointment): AppointmentServiceLine[] =>
      h.services.filter((sl) => sl.employee && nurseIds.has(sl.employee.id)),
    [nurseIds],
  );

  const hasNurseLine = React.useCallback(
    (h: DjangoAppointment) => nurseLines(h).length > 0,
    [nurseLines],
  );

  return (
    <AppointmentsRegistryView
      pageTitle="Все процедуры"
      listLabel="Процедуры"
      searchPlaceholder="Поиск пациента, процедуры..."
      getLines={nurseLines}
      isVisible={hasNurseLine}
      extraLoading={nurseIdsQuery.isLoading}
    />
  );
};

export default AllProceduresList;
