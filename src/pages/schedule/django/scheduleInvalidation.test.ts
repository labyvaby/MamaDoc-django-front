import { describe, expect, it } from "vitest";

import { djangoQueryKeys } from "../../../api/queryKeys";
import {
  isConflictsQueryOfEmployee,
  isScheduleQueryExceptConflicts,
} from "./scheduleInvalidation";

const conflicts = (employeeId: number) =>
  djangoQueryKeys.scheduling.conflicts({
    employeeId,
    dateFrom: "2026-09-21",
    dateTo: "2026-10-31",
    orgId: 1,
  });

describe("isScheduleQueryExceptConflicts", () => {
  it("сбрасывает правила, исключения и свободные окна", () => {
    expect(isScheduleQueryExceptConflicts(djangoQueryKeys.scheduling.rules({ branchId: 1 }))).toBe(
      true,
    );
    expect(
      isScheduleQueryExceptConflicts(djangoQueryKeys.scheduling.exceptions({ branchId: 1 })),
    ).toBe(true);
    expect(isScheduleQueryExceptConflicts(djangoQueryKeys.scheduling.availabilityAll)).toBe(true);
    // Ключи расписания без хелпера (specs у свободных окон) — тоже.
    expect(isScheduleQueryExceptConflicts(["django", "scheduling", "specs", 1])).toBe(true);
  });

  it("не трогает conflicts — отметка выходного приёмы не меняет", () => {
    expect(isScheduleQueryExceptConflicts(conflicts(7))).toBe(false);
  });

  it("чужие ключи не задевает", () => {
    expect(isScheduleQueryExceptConflicts(["django", "appointments", "list"])).toBe(false);
    expect(isScheduleQueryExceptConflicts(["scheduling"])).toBe(false);
  });
});

describe("isConflictsQueryOfEmployee", () => {
  it("совпадает только по своему сотруднику", () => {
    const own = isConflictsQueryOfEmployee(7);
    expect(own(conflicts(7))).toBe(true);
    expect(own(conflicts(8))).toBe(false);
    expect(own(djangoQueryKeys.scheduling.exceptions({ employeeId: 7 }))).toBe(false);
  });
});
