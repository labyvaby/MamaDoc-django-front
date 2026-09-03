import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { parseShiftOverlapConflict, type ShiftOverlapConflict } from "./scheduling";

/** Тело 409 из ответа бэка от 02.09.2026 (ветка feature/multi-branch-schedule). */
const conflictBody: ShiftOverlapConflict = {
  code: "schedule_shift_overlap",
  message: "Смена пересекается с другой сменой этого сотрудника: 04.09 09:00–17:00",
  employeeId: 6,
  overlaps: [
    {
      kind: "rule",
      ruleId: 55,
      exceptionId: null,
      branchId: 1,
      branchName: "Мама Доктор",
      otherBranch: true,
      date: "2026-09-04",
      start: "09:00",
      end: "17:00",
    },
  ],
};

describe("parseShiftOverlapConflict", () => {
  it("разбирает 409 с кодом schedule_shift_overlap", () => {
    const parsed = parseShiftOverlapConflict(new ApiError("Conflict", 409, conflictBody));
    expect(parsed).not.toBeNull();
    expect(parsed?.employeeId).toBe(6);
    expect(parsed?.overlaps[0].branchName).toBe("Мама Доктор");
    expect(parsed?.overlaps[0].otherBranch).toBe(true);
  });

  it("не путает с пересечением приёмов — там свой код", () => {
    const err = new ApiError("Conflict", 409, {
      code: "appointment_overlap",
      overlaps: [],
    });
    expect(parseShiftOverlapConflict(err)).toBeNull();
  });

  it("режим forbid отдаёт 400 — подтверждать нечего", () => {
    expect(parseShiftOverlapConflict(new ApiError("Bad", 400, conflictBody))).toBeNull();
  });

  it("обычная ошибка и пустое тело — null", () => {
    expect(parseShiftOverlapConflict(new Error("network"))).toBeNull();
    expect(parseShiftOverlapConflict(new ApiError("x", 409, null))).toBeNull();
    expect(parseShiftOverlapConflict("boom")).toBeNull();
  });
});
