import React from "react";
import { Navigate } from "react-router";
import { useVertical } from "../../i18n/VerticalProvider";
import DjangoPatientsPage from "./DjangoPatientsPage";
import { useIsVivaActive } from "../../dev/mockDemoData";
import { HotelGuestsPage } from "../../dev/HotelGuestsPage";

const PatientsPage: React.FC = () => {
  const { vertical } = useVertical();
  const vivaActive = useIsVivaActive();
  if (vertical === "retail") return <Navigate to="/clients" replace />;
  // Viva — вертикаль "hotel": DjangoPatientsPage сходил бы за настоящими
  // пациентами и получил пусто/ошибку. См. src/dev/HotelGuestsPage.tsx.
  // useIsVivaActive — реальный vertical "hotel" ИЛИ старый мок-переключатель,
  // пока миграция экранов не завершена.
  if (vivaActive) return <HotelGuestsPage />;
  return <DjangoPatientsPage />;
};

export default PatientsPage;
