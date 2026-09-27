import { describe, expect, it } from "vitest";

import {
  ageMonths,
  assess,
  bmi,
  bmiVerdict,
  centile,
  centileLabel,
  growthStatus,
  lmsAt,
  valueAtZ,
  zScore,
} from "./growthNorms";

describe("growth norms", () => {
  it("counts age in WHO months", () => {
    expect(ageMonths("2021-05-10", "2026-09-27")).toBeCloseTo(1966 / 30.4375, 6);
    expect(ageMonths(null, "2026-09-27")).toBeNull();
    expect(ageMonths("2027-01-01", "2026-09-27")).toBeNull();
  });

  it("reads and interpolates the WHO tables", () => {
    expect(lmsAt("height", "male", 0)).toEqual([1, 49.8842, 0.03795]);
    const half = lmsAt("height", "male", 0.5);
    const month1 = lmsAt("height", "male", 1);
    expect(half?.[1]).toBeCloseTo((49.8842 + (month1?.[1] ?? 0)) / 2, 6);
    expect(lmsAt("head", "female", 61)).toBeNull();
    expect(lmsAt("weight", "male", 121)).toBeNull();
  });

  it("scores a value and goes back from z to the value", () => {
    const lms = lmsAt("height", "male", 0)!;
    expect(zScore("height", lms, 49.8842)).toBeCloseTo(0, 9);
    expect(zScore("height", lms, valueAtZ(lms, 2))).toBeCloseTo(2, 9);
    const weight = lmsAt("weight", "male", 0)!;
    const beyond = valueAtZ(weight, 3) + (valueAtZ(weight, 3) - valueAtZ(weight, 2));
    expect(zScore("weight", weight, beyond)).toBeCloseTo(4, 9);
    expect(zScore("height", lms, 0)).toBeNull();
  });

  it("turns z into centiles and colours", () => {
    expect(centile(0)).toBeCloseTo(50, 5);
    expect(centile(1.8807936)).toBeCloseTo(97, 2);
    expect(centile(-1.0364334)).toBeCloseTo(15, 2);
    expect(growthStatus(0)).toBe("ok");
    expect(growthStatus(1.5)).toBe("borderline");
    expect(growthStatus(-2)).toBe("attention");
    expect(growthStatus(null)).toBe("unknown");
    expect(centileLabel(75.4)).toBe("75-й центиль");
    expect(centileLabel(0.4)).toBe("< 1-го центиля");
    expect(centileLabel(99.6)).toBe("> 99-го центиля");
  });

  it("assesses only inside the tables and names BMI", () => {
    expect(assess("head", "male", 70, 50)).toBeNull();
    expect(assess("height", null, 12, 75)).toBeNull();
    expect(assess("height", "male", 0, 49.8842)?.status).toBe("ok");
    expect(bmi(24, 123)).toBeCloseTo(24 / 1.5129, 9);
    expect(bmi(null, 123)).toBeNull();
    expect(bmiVerdict(2.5, 36)).toBe("избыточный вес");
    expect(bmiVerdict(2.5, 72)).toBe("ожирение");
    expect(bmiVerdict(1.5, 36)).toBe("риск избыточного веса");
    expect(bmiVerdict(0, 72)).toBe("норма для возраста");
    expect(bmiVerdict(-2.5, 72)).toBe("дефицит массы");
    expect(bmiVerdict(null, 72)).toBe("");
  });
});
