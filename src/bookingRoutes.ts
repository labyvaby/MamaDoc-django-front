import { matchPath } from "react-router";

export const BOOKING_ROUTES = {
  specialties: "/book",
  doctors: "/book/doctors",
  doctor: "/book/doctor/:idOrSlug",
  myBookings: "/book/me",
  booking: "/book/b/:code",
  payment: "/book/payment/result",
} as const;

/** Keep /bookings, other staff pages and unknown URLs on the existing CRM router. */
export function isBookingRoute(pathname: string): boolean {
  return Object.values(BOOKING_ROUTES).some((path) => matchPath(path, pathname) !== null);
}
