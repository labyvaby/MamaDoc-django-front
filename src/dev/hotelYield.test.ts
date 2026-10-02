import { describe, expect, it } from "vitest";

import type { HotelReservation } from "../api/hotel";
import {
  computeYield,
  factsFromReservations,
  inventoryFromRooms,
  lastYearPeriod,
  previousPeriod,
  summarizeYield,
  type YieldFact,
  type YieldInventory,
  type YieldRoom,
} from "./hotelYield";

const rooms: YieldRoom[] = [
  { id: 1, roomTypeId: 10, roomTypeName: "Standard", active: true },
  { id: 2, roomTypeId: 10, roomTypeName: "Standard", active: true },
  { id: 3, roomTypeId: 20, roomTypeName: "Люкс", active: true },
  { id: 4, roomTypeId: 20, roomTypeName: "Люкс", active: false },
];

const stay = (id: number, roomTypeId: number, checkIn: string, nights: [string, number][], over: Partial<HotelReservation> = {}): HotelReservation =>
  ({
    id,
    status: "confirmed",
    source: "direct",
    items: [
      {
        id,
        roomTypeId,
        checkIn,
        checkOut: nights.length ? nights[nights.length - 1][0] : checkIn,
        adults: 2,
        children: 1,
        isActive: true,
        nights: nights.map(([date, price]) => ({ date, price: String(price), ratePlanName: "" })),
      },
    ],
    ...over,
  }) as unknown as HotelReservation;

const reservations = [
  stay(1, 10, "2026-09-30", [["2026-09-30", 3000], ["2026-10-01", 3000]]),
  stay(2, 20, "2026-10-01", [["2026-10-01", 7000], ["2026-10-02", 7000]], { source: "ota" }),
  stay(3, 10, "2026-10-02", [["2026-10-02", 3500]], { status: "cancelled" }),
];

describe("computeYield", () => {
  it("по дням: продано, доход, заезды, доступно, ADR, RevPAR и загрузка", () => {
    const y = computeYield({ reservations, rooms, from: "2026-10-01", to: "2026-10-02", group: "day" });
    expect(y.days.map((d) => [d.key, d.sold, d.revenue, d.roomsArrived, d.guestsArrived, d.available, d.adr, d.revpar, d.occupancy])).toEqual([
      ["2026-10-01", 2, 10000, 1, 3, 3, 5000, 3333.33, 66.67],
      ["2026-10-02", 1, 7000, 0, 0, 3, 7000, 2333.33, 33.33],
    ]);
    expect(y.total).toMatchObject({ sold: 3, revenue: 17000, available: 6, adr: 5666.67, occupancy: 50 });
  });

  it("по месяцам, категориям и источникам", () => {
    const y = computeYield({ reservations, rooms, from: "2026-09-30", to: "2026-10-02", group: "month", roomTypeIds: new Set([10]) });
    expect(y.rows.map((r) => [r.key, r.sold, r.revenue, r.available])).toEqual([
      ["2026-09", 1, 3000, 2],
      ["2026-10", 1, 3000, 4],
    ]);
    expect(y.byCategory.map((c) => [c.name, c.sold, c.revenue])).toEqual([["Standard", 2, 6000]]);
    const ota = computeYield({ reservations, rooms, from: "2026-10-01", to: "2026-10-02", group: "day", sources: new Set(["ota"]) });
    expect(ota.total.revenue).toBe(14000);
  });

  it("средние по дням недели и недели с понедельника", () => {
    const y = computeYield({ reservations, rooms, from: "2026-09-28", to: "2026-10-04", group: "week" });
    expect(y.rows.map((r) => r.key)).toEqual(["2026-09-28"]);
    // 1 октября 2026 — четверг (индекс 3).
    expect(y.byWeekday[3]).toMatchObject({ weekday: 3, days: 1, sold: 2, revenue: 10000 });
  });
});

describe("summarizeYield — факты с сервера", () => {
  it("брони → факты + фонд дают то же, что computeYield", () => {
    const opts = { from: "2026-09-28", to: "2026-10-04", group: "week" as const };
    const viaFacts = summarizeYield({
      ...opts,
      facts: factsFromReservations(reservations, opts.from, opts.to),
      inventory: inventoryFromRooms(rooms, opts.from, opts.to),
      names: new Map(rooms.map((r) => [r.roomTypeId, r.roomTypeName])),
    });
    expect(viaFacts).toEqual(computeYield({ reservations, rooms, ...opts }));
  });

  it("номер на ремонте в один день уменьшает «доступно» только в этот день; каналы и названия — от сервера", () => {
    const facts: YieldFact[] = [
      { date: "2026-10-01", roomTypeId: 10, source: "booking", sold: 1, revenue: 3600, roomsArrived: 1, guestsArrived: 2 },
      { date: "2026-10-01", roomTypeId: 10, source: "direct", sold: 1, revenue: 3000, roomsArrived: 0, guestsArrived: 0 },
      { date: "2026-10-02", roomTypeId: 10, source: "booking", sold: 1, revenue: 3600, roomsArrived: 0, guestsArrived: 0 },
    ];
    const inventory: YieldInventory[] = [
      { date: "2026-10-01", roomTypeId: 10, available: 2 },
      { date: "2026-10-02", roomTypeId: 10, available: 1 },
    ];
    const y = summarizeYield({ facts, inventory, names: new Map([[10, "Стандарт"]]), from: "2026-10-01", to: "2026-10-02", group: "day" });
    expect(y.days.map((d) => [d.key, d.sold, d.available, d.occupancy])).toEqual([
      ["2026-10-01", 2, 2, 100],
      ["2026-10-02", 1, 1, 100],
    ]);
    expect(y.byCategory).toMatchObject([{ name: "Стандарт", sold: 3, available: 3, revenue: 10200 }]);
    const booking = summarizeYield({ facts, inventory, names: new Map(), from: "2026-10-01", to: "2026-10-02", group: "month", sources: new Set(["booking"]) });
    expect(booking.total).toMatchObject({ sold: 2, revenue: 7200, adr: 3600, available: 3 });
    expect(booking.byCategory[0].name).toBe("Категория 10");
  });
});

describe("периоды сравнения", () => {
  it("прошлый период той же длины и тот же период год назад", () => {
    expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(lastYearPeriod("2026-10-01", "2026-10-31")).toEqual({ from: "2025-10-01", to: "2025-10-31" });
  });
});
