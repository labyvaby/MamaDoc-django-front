import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import {
  buildGrowthData,
  deltaLabel,
  emptyGrowthForm,
  growthFormValid,
  growthSex,
  growthToForm,
  isGrowthModule,
  readMeasurements,
  stepValue,
} from "./growthData";

let seq = 0;
function record(occurredAt: string, data: Record<string, unknown>, status = "completed"): ProgramModuleRecord {
  seq += 1;
  return {
    id: seq,
    enrollmentId: 1,
    programModuleId: 4,
    moduleCode: "growth",
    branchId: 1,
    occurredAt,
    title: "Антропометрия",
    status,
    notes: "",
    data,
    configurationVersion: 1,
    schemaSnapshot: {},
    createdById: null,
    createdByName: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

describe("growth data", () => {
  it("recognises the growth section and the sex", () => {
    expect(isGrowthModule({ code: "growth", moduleType: "measurements" })).toBe(true);
    expect(isGrowthModule({ code: "vision", moduleType: "ophthalmology" })).toBe(false);
    expect(growthSex("female")).toBe("female");
    expect(growthSex("unknown")).toBeNull();
  });

  it("reads measurements newest first and skips planned records", () => {
    const list = readMeasurements(
      [
        record("2026-03-27T06:00:00Z", { heightCm: 118, weightKg: 22.8 }),
        record("2026-09-27T06:00:00Z", { heightCm: "123", weightKg: 24, headCircumferenceCm: 51, chestCircumferenceCm: 58 }),
        record("2027-03-27T06:00:00Z", {}, "planned"),
      ],
      "2021-05-10",
    );
    expect(list.map((item) => item.heightCm)).toEqual([123, 118]);
    expect(list[0].bmi).toBeCloseTo(24 / 1.5129, 9);
    expect(list[0].headCm).toBe(51);
    expect(list[0].chestCm).toBe(58);
    expect(list[0].months).toBeCloseTo(1966 / 30.4375, 6);
  });

  it("speaks the gain between measurements", () => {
    expect(deltaLabel(123, 118, "см", "2026-03-27", "2026-09-27", 1)).toBe("+5 см за 6 мес.");
    expect(deltaLabel(24, 24.2, "кг", "2026-03-27", "2026-09-27", 1)).toBe("−0,2 кг за 6 мес.");
    expect(deltaLabel(5.1, 4.6, "кг", "2026-09-06", "2026-09-27", 1)).toBe("+0,5 кг за 3 нед.");
  });

  it("builds record data from the form and back", () => {
    const form = { ...emptyGrowthForm(), heightCm: "123,5", weightKg: "24", chestCm: "58" };
    expect(growthFormValid(form)).toBe(true);
    expect(growthFormValid({ ...form, weightKg: "" })).toBe(false);
    expect(buildGrowthData(form)).toEqual({ heightCm: 123.5, weightKg: 24, chestCircumferenceCm: 58 });
    const [item] = readMeasurements([record("2026-09-27T06:00:00Z", buildGrowthData(form))], null);
    expect(growthToForm(item)).toEqual({ heightCm: "123.5", weightKg: "24", headCm: "", chestCm: "58", notes: "" });
    expect(stepValue("123", 0.5, 1)).toBe("123.5");
    expect(stepValue("24,3", -0.1, 1)).toBe("24.2");
    expect(stepValue("0.1", -0.5, 1)).toBe("0");
  });
});
