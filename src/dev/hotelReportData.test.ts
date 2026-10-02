import { describe, expect, it } from "vitest";

import type { Expense } from "../api/expenses";
import type { HotelPayment, HotelReservation } from "../api/hotel";
import {
  balanceRows,
  balanceTotals,
  breakfastCount,
  dailySeries,
  deltaPercent,
  inWindow,
  revenueByCategory,
  shiftWindow,
  summarizeExpenses,
  summarizePayments,
} from "./hotelReportData";

type Item = HotelReservation["items"][number];

const item = (over: Partial<Item> = {}): Item => ({
  id: 1,
  roomTypeId: 10,
  roomTypeName: "Standard",
  roomId: 1,
  roomNumber: "101",
  ratePlanId: null,
  ratePlanName: null,
  checkIn: "2026-10-01",
  checkOut: "2026-10-03",
  nightsCount: 2,
  adults: 2,
  children: 0,
  boardType: "breakfast",
  isOverbooking: false,
  totalAmount: "6000",
  stayStatus: "expected",
  isActive: true,
  checkedInAt: null,
  checkedOutAt: null,
  guests: [],
  nights: [
    { date: "2026-10-01", price: "3000", ratePlanName: "" },
    { date: "2026-10-02", price: "3000", ratePlanName: "" },
  ],
  ...over,
});

const reservation = (over: Partial<HotelReservation> = {}): HotelReservation => ({
  id: 1,
  number: 1,
  propertyId: 7,
  status: "confirmed",
  source: "direct",
  externalId: "",
  customerId: null,
  customerName: "Асан Асанов",
  currency: "KGS",
  totalAmount: "6000",
  expiresAt: null,
  cancellationPolicy: "",
  guestComment: "",
  internalNote: "",
  guaranteeMethod: "",
  companyInfo: "",
  dataConsent: true,
  paidAmount: "2000",
  balanceDue: "4000",
  cancelledAt: null,
  cancelReason: "",
  version: 1,
  checkIn: "2026-10-01",
  checkOut: "2026-10-03",
  items: [item()],
  createdById: null,
  createdByName: "",
  createdAt: "2026-09-20T10:00:00+06:00",
  updatedAt: "2026-09-20T10:00:00+06:00",
  ...over,
});

const payment = (over: Partial<HotelPayment> = {}): HotelPayment => ({
  id: 1,
  reservationId: 1,
  kind: "payment",
  method: "cash",
  methodLabel: "Наличные",
  amount: "1000",
  currency: "KGS",
  note: "",
  cashlessMethodId: null,
  cashlessMethodName: "",
  acceptedById: null,
  acceptedByName: "",
  acceptedAt: "2026-10-01T10:00:00+06:00",
  createdAt: "2026-10-01T10:00:00+06:00",
  ...over,
});

describe("dailySeries", () => {
  it("считает проданные номера и выручку по ценам ночей, только подтверждённые", () => {
    const series = dailySeries(
      [reservation(), reservation({ id: 2, status: "cancelled" })],
      "2026-09-30",
      "2026-10-02",
    );
    expect(series.map((p) => [p.date, p.soldRooms, p.revenue])).toEqual([
      ["2026-09-30", 0, 0],
      ["2026-10-01", 1, 3000],
      ["2026-10-02", 1, 3000],
    ]);
  });

  it("пропускает снятые с брони номера", () => {
    const series = dailySeries([reservation({ items: [item({ isActive: false })] })], "2026-10-01", "2026-10-01");
    expect(series[0].soldRooms).toBe(0);
  });
});

describe("revenueByCategory", () => {
  it("режет ночи по периоду и считает ADR", () => {
    const rows = revenueByCategory([reservation()], "2026-10-02", "2026-10-31");
    expect(rows).toEqual([{ key: "10", label: "Standard", nights: 1, revenue: 3000, adr: 3000, reservations: 1 }]);
  });
});

describe("balanceRows", () => {
  const list = [
    reservation(),
    reservation({ id: 2, number: 2, paidAmount: "6000", balanceDue: "0" }),
    reservation({ id: 3, number: 3, paidAmount: "7000", balanceDue: "-1000" }),
    reservation({ id: 4, number: 4, status: "cancelled" }),
    reservation({ id: 5, number: 5, checkIn: "2026-10-05", checkOut: "2026-10-06" }),
  ];

  it("фильтрует по дате заезда и статусу", () => {
    const rows = balanceRows(list, { from: "2026-10-01", to: "2026-10-02", balance: "all", status: "active" });
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("фильтр по балансу: долг, переплата, рассчитаны", () => {
    const base = { from: "2026-10-01", to: "2026-10-31", status: "active" as const };
    expect(balanceRows(list, { ...base, balance: "debt" }).map((r) => r.number)).toEqual([1, 5]);
    expect(balanceRows(list, { ...base, balance: "overpaid" }).map((r) => r.number)).toEqual([3]);
    expect(balanceRows(list, { ...base, balance: "settled" }).map((r) => r.number)).toEqual([2]);
  });

  it("итоги и ADR", () => {
    const rows = balanceRows(list, { from: "2026-10-01", to: "2026-10-02", balance: "all", status: "active" });
    expect(balanceTotals(rows)).toEqual({ total: 18000, paid: 15000, balance: 3000, nights: 6, adr: 3000 });
  });
});

describe("shiftWindow", () => {
  it("суточная смена с 09:00 захватывает утро следующего дня", () => {
    const w = shiftWindow("2026-10-01", 9);
    expect(inWindow("2026-10-01T08:59:00", w)).toBe(false);
    expect(inWindow("2026-10-01T09:00:00", w)).toBe(true);
    expect(inWindow("2026-10-02T08:59:00", w)).toBe(true);
    expect(inWindow("2026-10-02T09:00:00", w)).toBe(false);
  });
});

describe("summarizePayments", () => {
  it("наличные отдельно, безнал по терминалам, возвраты с минусом", () => {
    const s = summarizePayments([
      payment({ amount: "1000" }),
      payment({ id: 2, method: "card", methodLabel: "Карта", cashlessMethodName: "ККБ", amount: "11373" }),
      payment({ id: 3, method: "card", methodLabel: "Карта", cashlessMethodName: "МКасса", amount: "3000" }),
      payment({ id: 4, method: "card", methodLabel: "Карта", cashlessMethodName: "ККБ", amount: "4389" }),
      payment({ id: 5, kind: "refund", amount: "500" }),
    ]);
    expect(s.cash).toBe(500);
    expect(s.cashless).toBe(18762);
    expect(s.total).toBe(19262);
    expect(s.refunds).toBe(500);
    expect(s.byChannel).toEqual([
      { label: "ККБ", amount: 15762, count: 2 },
      { label: "МКасса", amount: 3000, count: 1 },
    ]);
  });
});

describe("summarizePayments — валюта в кассе", () => {
  it("наличные в валюте по метке демо-режима, возврат вычитается", () => {
    const s = summarizePayments([
      payment({ amount: "4372.50", note: "[USD 50 × 87.45] за проживание" }),
      payment({ id: 2, amount: "1012.00", note: "[EUR 10 × 101.2]" }),
      payment({ id: 3, kind: "refund", amount: "874.50", note: "[USD 10 × 87.45] ранний выезд" }),
      payment({ id: 4, method: "card", cashlessMethodName: "ККБ", amount: "874.50", note: "[USD 10 × 87.45]" }),
    ]);
    expect(s.foreignCash).toEqual([
      { currency: "USD", amount: 40 },
      { currency: "EUR", amount: 10 },
    ]);
  });
});

describe("summarizeExpenses", () => {
  const expense = (over: Partial<Expense>): Expense =>
    ({ id: 1, name: "", cashAmount: "0", cardAmount: "0", amount: "0", categoryName: "Закуп", isVoided: false, ...over }) as Expense;

  it("суммирует наличные и безнал, пропускает аннулированные", () => {
    const s = summarizeExpenses([
      expense({ cashAmount: "100", amount: "100", categoryName: "Продукты" }),
      expense({ id: 2, cashAmount: "3000", amount: "3000", categoryName: "Аванс" }),
      expense({ id: 3, cashAmount: "880", amount: "880", categoryName: "Продукты" }),
      expense({ id: 4, cashAmount: "999", amount: "999", isVoided: true }),
    ]);
    expect(s.cash).toBe(3980);
    expect(s.byCategory).toEqual([
      { label: "Аванс", amount: 3000 },
      { label: "Продукты", amount: 980 },
    ]);
  });
});

describe("breakfastCount", () => {
  it("завтраки утром — для тех, кто ночевал в ночь на дату", () => {
    const list = [
      reservation(),
      reservation({ id: 2, items: [item({ boardType: "none" })] }),
      reservation({ id: 3, items: [item({ checkIn: "2026-10-02", checkOut: "2026-10-04", adults: 1, children: 1 })] }),
    ];
    expect(breakfastCount(list, "2026-10-01")).toBe(0);
    expect(breakfastCount(list, "2026-10-02")).toBe(2);
    expect(breakfastCount(list, "2026-10-03")).toBe(4);
  });
});

describe("deltaPercent", () => {
  it("рост и падение в процентах, без базы — null", () => {
    expect(deltaPercent(120, 100)).toBe(20);
    expect(deltaPercent(75, 100)).toBe(-25);
    expect(deltaPercent(10, 0)).toBeNull();
  });
});
