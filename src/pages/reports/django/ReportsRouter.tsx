import React from "react";
import DjangoReportsPage from "./DjangoReportsPage";
import { isVivaActive } from "../../../dev/mockDemoData";
import { HotelReportsPage } from "../../../dev/HotelReportsPage";

/**
 * Viva — синтетическая организация без бэкенда: DjangoReportsPage сходил бы
 * за настоящими отчётами и получил пусто/ошибку. См. src/dev/HotelReportsPage.tsx.
 * Отдельный файл, а не правка index.ts, — тот остаётся простым реэкспортом.
 */
const ReportsRouter: React.FC = () => {
  if (isVivaActive()) return <HotelReportsPage />;
  return <DjangoReportsPage />;
};

export default ReportsRouter;
