import React from "react";
import DjangoReportsPage from "./DjangoReportsPage";
import { useIsVivaActive } from "../../../dev/mockDemoData";
import { HotelReportsPage } from "../../../dev/HotelReportsPage";

/**
 * Viva — вертикаль "hotel": DjangoReportsPage сходил бы за настоящими
 * клиническими отчётами и получил пусто/ошибку. См. src/dev/HotelReportsPage.tsx.
 * Признак — useIsVivaActive (реальный vertical "hotel" из /auth/me/ ИЛИ
 * старый мок-переключатель, пока миграция экранов не завершена).
 * Отдельный файл, а не правка index.ts, — тот остаётся простым реэкспортом.
 */
const ReportsRouter: React.FC = () => {
  const vivaActive = useIsVivaActive();
  if (vivaActive) return <HotelReportsPage />;
  return <DjangoReportsPage />;
};

export default ReportsRouter;
