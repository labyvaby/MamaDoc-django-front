import React from "react";
import SettingsIndexPage from "./SettingsIndexPage";
import { isVivaActive } from "../../dev/mockDemoData";
import { HotelRolesSettingsPage } from "../../dev/HotelRolesSettingsPage";

/**
 * Viva — синтетическая организация без бэкенда: вкладки SettingsIndexPage
 * завязаны на реальный RBAC/клиническую специфику, которой у отеля нет. См.
 * src/dev/HotelRolesSettingsPage.tsx — там же принцип, что у ReportsRouter.tsx.
 */
const SettingsRouter: React.FC = () => {
  if (isVivaActive()) return <HotelRolesSettingsPage />;
  return <SettingsIndexPage />;
};

export default SettingsRouter;
