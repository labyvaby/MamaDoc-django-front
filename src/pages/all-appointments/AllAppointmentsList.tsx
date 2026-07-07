/**
 * AllAppointmentsList — Все приёмы (Django backend).
 * Тонкая обёртка над AppointmentsRegistryView: реестр всех приёмов
 * в оформлении страницы товаров (чипы-сводки по оплате, лента сотрудников,
 * Drawer фильтров). Data layer: Django REST API, без Supabase.
 */
import React from "react";
import AppointmentsRegistryView from "../appointments/components/AppointmentsRegistryView";

export const AllAppointmentsList: React.FC = () => (
  <AppointmentsRegistryView
    pageTitle="Все приемы"
    listLabel="Приёмы"
    searchPlaceholder="Поиск пациента, услуги..."
  />
);

export default AllAppointmentsList;
