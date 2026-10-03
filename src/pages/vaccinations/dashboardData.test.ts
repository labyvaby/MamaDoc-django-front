import { describe, expect, it } from "vitest";

import { percent, toBars, yearMonths } from "./dashboardData";

describe("dashboardData", () => {
  it("полосы относительно максимума", () => {
    expect(toBars([{ key: "a", label: "A", value: 4 }, { key: "b", label: "B", value: 1 }]).map((b) => b.share)).toEqual([1, 0.25]);
    expect(toBars([{ key: "a", label: "A", value: 0 }])[0].share).toBe(0);
    expect(toBars([])).toEqual([]);
  });

  it("12 месяцев года с пустыми", () => {
    const months = yearMonths(2026, [{ month: "2026-09", count: 6, amount: "3600.00" }]);
    expect(months).toHaveLength(12);
    expect(months[8]).toEqual({ key: "2026-09", label: "сен", count: 6, amount: "3600.00" });
    expect(months[0].count).toBe(0);
  });

  it("проценты", () => {
    expect(percent(3, 8)).toBe("38 %");
    expect(percent(1, 0)).toBe("—");
  });
});
