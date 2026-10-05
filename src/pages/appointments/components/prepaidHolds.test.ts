import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import type { BookingListItem } from "../../../api/bookings";
import { prepaidHoldsFromBookings, withHoldIntervals } from "./prepaidHolds";

const DAY = "2026-10-06";

const booking = (patch: Partial<BookingListItem>): BookingListItem => ({
  id: 1,
  operatorBookingId: "public-x",
  confirmationCode: "ABC",
  patientName: "Иванова Анна",
  patientPhone: "+996555000000",
  doctorName: "Доктор",
  doctorId: 7,
  date: DAY,
  time: "10:00",
  status: "pending",
  source: "public",
  totalPrice: "1000.00",
  totalDurationMin: 60,
  appointmentId: null,
  prepaymentStatus: "paid",
  prepaymentAmount: "500.00",
  ...patch,
});

describe("prepaidHoldsFromBookings", () => {
  it("оплаченная бронь без приёма держит время на свою длительность", () => {
    const [hold] = prepaidHoldsFromBookings([booking({})], DAY);
    expect(hold.timeStr).toBe("10:00");
    expect(hold.end - hold.start).toBe(60 * 60 * 1000);
  });

  it("бронь, которая ещё ждёт оплаты, не показывается и время не держит", () => {
    const awaiting = booking({
      status: "awaiting_payment",
      prepaymentStatus: "pending",
      prepaymentExpiresAt: dayjs(`${DAY}T10:00`).toISOString(),
    });
    expect(prepaidHoldsFromBookings([awaiting], DAY)).toEqual([]);
  });

  it("пропускает брони без предоплаты, с приёмом, снятые, без врача и другого дня", () => {
    const list = [
      booking({ id: 1, prepaymentStatus: null }),
      booking({ id: 2, appointmentId: 99 }),
      booking({ id: 3, status: "cancelled" }),
      booking({ id: 4, prepaymentStatus: "expired" }),
      booking({ id: 5, doctorId: null }),
      booking({ id: 6, date: "2026-10-07" }),
    ];
    expect(prepaidHoldsFromBookings(list, DAY)).toEqual([]);
  });

  it("без длительности держит слот по умолчанию", () => {
    const [hold] = prepaidHoldsFromBookings([booking({ totalDurationMin: 0 })], DAY);
    expect(hold.end - hold.start).toBe(30 * 60 * 1000);
  });
});

describe("withHoldIntervals", () => {
  it("добавляет интервал брони к занятости врача, не трогая исходную карту", () => {
    const base = new Map([[7, [{ start: 1, end: 2 }]]]);
    const holds = prepaidHoldsFromBookings([booking({})], DAY);
    const merged = withHoldIntervals(base, holds);
    expect(merged.get(7)).toHaveLength(2);
    expect(base.get(7)).toHaveLength(1);
  });
});
