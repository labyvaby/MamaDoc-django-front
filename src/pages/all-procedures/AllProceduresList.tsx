/**
 * AllProceduresList — Все процедуры (Django backend).
 * Обёртка над RegistryJournalView. Отличие от «Все приёмы»: показываются
 * только приёмы с участием медсестры (clinicalRole === "nurse"), а в срез
 * попадают строго медсестринские строки — иначе из совместного приёма в журнал
 * процедур попали бы деньги врача. Четвёртая карточка разрезов — списание
 * материалов вместо структуры оплаты.
 *
 * Скоуп: непривилегированная медсестра видит только свои процедуры ("me"),
 * управляющие роли и суперпользователь — процедуры всех медсестёр (у них нет
 * employee-профиля, "me" вернул бы пустой список).
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";

import RegistryJournalView from "../appointments/components/registry/RegistryJournalView";
import { useSeesOwnAppointmentsOnly } from "../appointments/useOwnScope";
import { getDjangoEmployees } from "../../api/staff";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import type { DjangoAppointment, AppointmentServiceLine } from "../../api/appointments";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";

export const AllProceduresList: React.FC = () => {
  const { t } = useT("appointments");
  const orgId = useApiOrgId();
  const { activeEmployee } = usePermissions();
  const seesOwnOnly = useSeesOwnAppointmentsOnly();
  const ownEmployeeId = activeEmployee?.id ?? null;

  // Медсёстры по clinical role (не RBAC). Тот же queryKey, что в
  // AppointmentsPage (useClinicalIds) — кэш общий. Своей медсестре справочник
  // не нужен: её группа — она сама.
  const nurseIdsQuery = useQuery({
    queryKey: ["staff", "employees", "clinicalIds", "nurse", orgId],
    queryFn: async ({ signal }) => {
      const res = await getDjangoEmployees(
        { status: "active", pageSize: 500, organizationId: orgId },
        signal,
      );
      return res.results.filter((e) => e.clinicalRole === "nurse").map((e) => e.id);
    },
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    enabled: !seesOwnOnly,
  });

  const nurseIds = React.useMemo(() => {
    if (!seesOwnOnly) return new Set(nurseIdsQuery.data ?? []);
    return ownEmployeeId == null ? new Set<number>() : new Set([ownEmployeeId]);
  }, [seesOwnOnly, ownEmployeeId, nurseIdsQuery.data]);

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
    <RegistryJournalView
      variant="procedures"
      pageTitle={t("allRegistry.proceduresPageTitle")}
      listLabel={t("allRegistry.proceduresListLabel")}
      searchPlaceholder={t("allRegistry.proceduresSearchPlaceholder")}
      getLines={nurseLines}
      isVisible={hasNurseLine}
      extraLoading={!seesOwnOnly && nurseIdsQuery.isLoading}
      employeeId={seesOwnOnly ? "me" : undefined}
    />
  );
};

export default AllProceduresList;
