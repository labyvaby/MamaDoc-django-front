import { describe, expect, it } from "vitest";

import { computeNewPrice, describeFailures, runBulk, toggleSelection } from "./bulk";

describe("runBulk", () => {
  it("collects successes and failures in input order", async () => {
    const result = await runBulk([1, 2, 3, 4, 5], async (id) => {
      await new Promise((r) => setTimeout(r, (6 - id) * 2));
      if (id % 2 === 0) throw new Error(`bad ${id}`);
    });
    expect(result.done).toEqual([1, 3, 5]);
    expect(result.failed).toEqual([
      { id: 2, message: "bad 2" },
      { id: 4, message: "bad 4" },
    ]);
  });

  it("never runs more requests at once than the limit", async () => {
    let active = 0;
    let peak = 0;
    const progress: number[] = [];
    await runBulk(
      [1, 2, 3, 4, 5, 6, 7],
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active -= 1;
      },
      { concurrency: 3, onProgress: (n) => progress.push(n) },
    );
    expect(peak).toBe(3);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles an empty list", async () => {
    expect(await runBulk([], async () => undefined)).toEqual({ done: [], failed: [] });
  });
});

describe("computeNewPrice", () => {
  it("sets an exact price", () => {
    expect(computeNewPrice(500, "set", 750)).toBe(750);
    expect(computeNewPrice(500, "set", -1)).toBeNull();
  });

  it("changes by percent and rounds to whole som", () => {
    expect(computeNewPrice(1000, "percent", 10)).toBe(1100);
    expect(computeNewPrice(999, "percent", -15)).toBe(849);
    expect(computeNewPrice(100, "percent", -150)).toBe(0);
  });

  it("changes by amount, never below zero", () => {
    expect(computeNewPrice(300, "amount", 50)).toBe(350);
    expect(computeNewPrice(300, "amount", -500)).toBe(0);
  });

  it("rejects non-numbers", () => {
    expect(computeNewPrice(300, "amount", Number.NaN)).toBeNull();
  });
});

describe("toggleSelection", () => {
  const visible = [10, 20, 30, 40, 50];

  it("toggles a single row without shift", () => {
    expect([...toggleSelection(new Set(), visible, 30, null, false)]).toEqual([30]);
    expect([...toggleSelection(new Set([30]), visible, 30, 30, false)]).toEqual([]);
  });

  it("selects a range with shift in either direction", () => {
    const down = toggleSelection(new Set([20]), visible, 40, 20, true);
    expect([...down].sort()).toEqual([20, 30, 40]);
    const up = toggleSelection(new Set([40]), visible, 10, 40, true);
    expect([...up].sort()).toEqual([10, 20, 30, 40]);
  });

  it("clears a range when the clicked row was selected", () => {
    const next = toggleSelection(new Set([10, 20, 30, 40]), visible, 30, 10, true);
    expect([...next]).toEqual([40]);
  });

  it("falls back to a single toggle when the anchor is filtered out", () => {
    expect([...toggleSelection(new Set(), visible, 30, 99, true)]).toEqual([30]);
  });
});

describe("describeFailures", () => {
  it("names the first three and counts the rest", () => {
    const failed = [1, 2, 3, 4, 5].map((id) => ({ id, message: "нет" }));
    expect(describeFailures(failed, (id) => `Т${id}`)).toBe(
      "«Т1»: нет; «Т2»: нет; «Т3»: нет и ещё 2",
    );
  });
});
