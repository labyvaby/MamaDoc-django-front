import { describe, it, expect } from "vitest";

import { groupByCategory } from "../../config/moduleCatalogGrouping";
import type { CatalogModule } from "../../api/tenancy";

function mod(code: string, category: string, isEnabled = false): CatalogModule {
  return { code, name: code, description: "", category, tier: "shared", isEnabled };
}

describe("groupByCategory", () => {
  it("orders known categories by CATEGORY_ORDER and keeps module order within a group", () => {
    const items = [mod("a", "finance"), mod("b", "operations"), mod("c", "finance")];
    const groups = groupByCategory(items);
    // operations precedes finance in CATEGORY_ORDER
    expect(groups.map(([c]) => c)).toEqual(["operations", "finance"]);
    const finance = groups.find(([c]) => c === "finance")?.[1] ?? [];
    expect(finance.map((m) => m.code)).toEqual(["a", "c"]);
  });

  it("puts unknown categories after known ones, alphabetically", () => {
    const items = [mod("z", "zeta"), mod("o", "operations"), mod("a", "alpha")];
    expect(groupByCategory(items).map(([c]) => c)).toEqual(["operations", "alpha", "zeta"]);
  });

  it("returns an empty list when there are no modules", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
