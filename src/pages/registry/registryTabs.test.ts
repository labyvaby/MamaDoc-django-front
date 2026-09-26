import { describe, expect, it } from "vitest";

import { formatAge, formatMoney, isChild, REGISTRY_TABS, tabLabelKey } from "./registryTabs";

describe("registryTabs", () => {
  const today = new Date(2026, 8, 24);

  it("formats age in years and months", () => {
    expect(formatAge("2026-05-10", today)).toBe("4 мес.");
    expect(formatAge("2024-03-01", today)).toBe("2 г. 6 мес.");
    expect(formatAge("2023-09-24", today)).toBe("3 г.");
    expect(formatAge("2010-09-24", today)).toBe("16 л.");
    expect(formatAge("2026-09-25", today)).toBe("0 мес.");
    expect(formatAge(null, today)).toBe("—");
  });

  it("treats a missing birth date as a child", () => {
    expect(isChild(null, today)).toBe(true);
    expect(isChild("2010-01-01", today)).toBe(true);
    expect(isChild("2008-09-25", today)).toBe(true);
    expect(isChild("2008-09-24", today)).toBe(false);
    expect(isChild("2000-01-01", today)).toBe(false);
  });

  it("lists the registry tabs with label keys", () => {
    expect(REGISTRY_TABS).toEqual(["active", "onboarding", "unpaid", "expiring", "inactive", "cancelled"]);
    expect(tabLabelKey("expiring")).toBe("tabs.expiring");
  });

  it("formats money without zero kopecks", () => {
    expect(formatMoney("5000.00").replace(/\s/g, " ")).toBe("5 000");
    expect(formatMoney("1234.5").replace(/\s/g, " ")).toBe("1 234,50");
    expect(formatMoney(null)).toBe("0");
  });
});
