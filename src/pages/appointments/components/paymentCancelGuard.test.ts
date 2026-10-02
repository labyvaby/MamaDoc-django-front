import { describe, expect, it } from "vitest";
import {
  appointmentNetPaid,
  isAppointmentClosedForPayment,
  isCancelBlockedByPayment,
} from "./paymentCancelGuard";

describe("paymentCancelGuard", () => {
  it("неоплаченный приём можно отменить", () => {
    expect(isCancelBlockedByPayment({ paidTotal: "0.00", paymentStatus: "unpaid" })).toBe(false);
    expect(isCancelBlockedByPayment({})).toBe(false);
  });

  it("скидка 100% — 0 сом, отмена доступна", () => {
    expect(isCancelBlockedByPayment({ paidTotal: "0.00", paymentStatus: "discounted" })).toBe(false);
  });

  it("оплаченный приём отменить нельзя", () => {
    expect(isCancelBlockedByPayment({ paidTotal: "1500.00", paymentStatus: "paid" })).toBe(true);
    expect(isCancelBlockedByPayment({ paidTotal: "500.00", paymentStatus: "partial" })).toBe(true);
  });

  it("полный возврат открывает отмену", () => {
    expect(isCancelBlockedByPayment({ paidTotal: "1500.00", paymentStatus: "refunded" })).toBe(false);
    expect(
      isCancelBlockedByPayment({ paidTotal: "1500.00", refundedTotal: "1500.00", paymentStatus: "paid" }),
    ).toBe(false);
    expect(isCancelBlockedByPayment({ paidTotal: "1500.00", paidNet: "0.00" })).toBe(false);
  });

  it("частичный возврат — отмена ещё закрыта", () => {
    expect(appointmentNetPaid({ paidTotal: "1500.00", refundedTotal: "500.00" })).toBe(1000);
    expect(isCancelBlockedByPayment({ paidTotal: "1500.00", paidNet: "1000.00" })).toBe(true);
  });

  it("на отменённом приёме и неявке оплату не принимают", () => {
    expect(isAppointmentClosedForPayment("canceled")).toBe(true);
    expect(isAppointmentClosedForPayment("cancelled")).toBe(true);
    expect(isAppointmentClosedForPayment("no_show")).toBe(true);
    expect(isAppointmentClosedForPayment("scheduled")).toBe(false);
    expect(isAppointmentClosedForPayment(undefined)).toBe(false);
  });
});
