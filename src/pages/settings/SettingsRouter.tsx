import React from "react";
import SettingsIndexPage from "./SettingsIndexPage";
import { isVivaActive } from "../../dev/mockDemoData";
import { HotelSettingsPage } from "../../dev/HotelSettingsPage";

/**
 * Viva — синтетическая организация без бэкенда: вкладки SettingsIndexPage
 * завязаны на реальный RBAC/клиническую специфику, которой у отеля нет. См.
 * src/dev/HotelSettingsPage.tsx («Роли и права» + «Номера») — там же принцип,
 * что у ReportsRouter.tsx.
 */
const SettingsRouter: React.FC = () => {
  if (isVivaActive()) return <HotelSettingsPage />;
  return <SettingsIndexPage />;
};

export default SettingsRouter;
