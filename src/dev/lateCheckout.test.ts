import { describe, expect, it } from "vitest";

import { isLateCheckoutCharge, lastNightPrice, lateCheckoutChargeName, lateCheckoutFee, lateCheckoutPresets } from "./lateCheckout";

describe("lateCheckoutFee", () => {
  it("до 5 часов после выезда по правилам — половина ночи", () => {
    expect(lateCheckoutFee("12:00", "16:00", 1800)).toEqual({ minutesLate: 240, share: 0.5, amount: 900 });
    expect(lateCheckoutFee("12:00", "17:00", 1800)).toMatchObject({ share: 0.5, amount: 900 });
  });

  it("позже 5 часов — полная ночь", () => {
    expect(lateCheckoutFee("12:00", "17:01", 1800)).toMatchObject({ share: 1, amount: 1800 });
    expect(lateCheckoutFee("12:00", "20:00", 2500)).toMatchObject({ share: 1, amount: 2500 });
  });

  it("не позже правила — не поздний выезд", () => {
    expect(lateCheckoutFee("12:00", "12:00", 1800)).toMatchObject({ share: 0, amount: 0 });
    expect(lateCheckoutFee("12:00", "11:00", 1800)).toMatchObject({ share: 0, amount: 0 });
  });

  it("правило с секундами, как его отдаёт сервер; копейки округляются", () => {
    expect(lateCheckoutFee("12:00:00", "15:30", 1333.33)).toMatchObject({ share: 0.5, amount: 666.67 });
  });
});

describe("lastNightPrice", () => {
  it("последняя ночь после скидки, ночи в любом порядке", () => {
    const item = {
      checkIn: "2026-10-06",
      checkOut: "2026-10-08",
      totalAmount: "3700.00",
      nights: [
        { date: "2026-10-07", price: "2000.00", discount: "100.00" },
        { date: "2026-10-06", price: "1800.00", discount: "0.00" },
      ],
    } as Parameters<typeof lastNightPrice>[0];
    expect(lastNightPrice(item)).toBe(1900);
  });

  it("ночей нет — сумма номера на число ночей", () => {
    expect(lastNightPrice({ checkIn: "2026-10-06", checkOut: "2026-10-09", totalAmount: "5400.00", nights: [] } as Parameters<typeof lastNightPrice>[0])).toBe(1800);
  });
});

describe("строка счёта", () => {
  it("название и поиск начисленного", () => {
    expect(lateCheckoutChargeName("16:00")).toBe("Поздний выезд до 16:00");
    expect(isLateCheckoutCharge({ name: "Поздний выезд до 16:00", voidedAt: null })).toBe(true);
    expect(isLateCheckoutCharge({ name: "Поздний выезд до 16:00", voidedAt: "2026-10-08T10:00:00Z" })).toBe(false);
    expect(isLateCheckoutCharge({ name: "Завтрак", voidedAt: null })).toBe(false);
  });
});

describe("lateCheckoutPresets", () => {
  it("каждый час до +6 ч", () => {
    expect(lateCheckoutPresets("12:00")).toEqual(["13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]);
  });

  it("не переходит через полночь", () => {
    expect(lateCheckoutPresets("21:00")).toEqual(["22:00", "23:00"]);
  });
});
