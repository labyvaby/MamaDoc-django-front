import { describe, expect, it } from "vitest";
import {
  decimalForRequest,
  maxDiscountPercent,
  normalizeManualDiscount,
  normalizeManualPercent,
  sanitizeDecimal,
} from "./discountInput";

describe("POS cart discount input", () => {
  it("keeps the trailing dot so a fraction can still be typed", () => {
    expect(sanitizeDecimal("12.")).toBe("12.");
    expect(sanitizeDecimal("12.5")).toBe("12.5");
    expect(sanitizeDecimal(".5")).toBe("0.5");
  });

  it("accepts a comma as the decimal separator", () => {
    expect(sanitizeDecimal("7,5")).toBe("7.5");
  });

  it("drops letters, extra dots, leading zeros and a third decimal", () => {
    expect(sanitizeDecimal("ab1c")).toBe("1");
    expect(sanitizeDecimal("1.2.3")).toBe("1.23");
    expect(sanitizeDecimal("007")).toBe("7");
    expect(sanitizeDecimal("0.5")).toBe("0.5");
    expect(sanitizeDecimal("12.345")).toBe("12.34");
    expect(sanitizeDecimal("-5")).toBe("5");
  });

  it("turns an empty sum into zero", () => {
    expect(normalizeManualDiscount("")).toBe("0");
    expect(normalizeManualDiscount("abc")).toBe("0");
    expect(normalizeManualDiscount("123")).toBe("123");
    expect(normalizeManualDiscount("12.")).toBe("12.");
  });

  it("caps a percent at the limit and never above 100", () => {
    expect(normalizeManualPercent("10", 30)).toBe("10");
    expect(normalizeManualPercent("30", 30)).toBe("30");
    expect(normalizeManualPercent("45", 30)).toBe("30");
    expect(normalizeManualPercent("250")).toBe("100");
    expect(normalizeManualPercent("")).toBe("0");
  });

  it("lets a fractional percent be typed char by char", () => {
    let value = "0";
    for (const key of ["7", ".", "5"]) {
      value = normalizeManualPercent(`${value === "0" ? "" : value}${key}`, 30);
    }
    expect(value).toBe("7.5");
  });

  it("sends a clean number to the server", () => {
    expect(decimalForRequest("12.")).toBe("12");
    expect(decimalForRequest("012")).toBe("12");
    expect(decimalForRequest("7.50")).toBe("7.5");
    expect(decimalForRequest("")).toBe("0");
    expect(decimalForRequest("0")).toBe("0");
  });

  it("reads the percent limit from the counter rules", () => {
    expect(maxDiscountPercent({ max_discount_percent: 15 })).toBe(15);
    expect(maxDiscountPercent({ max_discount_percent: 0 })).toBe(0);
    expect(maxDiscountPercent({ max_discount_percent: 100 })).toBe(100);
    expect(maxDiscountPercent({ max_discount_percent: "30" })).toBe(100);
    expect(maxDiscountPercent({})).toBe(100);
    expect(maxDiscountPercent(undefined)).toBe(100);
  });
});
