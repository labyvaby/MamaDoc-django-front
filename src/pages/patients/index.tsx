import React, { Suspense } from "react";
import { LinearProgress } from "@mui/material";
import { Navigate } from "react-router";
import { useVertical } from "../../i18n/VerticalProvider";
import { useIsVivaActive } from "../../dev/mockDemoData";
import { lazyWithProgress as lazy } from "../../utility/lazyWithProgress";

// Каждая вертикаль грузит только свой код: раньше обе страницы импортировались
// статически, и отель на «Гостях» качал всю клиничную карточку пациента
// (заключения, генератор PDF — около 1 МБ), а клиника — отельных гостей.
const DjangoPatientsPage = lazy(() => import("./DjangoPatientsPage"));
const HotelGuestsPage = lazy(() => import("../../dev/HotelGuestsPage"));

const PatientsPage: React.FC = () => {
  const { vertical } = useVertical();
  const vivaActive = useIsVivaActive();
  if (vertical === "retail") return <Navigate to="/clients" replace />;
  // Viva — вертикаль "hotel": DjangoPatientsPage сходил бы за настоящими
  // пациентами и получил пусто/ошибку. См. src/dev/HotelGuestsPage.tsx.
  return <Suspense fallback={<LinearProgress />}>{vivaActive ? <HotelGuestsPage /> : <DjangoPatientsPage />}</Suspense>;
};

export default PatientsPage;
