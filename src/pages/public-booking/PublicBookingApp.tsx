import { lazy, Suspense } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import { Route, Routes, useParams } from "react-router";
import "../../i18n";
import { BOOKING_ROUTES } from "../../bookingRoutes";
import { PatientSessionProvider } from "./PatientSession";
import { useBookingOrgSlug } from "./orgSlug";
import { useBookingOrg } from "./useBookingOrg";
import { PublicVerticalProvider } from "../../i18n/context";

const SpecialtiesPage = lazy(() => import("./SpecialtiesPage"));
const DoctorsPage = lazy(() => import("./DoctorsPage"));
const DoctorPage = lazy(() => import("./DoctorBookingPage"));
const MyBookingsPage = lazy(() => import("./MyBookingsPage"));
const BookingPage = lazy(() => import("./BookingByCodePage"));
const PaymentPage = lazy(() => import("./PaymentResultPage"));

function DoctorRoute() {
  const { idOrSlug } = useParams();
  const orgSlug = useBookingOrgSlug();
  return <DoctorPage key={`${orgSlug}:${idOrSlug}`} />;
}

/** Public booking keeps its patient session without mounting CRM providers/prefetch. */
export default function PublicBookingApp() {
  const { organization } = useBookingOrg();
  return (
    <PublicVerticalProvider vertical={organization?.vertical}>
    <PatientSessionProvider>
      <Suspense fallback={<LinearProgress />}>
        <Routes>
          <Route path={BOOKING_ROUTES.specialties} element={<SpecialtiesPage />} />
          <Route path={BOOKING_ROUTES.doctors} element={<DoctorsPage />} />
          <Route path={BOOKING_ROUTES.doctor} element={<DoctorRoute />} />
          <Route path={BOOKING_ROUTES.myBookings} element={<MyBookingsPage />} />
          <Route path={BOOKING_ROUTES.booking} element={<BookingPage />} />
          <Route path={BOOKING_ROUTES.payment} element={<PaymentPage />} />
        </Routes>
      </Suspense>
    </PatientSessionProvider>
    </PublicVerticalProvider>
  );
}
