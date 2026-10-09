import { describe, expect, it } from "vitest";

import type { SalesMoney, SalesRow } from "../../../api/retailAnalytics";
import {
  discountPercent,
  hasOtherMoney,
  sortSalesRows,
  variantLabel,
} from "./salesModel";

const money = (patch: Partial<SalesMoney> = {}): SalesMoney => ({
  quantity: "0",
  gross: "0",
  discount: "0",
  revenue: "0",
  cash: "0",
  card: "0",
  other: "0",
  receipts: 0,
  returnedQuantity: "0",
  returnedAmount: "0",
  returnedCash: "0",
  returnedCard: "0",
  returnedOther: "0",
  returns: 0,
  netQuantity: "0",
  netRevenue: "0",
  ...patch,
});

const row = (name: string, patch: Partial<SalesMoney>): SalesRow => ({
  modelId: null,
  productId: 1,
  name,
  sku: "",
  category: "",
  season: "",
  money: money(patch),
  variants: [],
});

describe("sortSalesRows", () => {
  const rows = [
    row("Брюки", { revenue: "100", quantity: "5" }),
    row("Пальто", { revenue: "900", quantity: "1" }),
    row("Арка", { revenue: "100", quantity: "2" }),
  ];

  it("sorts by revenue, ties by name", () => {
    expect(sortSalesRows(rows, "revenue").map((r) => r.name)).toEqual([
      "Пальто",
      "Арка",
      "Брюки",
    ]);
  });

  it("sorts by quantity", () => {
    expect(sortSalesRows(rows, "quantity").map((r) => r.name)).toEqual([
      "Брюки",
      "Арка",
      "Пальто",
    ]);
  });

  it("sorts by name without mutating the input", () => {
    expect(sortSalesRows(rows, "name").map((r) => r.name)).toEqual([
      "Арка",
      "Брюки",
      "Пальто",
    ]);
    expect(rows[0].name).toBe("Брюки");
  });
});

describe("variantLabel", () => {
  it("joins the axes", () => {
    expect(variantLabel({ color: "Чёрный", size: "42", name: "x" })).toBe(
      "Чёрный · 42"
    );
    expect(variantLabel({ color: "", size: "M", name: "x" })).toBe("M");
  });

  it("falls back to the name", () => {
    expect(variantLabel({ color: "", size: "", name: "Шарф" })).toBe("Шарф");
  });
});

describe("discountPercent", () => {
  it("is the share of the gross", () => {
    expect(discountPercent({ gross: "20000", discount: "1000" })).toBe(5);
  });

  it("is null without sales", () => {
    expect(discountPercent({ gross: "0", discount: "0" })).toBeNull();
  });
});

describe("hasOtherMoney", () => {
  it("is false for cash and card only", () => {
    expect(hasOtherMoney({ other: "0.00", returnedOther: "0.00" })).toBe(false);
    expect(hasOtherMoney({ other: "150.00", returnedOther: "0.00" })).toBe(
      true
    );
  });
});
