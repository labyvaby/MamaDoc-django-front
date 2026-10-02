import { describe, expect, it } from "vitest";

import { applyDemoPricing, distributeTotal, manualTotalIgnored } from "./priceOverrideDemo";

describe("distributeTotal", () => {
  it("поровну по ночам, остаток — на последнюю", () => {
    expect(distributeTotal(7000, ["2026-10-02", "2026-10-03", "2026-10-04"])).toEqual({ "2026-10-02": 2333.33, "2026-10-03": 2333.33, "2026-10-04": 2333.34 });
    expect(distributeTotal(5000, [])).toEqual({});
  });
});

describe("manualTotalIgnored", () => {
  const nights = (isManual?: boolean) => [{ isManual }, { isManual }];
  it("сервер пропустил поле — сумма расчётная, ночи без isManual", () => {
    expect(manualTotalIgnored({ totalAmount: "5400.00", nights: nights() }, 5000)).toBe(true);
  });
  it("сервер применил — ночи с isManual или сумма совпала", () => {
    expect(manualTotalIgnored({ totalAmount: "5000.00", nights: nights(true) }, 5000)).toBe(false);
    expect(manualTotalIgnored({ totalAmount: "5000.00", nights: nights() }, 5000)).toBe(false);
  });
});

describe("applyDemoPricing", () => {
  const nights = [
    { date: "2026-10-02", price: "1800", ratePlanName: "" },
    { date: "2026-10-03", price: "1800", ratePlanName: "" },
  ];

  it("своя цена ночи и скидка поверх серверной", () => {
    const shown = applyDemoPricing(nights, { nights: { "2026-10-03": 1500 }, discountPercent: 10, reason: "постоянный гость", at: "" });
    expect(shown.map((n) => [n.date, n.price, n.basePrice, n.isManual, n.discount, n.demo])).toEqual([
      ["2026-10-02", "1800", undefined, undefined, "180", true],
      ["2026-10-03", "1500", "1800", true, "150", true],
    ]);
  });

  it("без демо-цены — ночи как есть", () => {
    expect(applyDemoPricing(nights, undefined)).toBe(nights);
  });
});
