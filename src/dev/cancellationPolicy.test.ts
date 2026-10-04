import { describe, expect, it } from "vitest";

import { cancellationPolicyPreview } from "./cancellationPolicy";

const base = { freeDays: null, penalty: "none" as const, penaltyValue: "", prepaymentPercent: "", prepaymentHours: null, currency: "KGS" };

describe("cancellationPolicyPreview", () => {
  it("без условий — пусто", () => {
    expect(cancellationPolicyPreview(base)).toBe("");
  });

  it("как в примере бэкенда: 3 суток, первая ночь, 30 % за 24 ч", () => {
    expect(cancellationPolicyPreview({ ...base, freeDays: 3, penalty: "first_night", prepaymentPercent: "30", prepaymentHours: 24 })).toBe(
      "Бесплатная отмена — не позднее чем за 3 суток до заезда. При более поздней отмене или незаезде — штраф: стоимость первой ночи. Предоплата 30 % — в течение 24 ч после бронирования.",
    );
  });

  it("1 сутки, 0 — до дня заезда, штраф с момента брони", () => {
    expect(cancellationPolicyPreview({ ...base, freeDays: 1, penalty: "percent", penaltyValue: "50" })).toContain("за 1 сутки до заезда");
    expect(cancellationPolicyPreview({ ...base, freeDays: 0, penalty: "amount", penaltyValue: "2000" })).toContain("до дня заезда");
    expect(cancellationPolicyPreview({ ...base, penalty: "amount", penaltyValue: "2000" }).replace(/\s/g, " ")).toBe("Отмена и незаезд — штраф: 2 000 сом.");
  });
});
