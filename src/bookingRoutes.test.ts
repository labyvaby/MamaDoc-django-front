import { describe, expect, it } from "vitest";
import { isBookingRoute } from "./bookingRoutes";

describe("public booking bootstrap boundaries", () => {
  it.each(["/book", "/book/", "/book/doctors", "/book/doctor/54", "/book/doctor/doctor-slug",
    "/book/me", "/book/b/code-123", "/book/payment/result", "/BOOK/DOCTORS"])(
    "uses the public application for %s", (path) => { expect(isBookingRoute(path)).toBe(true); },
  );
  it.each(["/", "/bookings", "/bookings/show/1", "/login", "/appointments", "/settings",
    "/site/klinika-21", "/book/unknown", "/book/doctor/54/extra", "/books"])(
    "preserves the CRM router for %s", (path) => { expect(isBookingRoute(path)).toBe(false); },
  );
});
