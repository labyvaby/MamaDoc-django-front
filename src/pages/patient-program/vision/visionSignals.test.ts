import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import { readExam } from "./visionData";
import { acuityTrend, myopiaRate, trendPoints, visionSignals } from "./visionSignals";

let seq = 0;
function exam(occurredAt: string, data: Record<string, unknown>) {
  seq += 1;
  const record: ProgramModuleRecord = {
    id: seq,
    enrollmentId: 1,
    programModuleId: 5,
    moduleCode: "vision",
    branchId: 1,
    occurredAt,
    title: "Осмотр",
    status: "completed",
    notes: "",
    data,
    configurationVersion: 1,
    schemaSnapshot: {},
    createdById: null,
    createdByName: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  return readExam(record);
}

const refraction = (right: number, left: number, leftCyl: number | null = null) => ({
  refraction: {
    cycloplegia: true,
    right: { sph: right, cyl: null, axis: null },
    left: { sph: left, cyl: leftCyl, axis: leftCyl ? 180 : null },
  },
});

describe("vision signals", () => {
  it("flags a difference between the eyes", () => {
    const signals = visionSignals([exam("2026-09-27T08:00:00Z", { visualAcuityRight: "1.0", visualAcuityLeft: "0.6" })]);
    expect(signals).toEqual([{ kind: "asymmetry", value: 0.4 }]);
  });

  it("flags anisometropia by spherical equivalent", () => {
    const signals = visionSignals([exam("2026-09-27T08:00:00Z", refraction(-1.25, -2.5, -0.5))]);
    expect(signals).toEqual([{ kind: "anisometropia", value: 1.5 }]);
  });

  it("flags myopia that grows by half a diopter a year", () => {
    const exams = [exam("2026-09-27T08:00:00Z", refraction(-1.25, -0.5)), exam("2025-09-27T08:00:00Z", refraction(-0.5, -0.5))];
    expect(visionSignals(exams)).toEqual([{ kind: "myopia-progression", eye: "OD", value: 0.75 }]);
    const close = [exam("2026-09-27T08:00:00Z", refraction(-1.25, -0.5)), exam("2026-08-27T08:00:00Z", refraction(-0.5, -0.5))];
    expect(myopiaRate(close, "right")).toBeNull();
  });

  it("tells the trend and draws points against the norm", () => {
    expect(acuityTrend(1, 0.8)).toBe("up");
    expect(acuityTrend(0.6, 0.8)).toBe("down");
    expect(acuityTrend(0.8, 0.8)).toBe("same");
    expect(acuityTrend(null, 0.8)).toBeNull();
    const points = trendPoints(
      [
        exam("2026-09-27T08:00:00Z", { visualAcuityRight: "1.0", visualAcuityLeft: "0.6" }),
        exam("2025-09-27T08:00:00Z", { visualAcuityRight: "0.9", visualAcuityLeft: "н/о" }),
        exam("2025-03-27T08:00:00Z", { recommendation: "без остроты" }),
      ],
      "2021-05-10",
    );
    expect(points).toEqual([
      { label: "09.2025", od: 0.9, os: null, norm: 0.7 },
      { label: "09.2026", od: 1, os: 0.6, norm: 0.8 },
    ]);
  });
});
