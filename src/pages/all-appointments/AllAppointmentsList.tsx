/**
 * AllAppointmentsList — Все приёмы (Django backend).
 * Тонкая обёртка над AppointmentsRegistryView: реестр всех приёмов
 * в оформлении страницы товаров (чипы-сводки по оплате, лента сотрудников,
 * Drawer фильтров). Data layer: Django REST API, без Supabase.
 */
import React from "react";
import AppointmentsRegistryView from "../appointments/components/AppointmentsRegistryView";
import { useSeesOwnAppointmentsOnly } from "../appointments/useOwnScope";
import { useT } from "../../i18n/VerticalProvider";

export const AllAppointmentsList: React.FC = () => {
  const { t } = useT("appointments");
  // Сужаем реестр до своих приёмов только непривилегированному клиницисту:
  // у управляющих ролей и суперпользователя employee-профиля нет, для них
  // employeeId=me вернул бы пустой список.
  const seesOwnOnly = useSeesOwnAppointmentsOnly();
  return (
    <AppointmentsRegistryView
      pageTitle={t("allRegistry.appointmentsPageTitle")}
      listLabel={t("allRegistry.appointmentsListLabel")}
      searchPlaceholder={t("allRegistry.appointmentsSearchPlaceholder")}
      employeeId={seesOwnOnly ? "me" : undefined}
    />
  );
};

export default AllAppointmentsList;
