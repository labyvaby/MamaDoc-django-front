import { describe, expect, it } from "vitest";

import type { TimesheetCode, TimesheetRow } from "../../api/timesheet";
import {
  cellKey,
  changedCells,
  describeSelection,
  formatHours,
  hotkeyMap,
  mergeRows,
  movePoint,
  plural,
  rectKeys,
  restoreRequests,
  shiftMonth,
  snapshotCells,
} from "./model";

const code = (key: string, letter: string, extra: Partial<TimesheetCode> = {}): TimesheetCode => ({
  key,
  letter,
  name: key,
  color: "#10b981",
  category: "work",
  isPaid: true,
  blocksBooking: false,
  isSystem: true,
  markable: true,
  isActive: true,
  id: null,
  ...extra,
});

const row = (id: number, cells: TimesheetRow["cells"]): TimesheetRow => ({
  employee: {
    id,
    fullName: `Сотрудник ${id}`,
    photoUrl: null,
    roleName: "",
    specializations: [],
    branchId: null,
    branchName: null,
    status: "active",
    writeBranchId: null,
    locked: false,
  },
  cells,
  totals: {
    workedDays: 0,
    hours: "0.00",
    nightHours: "0.00",
    overtimeHours: "0.00",
    earlyLeaves: 0,
    vacationDays: 0,
    sickDays: 0,
    tripDays: 0,
    leaveDays: 0,
    absenceDays: 0,
    restDays: 0,
    missingDays: 0,
    plannedDays: 0,
    plannedHours: "0.00",
    holidayHours: "0.00",
    codes: {},
  },
});

describe("months", () => {
  it("сдвигает месяц через границу года", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("formatHours", () => {
  it("убирает лишние нули и пишет запятую", () => {
    expect(formatHours("8.00")).toBe("8");
    expect(formatHours("7.50")).toBe("7,5");
    expect(formatHours(null)).toBe("");
  });
});

describe("plural", () => {
  it("склоняет по-русски", () => {
    expect(plural(1, "день", "дня", "дней")).toBe("1 день");
    expect(plural(3, "день", "дня", "дней")).toBe("3 дня");
    expect(plural(11, "день", "дня", "дней")).toBe("11 дней");
    expect(plural(22, "день", "дня", "дней")).toBe("22 дня");
  });
});

describe("hotkeyMap", () => {
  it("привязывает отметки к физическим клавишам ЙЦУКЕН", () => {
    const map = hotkeyMap([
      code("presence", "Я"),
      code("day_off", "В"),
      code("vacation", "О"),
      code("sick", "Б"),
      code("holiday", "П", { markable: false }),
      code("custom:5", "ОТ", { isSystem: false }),
      code("custom:6", "УД", { isSystem: false }),
    ]);
    expect(map.get("KeyZ")).toBe("presence");
    expect(map.get("KeyD")).toBe("day_off");
    expect(map.get("KeyJ")).toBe("vacation");
    expect(map.get("Comma")).toBe("sick");
    // «П» вычисляется сам — клавиши нет; «ОТ» уступает «О» встроенной.
    expect(map.get("KeyG")).toBeUndefined();
    expect([...map.values()]).not.toContain("custom:5");
    expect(map.get("KeyE")).toBe("custom:6");
  });
});

describe("selection", () => {
  it("строит прямоугольник между двумя точками", () => {
    const keys = rectKeys({ row: 1, day: 3 }, { row: 0, day: 2 }, [10, 20, 30]);
    expect([...keys].sort()).toEqual(["10:2", "10:3", "20:2", "20:3"]);
  });

  it("двигает активную ячейку и не выходит за сетку", () => {
    expect(movePoint({ row: 0, day: 1 }, "ArrowUp", 3, 30)).toEqual({ row: 0, day: 1 });
    expect(movePoint({ row: 2, day: 30 }, "ArrowRight", 3, 30)).toEqual({ row: 2, day: 30 });
    expect(movePoint({ row: 1, day: 5 }, "End", 3, 30)).toEqual({ row: 1, day: 30 });
    expect(movePoint({ row: 1, day: 5 }, "KeyA", 3, 30)).toBeNull();
  });

  it("описывает выделение", () => {
    const keys = new Set([cellKey(1, 2), cellKey(1, 3), cellKey(2, 3)]);
    expect(describeSelection(keys, "2026-09")).toBe("3 ячейки · 2 сотрудника · 2–3 сен");
  });
});

describe("undo snapshots", () => {
  const rows = [
    row(1, [
      { day: 1, code: "presence", source: "manual", hours: "9.00", nightHours: "1.00" },
      { day: 2, code: "presence", source: "skud", hours: "8.00" },
    ]),
  ];

  it("запоминает ручные отметки и считает остальные автоматическими", () => {
    const snapshots = snapshotCells(rows, [cellKey(1, 1), cellKey(1, 2)]);
    expect(snapshots).toEqual([
      { key: "1:1", mark: { code: "presence", dayHours: 8, nightHours: 1 } },
      { key: "1:2", mark: null },
    ]);
    const { set, clear } = restoreRequests(snapshots, "2026-09");
    expect(set).toEqual([
      { employeeId: 1, date: "2026-09-01", code: "presence", dayHours: 8, nightHours: 1 },
    ]);
    expect(clear).toEqual([{ employeeId: 1, date: "2026-09-02" }]);
  });
});

describe("realtime diff", () => {
  it("находит только изменившиеся ячейки", () => {
    const before = [row(1, [{ day: 1, code: "presence", hours: "8.00" }, { day: 2, state: "missing" }])];
    const after = [row(1, [{ day: 1, code: "presence", hours: "8.00" }, { day: 2, code: "sick", source: "manual" }])];
    expect([...changedCells(before, after)]).toEqual(["1:2"]);
  });

  it("подменяет строки по сотруднику, не трогая остальные", () => {
    const rows = [row(1, []), row(2, [])];
    const merged = mergeRows(rows, [row(2, [{ day: 1, code: "absence" }])]);
    expect(merged[0]).toBe(rows[0]);
    expect(merged[1].cells[0].code).toBe("absence");
  });
});
