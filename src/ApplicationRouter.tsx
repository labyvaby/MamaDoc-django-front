import { lazy, Suspense } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import { useLocation } from "react-router";
import { isBookingRoute } from "./bookingRoutes";

const CrmApp = lazy(() => import("./App"));
const BookingApp = lazy(() => import("./pages/public-booking/PublicBookingApp"));

export function ApplicationRouter() {
  const { pathname } = useLocation();
  return (
    <Suspense fallback={<LinearProgress />}>
      {isBookingRoute(pathname) ? <BookingApp /> : <CrmApp />}
    </Suspense>
  );
}
