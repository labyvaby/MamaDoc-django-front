import { describe, expect, it } from "vitest";

import {
  acuityNorm,
  acuityStatus,
  ageInMonths,
  ageLabel,
  displayAcuity,
  formatAcuity,
  parseAcuity,
} from "./visionNorms";

describe("vision norms", () => {
  it("counts full months and speaks the age", () => {
    expect(ageInMonths("2021-05-10", "2026-09-27")).toBe(64);
    expect(ageLabel(64)).toBe("5 лет 4 мес.");
    expect(ageLabel(8)).toBe("8 мес.");
    expect(ageLabel(24)).toBe("2 года");
    expect(ageLabel(12)).toBe("1 год");
    expect(ageInMonths(null, "2026-09-27")).toBeNull();
    expect(ageInMonths("2027-01-01", "2026-09-27")).toBeNull();
  });

  it("takes the age norm from the table", () => {
    expect(acuityNorm(11)).toBeNull();
    expect(acuityNorm(12)).toBe(0.3);
    expect(acuityNorm(64)).toBe(0.8);
    expect(acuityNorm(90)).toBe(1.0);
    expect(acuityNorm(null)).toBeNull();
  });

  it("reads acuity values and leaves rubbish as text", () => {
    expect(parseAcuity("0,8")).toBe(0.8);
    expect(parseAcuity("1")).toBe(1);
    expect(parseAcuity("н/о")).toBeNull();
    expect(parseAcuity("123")).toBeNull();
    expect(parseAcuity("")).toBeNull();
    expect(formatAcuity(1)).toBe("1,0");
    expect(formatAcuity(0.05)).toBe("0,05");
    expect(displayAcuity("0.8")).toBe("0,8");
    expect(displayAcuity("н/о")).toBe("н/о");
  });

  it("colours an eye against the norm", () => {
    expect(acuityStatus(1.0, 0.8)).toBe("ok");
    expect(acuityStatus(0.8, 0.8)).toBe("ok");
    expect(acuityStatus(0.6, 0.8)).toBe("borderline");
    expect(acuityStatus(0.5, 0.8)).toBe("low");
    expect(acuityStatus(null, 0.8)).toBe("unknown");
    expect(acuityStatus(0.8, null)).toBe("unknown");
  });
});
