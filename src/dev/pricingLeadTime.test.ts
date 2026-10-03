import { describe, expect, it } from "vitest";

import { leadTimeLabel, leadTimeModeOf, LEAD_TIME_TEMPLATES } from "./pricingLeadTime";

describe("leadTimeLabel", () => {
  it("близко к заезду, заранее и диапазон", () => {
    expect(leadTimeLabel(0, 3)).toBe("за 3 дня до заезда и ближе");
    expect(leadTimeLabel(null, 1)).toBe("за 1 день до заезда и ближе");
    expect(leadTimeLabel(0, 0)).toBe("в день заезда");
    expect(leadTimeLabel(60, null)).toBe("за 60 дней до заезда и раньше");
    expect(leadTimeLabel(7, 14)).toBe("за 7–14 дней до заезда");
    expect(leadTimeLabel(5, 5)).toBe("ровно за 5 дней до заезда");
  });
});

describe("leadTimeModeOf", () => {
  it("угадывает вариант по границам", () => {
    expect(leadTimeModeOf("0", "3")).toBe("near");
    expect(leadTimeModeOf("", "7")).toBe("near");
    expect(leadTimeModeOf("30", "")).toBe("ahead");
    expect(leadTimeModeOf("7", "14")).toBe("range");
  });
});

describe("LEAD_TIME_TEMPLATES", () => {
  it("скидки со знаком минус, наценка — плюс", () => {
    const byKey = Object.fromEntries(LEAD_TIME_TEMPLATES.map((t) => [t.key, t.prefill]));
    expect(Number(byKey["last-minute"].amount)).toBeLessThan(0);
    expect(Number(byKey["close-in-markup"].amount)).toBeGreaterThan(0);
    expect(byKey["early-bird"].leadTimeTo).toBeNull();
  });
});
