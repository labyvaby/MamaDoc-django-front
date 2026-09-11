import React from "react";
import { Navigate } from "react-router";
import { useVertical } from "../../i18n/VerticalProvider";
import DjangoPatientsPage from "./DjangoPatientsPage";
import { isVivaActive } from "../../dev/mockDemoData";
import { HotelGuestsPage } from "../../dev/HotelGuestsPage";

const PatientsPage: React.FC = () => {
  const { vertical } = useVertical();
  if (vertical === "retail") return <Navigate to="/clients" replace />;
  // Viva — синтетическая организация без бэкенда: DjangoPatientsPage сходил бы
  // за настоящими пациентами и получил пусто/ошибку. См. src/dev/HotelGuestsPage.tsx.
  if (isVivaActive()) return <HotelGuestsPage />;
  return <DjangoPatientsPage />;
};

export default PatientsPage;
