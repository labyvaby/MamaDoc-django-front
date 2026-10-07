import { describe, expect, it } from "vitest";

import type { HotelPriceNight } from "../api/hotel";
import { cellKey, planBulkChanges, type BulkSettings } from "./priceBulkPlan";

const night = (date: string, price: number): HotelPriceNight => ({
  date,
  basePrice: "3500",
  barPrice: "3500",
  price: String(price),
  isManualOverride: false,
  manualPrice: null,
  overrideReason: "",
  overrideById: null,
  overrideByName: "",
  overrideAt: null,
  occupancy: "0",
  capacity: 3,
  occupied: 0,
  available: 3,
  stopSell: false,
  closedToArrival: false,
  closedToDeparture: false,
  minNights: null,
  maxNights: null,
  appliedRules: [],
});

// 1–7 октября 2026: чт, пт, сб, вс, пн, вт, ср.
const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];
const nights = new Map<string, HotelPriceNight>();
for (const rt of [1, 2]) for (const d of dates) nights.set(cellKey(rt, d), night(d, rt === 1 ? 3500 : 4000));

const base: BulkSettings = {
  roomTypeIds: [1, 2],
  weekdays: [true, true, true, true, true, true, true],
  price: { mode: "keep" },
  stopSell: "keep",
  minNights: { mode: "keep" },
  closedToArrival: "keep",
  closedToDeparture: "keep",
  reason: "",
};
const all = dates.flatMap((d) => [cellKey(1, d), cellKey(2, d)]);

describe("planBulkChanges", () => {
  it("своя цена по категориям — один вызов на непрерывный диапазон", () => {
    const plan = planBulkChanges({
      selection: all,
      nights,
      settings: { ...base, price: { mode: "set", byRoomType: { 1: 3800, 2: 4300 } }, reason: "Высокий сезон" },
      allCategories: false,
      today: "2026-10-01",
    });
    expect(plan.changes).toEqual([
      { roomTypeId: 1, dateFrom: "2026-10-01", dateTo: "2026-10-08", price: "3800.00", reason: "Высокий сезон" },
      { roomTypeId: 2, dateFrom: "2026-10-01", dateTo: "2026-10-08", price: "4300.00", reason: "Высокий сезон" },
    ]);
    expect(plan.nights).toBe(14);
    expect(plan.avgBefore).toBe(3750);
    expect(plan.avgAfter).toBe(4050);
  });

  it("только выходные: диапазоны рвутся по дням недели", () => {
    const plan = planBulkChanges({
      selection: all,
      nights,
      settings: { ...base, roomTypeIds: [1], weekdays: [false, false, false, false, true, true, true], price: { mode: "percent", value: 10, round: 10 } },
      allCategories: false,
      today: "2026-10-01",
    });
    // пт 2, сб 3, вс 4 — подряд одной ценой 3850.
    expect(plan.changes).toEqual([{ roomTypeId: 1, dateFrom: "2026-10-02", dateTo: "2026-10-05", price: "3850.00" }]);
  });

  it("прошедшие ночи не трогаем, стоп-продажа без цены", () => {
    const plan = planBulkChanges({
      selection: [cellKey(2, "2026-10-01"), cellKey(2, "2026-10-02"), cellKey(2, "2026-10-03")],
      nights,
      settings: { ...base, stopSell: "on", minNights: { mode: "set", value: 2 } },
      allCategories: false,
      today: "2026-10-02",
    });
    expect(plan.changes).toEqual([{ roomTypeId: 2, dateFrom: "2026-10-02", dateTo: "2026-10-04", stopSell: true, minNights: 2 }]);
    expect(plan.avgBefore).toBeNull();
  });

  it("«для всех категорий» берёт выбранные даты у каждой отмеченной категории", () => {
    const plan = planBulkChanges({
      selection: [cellKey(1, "2026-10-05"), cellKey(1, "2026-10-06")],
      nights,
      settings: { ...base, price: { mode: "amount", value: -500, round: 1 } },
      allCategories: true,
      today: "2026-10-01",
    });
    expect(plan.changes).toEqual([
      { roomTypeId: 1, dateFrom: "2026-10-05", dateTo: "2026-10-07", price: "3000.00" },
      { roomTypeId: 2, dateFrom: "2026-10-05", dateTo: "2026-10-07", price: "3500.00" },
    ]);
  });

  it("закрытия для заезда и выезда, максимум ночей — одним диапазоном", () => {
    const plan = planBulkChanges({
      selection: [cellKey(1, "2026-10-02"), cellKey(1, "2026-10-03")],
      nights,
      settings: { ...base, closedToArrival: "on", closedToDeparture: "off", maxNights: { mode: "set", value: 4 }, minNights: { mode: "set", value: 1 } },
      allCategories: false,
      today: "2026-10-01",
    });
    expect(plan.changes).toEqual([
      { roomTypeId: 1, dateFrom: "2026-10-02", dateTo: "2026-10-04", closedToArrival: true, closedToDeparture: false, minNights: 1, maxNights: 4 },
    ]);
  });

  it("«убрать максимум» шлёт clearMaxNights, «как есть» ничего не добавляет", () => {
    const cleared = planBulkChanges({
      selection: [cellKey(1, "2026-10-02")],
      nights,
      settings: { ...base, maxNights: { mode: "clear" } },
      allCategories: false,
      today: "2026-10-01",
    });
    expect(cleared.changes).toEqual([{ roomTypeId: 1, dateFrom: "2026-10-02", dateTo: "2026-10-03", clearMaxNights: true }]);
    const kept = planBulkChanges({ selection: [cellKey(1, "2026-10-02")], nights, settings: { ...base, maxNights: { mode: "keep" } }, allCategories: false, today: "2026-10-01" });
    expect(kept.changes).toEqual([]);
  });

  it("авторасчёт и ничего не выбрано", () => {
    const auto = planBulkChanges({ selection: [cellKey(1, "2026-10-03")], nights, settings: { ...base, price: { mode: "auto" } }, allCategories: false, today: "2026-10-01" });
    expect(auto.changes).toEqual([{ roomTypeId: 1, dateFrom: "2026-10-03", dateTo: "2026-10-04", clearPrice: true }]);
    const none = planBulkChanges({ selection: all, nights, settings: base, allCategories: false, today: "2026-10-01" });
    expect(none.changes).toEqual([]);
  });
});
