/**
 * AllAppointmentsList — Все приёмы (Django backend).
 * Тонкая обёртка над AppointmentsRegistryView: реестр всех приёмов
 * в оформлении страницы товаров (чипы-сводки по оплате, лента сотрудников,
 * Drawer фильтров). Data layer: Django REST API, без Supabase.
 */
import React from "react";
import AppointmentsRegistryView from "../appointments/components/AppointmentsRegistryView";
import { useT } from "../../i18n/VerticalProvider";

export const AllAppointmentsList: React.FC = () => {
  const { t } = useT("appointments");
  return (
    <AppointmentsRegistryView
      pageTitle={t("allRegistry.appointmentsPageTitle")}
      listLabel={t("allRegistry.appointmentsListLabel")}
      searchPlaceholder={t("allRegistry.appointmentsSearchPlaceholder")}
      employeeId="me"
    />
  );
};

export default AllAppointmentsList;
