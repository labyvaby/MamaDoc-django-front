/**
 * AllProceduresList — Все процедуры (Django backend).
 * Обёртка над AppointmentsRegistryView (оформление — как страница товаров).
 * Отличие от «Все приёмы»: показываются только приёмы с участием медсестры
 * (clinicalRole === "nurse"), лента сотрудников и фильтр услуг — строго по
 * медсестринским строкам, чтобы из совместного приёма не появлялась группа
 * врача. Data layer: Django REST API, без Supabase.
 */
import React from "react";

import AppointmentsRegistryView from "../appointments/components/AppointmentsRegistryView";
import type { DjangoAppointment, AppointmentServiceLine } from "../../api/appointments";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";

export const AllProceduresList: React.FC = () => {
  const { t } = useT("appointments");
  const { activeEmployee } = usePermissions();
  const ownEmployeeId = activeEmployee?.id ?? null;
  const nurseIds = React.useMemo(
    () => (ownEmployeeId == null ? new Set<number>() : new Set([ownEmployeeId])),
    [ownEmployeeId],
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
      searchPlaceholder={t("allRegistry.proceduresSearchPlaceholder")}
      getLines={nurseLines}
      isVisible={hasNurseLine}
      groupEmployeeIds={nurseIds}
      employeeId="me"
    />
  );
};

export default AllProceduresList;
