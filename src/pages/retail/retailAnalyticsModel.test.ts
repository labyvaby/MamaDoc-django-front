import { describe, expect, it } from "vitest";

import type { MatrixGaps, RetailCollection, SellThroughRow } from "../../api/retailAnalytics";
import {
  filterSellThrough,
  formatPercent,
  marginPercent,
  matrixGrid,
  plural,
  receiptLabel,
  seasonOptions,
  sellThroughTotals,
  sizeShares,
} from "./retailAnalyticsModel";

const row = (over: Partial<SellThroughRow>): SellThroughRow => ({
  modelId: 1,
  modelName: "Пальто",
  collectionName: "SS26",
  season: "SS26",
  year: 2026,
  received: "0",
  sold: "0",
  returned: "0",
  stock: "0",
  sellThrough: null,
  ...over,
});

const collection = (season: string, year: number | null): RetailCollection => ({
  modelId: Math.random(),
  modelName: "m",
  name: season || "Без сезона",
  season,
  year,
  launchedAt: null,
  selloutDue: null,
  comment: "",
  skuTotal: 1,
  createdAt: "",
  updatedAt: "",
});

describe("receiptLabel", () => {
  it("shows the 1C number of an imported receipt", () => {
    expect(receiptLabel({ id: 7, number: "f963e72e-9e67", comment: "Чек 1С НФРТ-000105." })).toBe("НФРТ-000105");
    expect(receiptLabel({ id: 7, number: "f963e72e-9e67", comment: "Чек 1С НФРТ-000105. Подарок" })).toBe("НФРТ-000105");
  });

  it("falls back to the short till number", () => {
    expect(receiptLabel({ id: 7, number: "f963e72e-9e67", comment: "" })).toBe("f963e72e");
  });
});

describe("margin", () => {
  it("is a share of revenue and empty without revenue", () => {
    expect(marginPercent(25, 100)).toBe(25);
    expect(marginPercent(0, 0)).toBeNull();
    expect(formatPercent(null)).toBe("—");
  });
});

describe("seasonOptions", () => {
  it("puts the newest season first and no season last", () => {
    const options = seasonOptions([
      collection("", null),
      collection("SS26", 2026),
      collection("AW25", 2025),
      collection("AW26/27", 2026),
    ]);
    expect(options[0]).toMatch(/26/);
    expect(options.at(-1)).toBe("");
    expect(options.indexOf("AW25")).toBe(2);
  });
});

describe("sell-through", () => {
  it("sums the net sales against what passed the shelf", () => {
    const totals = sellThroughTotals([
      row({ sold: "10", returned: "2", stock: "2" }),
      row({ sold: "0", stock: "-1" }),
    ]);
    expect(totals.sold).toBe(10);
    expect(totals.stock).toBe(2);
    expect(totals.sellThrough).toBe(80);
  });

  it("sorts by percent and keeps rows without one at the end", () => {
    const sorted = filterSellThrough(
      [
        row({ modelName: "B", sellThrough: "10.00" }),
        row({ modelName: "A", sellThrough: null }),
        row({ modelName: "C", sellThrough: "90.00" }),
      ],
      "",
      "sellThrough",
    );
    expect(sorted.map((r) => r.modelName)).toEqual(["C", "B", "A"]);
  });

  it("puts the bigger seller first at the same percent", () => {
    const sorted = filterSellThrough(
      [row({ modelName: "A", sellThrough: "100.00", sold: "1" }), row({ modelName: "B", sellThrough: "100.00", sold: "9" })],
      "",
      "sellThrough",
    );
    expect(sorted[0].modelName).toBe("B");
  });

  it("searches by model and collection", () => {
    const rows = [row({ modelName: "ALOHAS BOOT" }), row({ modelName: "APC BAG", collectionName: "AW26/27" })];
    expect(filterSellThrough(rows, "boot", "name")).toHaveLength(1);
    expect(filterSellThrough(rows, "aw26", "name")).toHaveLength(1);
  });
});

describe("sizeShares", () => {
  it("splits sales across sizes and gives each its own sell-through", () => {
    const shares = sizeShares([
      { valueId: 1, value: "S", sold: "3", stock: "1" },
      { valueId: 2, value: "M", sold: "1", stock: "0" },
      { valueId: 3, value: "L", sold: "0", stock: "0" },
    ]);
    expect(shares[0].soldShare).toBe(75);
    expect(shares[0].sellThrough).toBe(75);
    expect(shares[1].sellThrough).toBe(100);
    expect(shares[2].sellThrough).toBeNull();
  });
});

describe("matrixGrid", () => {
  it("marks missing and empty cells", () => {
    const gaps: MatrixGaps = {
      modelId: 1,
      modelName: "Пальто",
      colors: ["Чёрный", "Белый"],
      sizes: ["42", "44"],
      missing: [{ colorValueId: 2, color: "Белый", sizeValueId: 4, size: "44", productId: null }],
      empty: [{ colorValueId: 1, color: "Чёрный", sizeValueId: 3, size: "42", productId: 9 }],
    };
    expect(matrixGrid(gaps)).toEqual([
      ["empty", "ok"],
      ["ok", "missing"],
    ]);
  });
});

describe("plural", () => {
  it("declines Russian nouns", () => {
    expect([1, 3, 5, 11, 21, 22, 2454].map((n) => plural(n, "модель", "модели", "моделей"))).toEqual([
      "модель",
      "модели",
      "моделей",
      "моделей",
      "модель",
      "модели",
      "модели",
    ]);
  });
});
