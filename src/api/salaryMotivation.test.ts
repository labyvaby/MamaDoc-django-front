import { describe, expect, it } from "vitest";

import { fromRawMotivation, schemeErrors, tierFor } from "./salaryMotivation";

const scheme = { tiers: [{ from: 100, pct: 1.5 }, { from: 80, pct: 1 }, { from: 120, pct: 2 }], teamBonus: 50_000, teamThreshold: 100 };

describe("tierFor", () => {
  it("последняя ступень, чей порог ≤ выполнения; ниже первой — нет премии", () => {
    expect(tierFor(scheme, 110.45)?.pct).toBe(1.5);
    expect(tierFor(scheme, 120)?.pct).toBe(2);
    expect(tierFor(scheme, 79.9)).toBeNull();
  });
});

describe("schemeErrors", () => {
  it("пороги должны строго расти, без минусов, хотя бы одна ступень", () => {
    expect(schemeErrors({ ...scheme, tiers: [...scheme.tiers].sort((a, b) => a.from - b.from) })).toEqual([]);
    expect(schemeErrors({ ...scheme, tiers: [{ from: 100, pct: 1 }, { from: 100, pct: 2 }] })).toEqual(["order"]);
    expect(schemeErrors({ ...scheme, tiers: [] })).toEqual(["noTiers"]);
    expect(schemeErrors({ ...scheme, teamBonus: -1 })).toContain("negative");
  });
});

describe("fromRawMotivation", () => {
  it("деньги строками, ступени по порядку, приказ объектом или null", () => {
    const s = fromRawMotivation({
      month: "2026-09",
      teamPlan: "96000000.00",
      teamFact: "93000000.00",
      teamPct: 96.88,
      bonusFund: "959000.00",
      approved: null,
      scheme: { tiers: [{ from: 120, pct: 2.0 }, { from: 80, pct: 1.0 }], teamBonus: "50000.00", teamThreshold: 100 },
      rows: [{ employeeId: 4, employeeName: "Игорь Ли", plan: "22000000.00", fact: "24300000.00", deals: 6, pct: 110.45, bonus: "364500.00", factSource: "manual" }],
    });
    expect(s.teamFact).toBe(93_000_000);
    expect(s.scheme.tiers.map((t) => t.from)).toEqual([80, 120]);
    expect(s.approved).toBeNull();
    expect(s.rows[0]).toMatchObject({ fact: 24_300_000, bonus: 364_500, factSource: "manual" });
    expect(fromRawMotivation({ approved: { number: "П-2026-7", total: "959000.00", orderDocumentId: 81 } }).approved).toEqual({ number: "П-2026-7", total: 959_000, orderDocumentId: 81 });
  });
});
