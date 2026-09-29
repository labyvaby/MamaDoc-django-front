import React, { lazy, Suspense } from "react";
import { LinearProgress } from "@mui/material";

import { useIsVivaActive } from "../../dev/mockDemoData";

/**
 * /schedule — одна страница меню, две разные по сути: у клиники расписание
 * смен персонала, у отеля (Viva) «Бронирования» с шахматкой номеров. Раньше
 * отель ходил в клиничную страницу, и та тянула запросы смен и сотрудников,
 * которые отелю не нужны. Выбор — здесь, до монтирования: каждая вертикаль
 * получает только свой код и свои запросы (тот же приём, что ReportsRouter).
 * Права проверяет RequirePermission на маршруте (он же ждёт /auth/me/, так
 * что вертикаль к этому моменту известна).
 */
const ClinicSchedulePage = lazy(() => import("./django"));
const HotelBookingsPage = lazy(() => import("../../dev/HotelBookingsPage"));

const ScheduleRouter: React.FC = () => {
  const vivaActive = useIsVivaActive();
  return <Suspense fallback={<LinearProgress />}>{vivaActive ? <HotelBookingsPage /> : <ClinicSchedulePage />}</Suspense>;
};

export default ScheduleRouter;
