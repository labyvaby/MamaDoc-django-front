import { describe, expect, it } from "vitest";

import type { GrowthData, GrowthMeasurement } from "../../../api/health";
import {
  assessMeasurement,
  buildMeasurementInput,
  defaultPosition,
  deltaLabel,
  emptyGrowthForm,
  fromApiMeasurement,
  growthFormValid,
  growthSex,
  heightForNorms,
  normsAge,
  previousWith,
  readGrowth,
  stepValue,
} from "./growthData";

function row(id: number, measuredOn: string, values: Partial<GrowthMeasurement> = {}): GrowthMeasurement {
  return {
    id,
    measuredOn,
    weightKg: null,
    lengthHeightCm: null,
    position: "",
    headCircumferenceCm: null,
    chestCircumferenceCm: null,
    source: "manual",
    conclusionId: null,
    appointmentId: null,
    notes: "",
    createdBy: { id: 1, fullName: "Педиатр" },
    createdAt: `${measuredOn}T10:00:00Z`,
    ...values,
  };
}

const DATA: GrowthData = {
  sex: "male",
  birthDate: "2025-03-26",
  gestationalAgeWeeks: 39,
  gestationalAgeDays: 2,
  birth: { weightKg: 3.35, lengthCm: 51.5, headCircumferenceCm: 34 },
  complementaryFeedingOn: null,
  measurements: [
    row(1, "2025-09-26", { lengthHeightCm: 67.6, weightKg: 7.9 }),
    row(2, "2026-03-26", { lengthHeightCm: 75.7, weightKg: 9.6, source: "conclusion", appointmentId: 44 }),
  ],
  feeding: [],
};

describe("growthData", () => {
  it("reads measurements newest first and the birth point last", () => {
    const list = readGrowth(DATA);
    expect(list.map((item) => item.key)).toEqual(["m-2", "m-1", "birth"]);
    expect(list[0].editable).toBe(false);
    expect(list[0].sourceLabel).toBe("из заключения приёма");
    expect(list[0].appointmentId).toBe(44);
    expect(list[2].months).toBe(0);
    expect(list[2].weightKg).toBe(3.35);
    expect(growthSex("female")).toBe("female");
    expect(growthSex("unknown")).toBeNull();
  });

  it("corrects the age of a premature child until two years", () => {
    // 34 недели: 42 дня недоношенности; в 18 мес. — минус 42 дня.
    const premature = { weeks: 34, days: 0 };
    const at18 = normsAge("2025-01-01", "2026-07-02", premature);
    expect(at18.corrected).toBe(true);
    expect(at18.months).toBeCloseTo((547 - 42) / 30.4375, 5);
    const at25 = normsAge("2025-01-01", "2027-02-01", premature);
    expect(at25.corrected).toBe(false);
    expect(normsAge("2025-01-01", "2025-01-20", premature).months).toBeNull();
    expect(normsAge("2025-01-01", "2025-07-01", { weeks: 39, days: 0 }).corrected).toBe(false);
  });

  it("adjusts length and height by 0.7 cm by the way it was measured", () => {
    expect(heightForNorms(80, "standing", 18)).toBe(80.7);
    expect(heightForNorms(90, "recumbent", 30)).toBe(89.3);
    expect(heightForNorms(80, "recumbent", 18)).toBe(80);
    expect(heightForNorms(80, "", 18)).toBe(80);
    expect(defaultPosition(10)).toBe("recumbent");
    expect(defaultPosition(30)).toBe("standing");
  });

  it("assesses with the adjusted height and finds previous values", () => {
    const item = fromApiMeasurement(row(5, "2026-09-26", { lengthHeightCm: 80.5, position: "standing" }), "2025-03-26");
    expect(item.heightNormsCm).toBe(81.2);
    expect(assessMeasurement(item, "heightCm", "male")?.status).toBeDefined();
    const list = readGrowth(DATA);
    expect(previousWith(list, list[0], "weightKg")?.key).toBe("m-1");
    expect(deltaLabel(75.7, 67.6, "см", "2025-09-26", "2026-03-26", 1)).toBe("+8,1 см за 6 мес.");
  });

  it("builds the request from the form", () => {
    const empty = emptyGrowthForm("2026-10-02", "recumbent");
    expect(growthFormValid(empty)).toBe(false);
    const form = { ...empty, heightCm: "74,5", weightKg: "9.1" };
    expect(growthFormValid(form)).toBe(true);
    expect(buildMeasurementInput(form)).toEqual({
      measuredOn: "2026-10-02",
      weightKg: 9.1,
      lengthHeightCm: 74.5,
      position: "recumbent",
      headCircumferenceCm: null,
      chestCircumferenceCm: null,
      notes: "",
    });
    expect(buildMeasurementInput({ ...empty, weightKg: "9" }).position).toBe("");
    expect(stepValue("9.1", 0.1, 1)).toBe("9.2");
    expect(stepValue("", -0.5, 1)).toBe("0");
  });
});
