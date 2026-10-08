import { describe, expect, it } from "vitest";

import type { HotelCharge } from "../api/hotel";
import { buildDayRows, chargesOfService, defaultQuantity, isBreakfastName, planDayChanges, rowsTotal, stayDates } from "./serviceByDays";

const item = { checkIn: "2026-10-06", checkOut: "2026-10-09", adults: 2, children: 1 };
const breakfast = { id: 7, name: "Завтрак" };

const charge = (over: Partial<HotelCharge>): HotelCharge => ({
  id: 1,
  reservationId: 1,
  serviceId: 7,
  name: "Завтрак",
  quantity: "3",
  price: "300.00",
  totalAmount: "900.00",
  date: "2026-10-07",
  comment: "",
  createdById: null,
  createdByName: "",
  createdAt: "2026-10-06T10:00:00Z",
  voidedAt: null,
  voidedById: null,
  voidedByName: "",
  ...over,
});

describe("даты и количество", () => {
  it("все даты от заезда до выезда включительно", () => {
    expect(stayDates([item])).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });

  it("завтрак — утро после ночи, прочее — дни ночёвки", () => {
    expect(isBreakfastName("Завтрак шведский стол")).toBe(true);
    expect(defaultQuantity([item], "2026-10-06", true, "perGuest")).toBe(0);
    expect(defaultQuantity([item], "2026-10-09", true, "perGuest")).toBe(3);
    expect(defaultQuantity([item], "2026-10-06", false, "perGuest")).toBe(3);
    expect(defaultQuantity([item], "2026-10-09", false, "perGuest")).toBe(0);
    expect(defaultQuantity([item, { ...item, adults: 1, children: 0 }], "2026-10-07", true, "perRoom")).toBe(2);
  });
});

describe("buildDayRows", () => {
  it("новая услуга: завтрак включён со второго дня по день выезда, на всех гостей", () => {
    const rows = buildDayRows([item], [], { breakfast: true, pace: "perGuest", price: 300 });
    expect(rows.map((r) => [r.date, r.enabled, r.quantity])).toEqual([
      ["2026-10-06", false, "1"],
      ["2026-10-07", true, "3"],
      ["2026-10-08", true, "3"],
      ["2026-10-09", true, "3"],
    ]);
    expect(rowsTotal(rows)).toBe(2700);
  });

  it("услуга уже в счёте: начисленные дни — как есть, прочие выключены", () => {
    const existing = chargesOfService([charge({ id: 11 }), charge({ id: 12, date: "2026-10-08", quantity: "2" }), charge({ id: 13, voidedAt: "x" })], breakfast);
    const rows = buildDayRows([item], existing, { breakfast: true, pace: "perGuest", price: 300 });
    expect(rows.map((r) => [r.date, r.enabled, r.quantity, r.chargeIds])).toEqual([
      ["2026-10-06", false, "1", []],
      ["2026-10-07", true, "3", [11]],
      ["2026-10-08", true, "2", [12]],
      ["2026-10-09", false, "3", []],
    ]);
  });
});

describe("planDayChanges", () => {
  it("выключить, поменять, добавить, не трогать", () => {
    const existing = chargesOfService([charge({ id: 11 }), charge({ id: 12, date: "2026-10-08" })], breakfast);
    const rows = buildDayRows([item], existing, { breakfast: true, pace: "perGuest", price: 300 });
    rows[1] = { ...rows[1], enabled: false }; // 07 — убрать
    rows[2] = { ...rows[2], price: "250" }; // 08 — новая цена
    rows[3] = { ...rows[3], enabled: true }; // 09 — добавить
    expect(planDayChanges(rows)).toEqual({
      voidIds: [11, 12],
      add: [
        { date: "2026-10-08", price: 250, quantity: 3 },
        { date: "2026-10-09", price: 300, quantity: 3 },
      ],
    });
  });

  it("ничего не меняли — пустой план", () => {
    const existing = chargesOfService([charge({ id: 11 })], breakfast);
    expect(planDayChanges(buildDayRows([item], existing, { breakfast: true, pace: "perGuest", price: 300 }))).toEqual({ voidIds: [], add: [] });
  });

  it("две строки на один день сводятся в одну", () => {
    const existing = chargesOfService([charge({ id: 11, quantity: "1", totalAmount: "300.00" }), charge({ id: 12, quantity: "2", totalAmount: "600.00" })], breakfast);
    const rows = buildDayRows([item], existing, { breakfast: true, pace: "perGuest", price: 300 });
    expect(rows[1]).toMatchObject({ quantity: "3", price: "300", chargeIds: [11, 12] });
    expect(planDayChanges(rows)).toEqual({ voidIds: [11, 12], add: [{ date: "2026-10-07", price: 300, quantity: 3 }] });
  });
});
