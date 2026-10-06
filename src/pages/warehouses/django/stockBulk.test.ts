import { describe, expect, it } from "vitest";

import { bulkQuantity, planBulkQuantities } from "./stockBulk";

describe("bulkQuantity", () => {
  it("takes the whole stock", () => {
    expect(bulkQuantity(7, "all", 0)).toBe(7);
    expect(bulkQuantity(2.5, "all", 0)).toBe(2.5);
  });

  it("takes N but never more than is there", () => {
    expect(bulkQuantity(7, "each", 3)).toBe(3);
    expect(bulkQuantity(2, "each", 3)).toBe(2);
  });

  it("skips empty stock and a missing N", () => {
    expect(bulkQuantity(0, "all", 0)).toBe(0);
    expect(bulkQuantity(-1, "each", 3)).toBe(0);
    expect(bulkQuantity(5, "each", Number.NaN)).toBe(0);
    expect(bulkQuantity(5, "each", 0)).toBe(0);
  });
});

describe("planBulkQuantities", () => {
  it("lists moves, totals and skipped rows", () => {
    const plan = planBulkQuantities(
      [
        { productId: 1, quantity: 10 },
        { productId: 2, quantity: 0 },
        { productId: 3, quantity: 1 },
      ],
      "each",
      2,
    );
    expect([...plan.moves]).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(plan.skipped).toBe(1);
    expect(plan.total).toBe(3);
  });
});
