import { describe, expect, it } from "vitest";

import { computeNewPrice } from "./bulk";

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
