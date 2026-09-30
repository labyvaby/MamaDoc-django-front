import React, { Suspense } from "react";
import { LinearProgress } from "@mui/material";
import { useIsVivaActive } from "../../../dev/mockDemoData";
import { lazyWithProgress as lazy } from "../../../utility/lazyWithProgress";
import { RequirePermission } from "../../../components/rbac/RequirePermission";
import { PAGE_PERMISSIONS } from "../../../config/accessPermissions";

// Каждая вертикаль грузит только свои отчёты (клиничные — с графиками и своими
// запросами — отелю не нужны, и наоборот).
const DjangoReportsPage = lazy(() => import("./DjangoReportsPage"));
const HotelReportsPage = lazy(() => import("../../../dev/HotelReportsPage"));

/**
 * Viva — вертикаль "hotel": DjangoReportsPage сходил бы за настоящими
 * клиническими отчётами и получил пусто/ошибку. См. src/dev/HotelReportsPage.tsx.
 * Признак — useIsVivaActive (реальный vertical "hotel" из /auth/me/ ИЛИ
 * старый мок-переключатель, пока миграция экранов не завершена).
 * Отдельный файл, а не правка index.ts, — тот остаётся простым реэкспортом.
 *
 * Право тоже своё у каждой ветки: отчёты отеля бэк отдаёт по
 * hotel.reports.view, клиничные — по reports.view. Один общий guard на
 * маршруте пускал бы горничную с reports.view в пустой отказ API.
 */
const ReportsRouter: React.FC = () => {
  const vivaActive = useIsVivaActive();
  if (vivaActive) {
    return (
      <RequirePermission permission={PAGE_PERMISSIONS.hotelReports}>
        <Suspense fallback={<LinearProgress />}>
          <HotelReportsPage />
        </Suspense>
      </RequirePermission>
    );
  }
  return (
    <RequirePermission permission={PAGE_PERMISSIONS.reports}>
      <Suspense fallback={<LinearProgress />}>
        <DjangoReportsPage />
      </Suspense>
    </RequirePermission>
  );
};

export default ReportsRouter;
