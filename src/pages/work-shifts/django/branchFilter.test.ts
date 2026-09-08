import { describe, expect, it } from "vitest";

import type { WorkShiftRow } from "../../../api/attendance";
import {
  buildBranchOptions,
  filterShiftsByBranch,
  unassignedShifts,
} from "./branchFilter";

function shift(
  id: number,
  branchId: number | null,
  branchName: string | null = null,
): WorkShiftRow {
  return {
    id,
    employeeId: 1,
    employeeName: "Сотрудник",
    branchId,
    branchName,
    clockIn: "2026-08-01T08:00:00Z",
    clockOut: "2026-08-01T17:00:00Z",
    isNightShift: false,
    hasLunch: false,
    lunchMinutes: 0,
    lunchStart: null,
    durationSeconds: 32400,
    dayHours: "9.00",
    nightHours: "0.00",
    isAnomalous: false,
    createdAt: "2026-08-01T08:00:00Z",
  };
}

const rows = [
  shift(1, 1, "Мама Доктор"),
  shift(2, 13, "Мама Доктор Плюс"),
  shift(3, null),
  shift(4, 1, "Мама Доктор"),
  shift(5, null),
];

describe("фильтр смен по филиалу", () => {
  it("«Все филиалы» отдаёт список без изменений", () => {
    expect(filterShiftsByBranch(rows, "all")).toBe(rows);
  });

  it("филиал отбирает только свои смены", () => {
    expect(filterShiftsByBranch(rows, 1).map((s) => s.id)).toEqual([1, 4]);
    expect(filterShiftsByBranch(rows, 13).map((s) => s.id)).toEqual([2]);
  });

  it("«Без филиала» показывает записи, которые не входят ни в один срез", () => {
    expect(filterShiftsByBranch(rows, "none").map((s) => s.id)).toEqual([3, 5]);
  });

  it("смены без филиала не попадают в выборку конкретного филиала", () => {
    // Ровно то, чем опасен серверный фильтр: null-смены нельзя молча
    // приписать к филиалу, их показывает отдельный пункт и плашка.
    expect(filterShiftsByBranch(rows, 1).some((s) => s.branchId == null)).toBe(
      false,
    );
  });

  it("считает смены без филиала", () => {
    expect(unassignedShifts(rows).map((s) => s.id)).toEqual([3, 5]);
    expect(unassignedShifts([])).toEqual([]);
  });
});

describe("список филиалов для селектора", () => {
  it("объединяет филиалы членства и филиалы из смен", () => {
    const options = buildBranchOptions([{ id: 1, name: "Мама Доктор" }], rows);
    expect(options).toEqual([
      { id: 1, name: "Мама Доктор" },
      { id: 13, name: "Мама Доктор Плюс" },
    ]);
  });

  it("подставляет имя филиалу, которого нет ни в членстве, ни в ответе", () => {
    const options = buildBranchOptions([], [shift(9, 42, null)]);
    expect(options).toEqual([{ id: 42, name: "Филиал 42" }]);
  });

  it("не дублирует филиал, встреченный в обоих источниках", () => {
    const options = buildBranchOptions(
      [{ id: 13, name: "Мама Доктор Плюс" }],
      rows,
    );
    expect(options.filter((o) => o.id === 13)).toHaveLength(1);
  });
});
