import { describe, expect, it } from "vitest";

import type { HotelReservation } from "../api/hotel";
import { inHouseCounts, isGuestDebt, isNoShowCandidate, isStayingOn } from "./hotelInHouse";

const TODAY = "2026-10-03";

type Stay = "expected" | "checked_in" | "checked_out";

const item = (checkIn: string, checkOut: string, stayStatus: Stay, guests = 2) => ({
  checkIn,
  checkOut,
  stayStatus,
  isActive: true,
  adults: guests - 1,
  children: 1,
});

const booking = (items: ReturnType<typeof item>[], over: Partial<HotelReservation> = {}): HotelReservation =>
  ({ id: 1, status: "confirmed", balanceDue: "0", items, ...over }) as unknown as HotelReservation;

describe("isStayingOn", () => {
  it("сегодня проживает только заселённый; незаезд — нет", () => {
    expect(isStayingOn(item("2026-10-03", "2026-10-06", "checked_in"), TODAY, TODAY)).toBe(true);
    expect(isStayingOn(item("2026-10-02", "2026-10-05", "expected"), TODAY, TODAY)).toBe(false);
    expect(isStayingOn(item("2026-10-03", "2026-10-05", "expected"), TODAY, TODAY)).toBe(false);
    expect(isStayingOn(item("2026-10-01", "2026-10-03", "checked_in"), TODAY, TODAY)).toBe(false);
  });

  it("в будущем — заселённые и ещё не прошедшие заезды; в прошлом — по факту", () => {
    expect(isStayingOn(item("2026-10-05", "2026-10-07", "expected"), "2026-10-05", TODAY)).toBe(true);
    expect(isStayingOn(item("2026-10-02", "2026-10-07", "expected"), "2026-10-05", TODAY)).toBe(false);
    expect(isStayingOn(item("2026-10-01", "2026-10-03", "checked_out"), "2026-10-02", TODAY)).toBe(true);
    expect(isStayingOn(item("2026-10-01", "2026-10-03", "expected"), "2026-10-02", TODAY)).toBe(false);
  });
});

describe("inHouseCounts", () => {
  it("люди и номера по одному правилу, незаезды отдельно, отменённые не считаются", () => {
    const counts = inHouseCounts(
      [
        booking([item("2026-10-03", "2026-10-06", "checked_in", 1)]),
        booking([item("2026-10-02", "2026-10-05", "expected", 2)]),
        booking([item("2026-10-01", "2026-10-05", "checked_in", 3), item("2026-10-01", "2026-10-05", "checked_in", 2)]),
        booking([item("2026-10-02", "2026-10-05", "checked_in", 2)], { status: "cancelled" }),
      ],
      TODAY,
      TODAY,
    );
    expect(counts).toEqual({ rooms: 3, guests: 6, reservations: 2, missedRooms: 1, missedGuests: 2 });
  });
});

describe("незаезд — не долг", () => {
  it("кандидат в незаезд: все номера ждут, а заезд прошёл", () => {
    expect(isNoShowCandidate(booking([item("2026-10-02", "2026-10-05", "expected")]), TODAY)).toBe(true);
    expect(isNoShowCandidate(booking([item("2026-10-03", "2026-10-05", "expected")]), TODAY)).toBe(false);
    expect(isNoShowCandidate(booking([item("2026-10-02", "2026-10-05", "checked_in")]), TODAY)).toBe(false);
    expect(isNoShowCandidate(booking([item("2026-10-02", "2026-10-05", "expected")], { status: "no_show" }), TODAY)).toBe(false);
  });

  it("долг только у заехавших", () => {
    expect(isGuestDebt(booking([item("2026-10-02", "2026-10-05", "expected")], { balanceDue: "5400" }))).toBe(false);
    expect(isGuestDebt(booking([item("2026-10-02", "2026-10-05", "checked_in")], { balanceDue: "5400" }))).toBe(true);
    expect(isGuestDebt(booking([item("2026-10-02", "2026-10-03", "checked_out")], { balanceDue: "100" }))).toBe(true);
    expect(isGuestDebt(booking([item("2026-10-02", "2026-10-05", "checked_in")], { balanceDue: "0" }))).toBe(false);
  });
});
