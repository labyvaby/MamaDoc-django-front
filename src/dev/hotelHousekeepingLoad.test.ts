import { describe, expect, it } from "vitest";

import type { HotelReservation, HotelRoom, HotelStaffPost, HotelStaffShift } from "../api/hotel";
import { computeHousekeepingLoad } from "./hotelHousekeepingLoad";

const room = (id: number, floor: string) => ({ id, floor }) as HotelRoom;
const post = (id: number, floors: string[]): HotelStaffPost => ({
  id,
  propertyId: 7,
  name: `${floors[0]} этаж`,
  role: "housekeeping",
  floors,
  startTime: "09:00",
  hours: 12,
  rate: "2000.00",
  sortOrder: id,
  isActive: true,
});
const shift = (postId: number, date: string, employeeId: number, name: string): HotelStaffShift => ({
  id: Number(`${postId}${date.replace(/-/g, "")}`),
  propertyId: 7,
  postId,
  postName: "",
  role: "housekeeping",
  date,
  employeeId,
  employeeName: name,
  startsAt: `${date}T09:00:00+06:00`,
  endsAt: `${date}T21:00:00+06:00`,
  rate: "2000.00",
  status: "planned",
  note: "",
});
const stay = (roomId: number, checkIn: string, checkOut: string, status: HotelReservation["status"] = "confirmed") =>
  ({ id: roomId, status, items: [{ roomId, checkIn, checkOut, isActive: true }] }) as unknown as HotelReservation;

describe("computeHousekeepingLoad", () => {
  it("выезд и проживание на этаже поста — горничной этого поста в этот день", () => {
    const load = computeHousekeepingLoad({
      from: "2026-10-01",
      to: "2026-10-03",
      rooms: [room(1, "1"), room(2, "2")],
      posts: [post(10, ["1"]), post(20, ["2"])],
      shifts: [
        shift(10, "2026-10-01", 5, "Мунара"),
        shift(10, "2026-10-02", 5, "Мунара"),
        shift(10, "2026-10-03", 6, "Жанара"),
        shift(20, "2026-10-02", 7, "Айзат"),
      ],
      reservations: [stay(1, "2026-10-01", "2026-10-03"), stay(2, "2026-10-01", "2026-10-03"), stay(1, "2026-09-01", "2026-09-02", "cancelled")],
      names: new Map(),
    });
    expect(load.days).toEqual([
      { date: "2026-10-01", checkouts: 0, stayovers: 0, uncovered: 0 },
      { date: "2026-10-02", checkouts: 0, stayovers: 2, uncovered: 0 },
      { date: "2026-10-03", checkouts: 2, stayovers: 0, uncovered: 1 },
    ]);
    expect(load.people.map((p) => [p.name, p.shifts, p.checkouts, p.stayovers])).toEqual([
      ["Айзат", 1, 0, 1],
      ["Жанара", 1, 1, 0],
      ["Мунара", 2, 0, 1],
      ["Без горничной в графике", 0, 1, 0],
    ]);
    expect(load.totals).toEqual({ checkouts: 2, stayovers: 2, uncovered: 1 });
  });
});
