import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import type { TimesheetGrid } from "../../api/timesheet";
import { buildTimesheetXlsx, timesheetFileName } from "./exportTimesheetXlsx";

const grid: TimesheetGrid = {
  month: "2026-09",
  today: "2026-10-06",
  scope: { organizationId: 1, branchId: 2, branchName: "Центр", callerEmployeeId: null },
  access: {
    viewAll: true,
    viewOwn: true,
    create: true,
    update: true,
    delete: true,
    fillSchedule: true,
    approve: true,
    close: true,
    reopen: true,
    export: true,
    settings: true,
  },
  settings: { holidayPayPercent: 100, toleranceMinutes: 15 },
  codes: [
    {
      key: "presence",
      letter: "Я",
      name: "Явка",
      color: "#10b981",
      category: "work",
      isPaid: true,
      blocksBooking: false,
      isSystem: true,
      markable: true,
      isActive: true,
      id: null,
    },
    {
      key: "sick",
      letter: "Б",
      name: "Больничный",
      color: "#ef4444",
      category: "leave",
      isPaid: true,
      blocksBooking: true,
      isSystem: true,
      markable: true,
      isActive: true,
      id: null,
    },
  ],
  holidays: [{ id: 1, date: "2026-09-04", name: "День города" }],
  days: [
    { date: "2026-09-01", day: 1, weekday: 1, isWeekend: false, isToday: false },
    { date: "2026-09-02", day: 2, weekday: 2, isWeekend: false, isToday: false },
  ],
  rows: [
    {
      employee: {
        id: 7,
        fullName: "Асанова Айгерим",
        photoUrl: null,
        roleName: "Врач",
        specializations: [],
        branchId: 2,
        branchName: "Центр",
        status: "active",
        writeBranchId: 2,
        locked: false,
      },
      cells: [
        { day: 1, code: "presence", source: "skud", hours: "8.00" },
        { day: 2, code: "sick", source: "manual" },
      ],
      totals: {
        workedDays: 1,
        hours: "8.00",
        nightHours: "0.00",
        overtimeHours: "0.00",
        earlyLeaves: 0,
        vacationDays: 0,
        sickDays: 1,
        tripDays: 0,
        leaveDays: 1,
        absenceDays: 0,
        restDays: 0,
        missingDays: 0,
        plannedDays: 2,
        plannedHours: "16.00",
        holidayHours: "0.00",
        codes: { presence: 1, sick: 1 },
      },
    },
  ],
  daily: [
    { day: 1, present: 1, onShift: 0, leave: 0, absent: 0, missing: 0, planned: 1, hours: "8.00" },
    { day: 2, present: 0, onShift: 0, leave: 1, absent: 0, missing: 0, planned: 1, hours: "0.00" },
  ],
  summary: {
    employees: 1,
    workedDays: 1,
    hours: "8.00",
    nightHours: "0.00",
    overtimeHours: "0.00",
    earlyLeaves: 0,
    vacationDays: 0,
    sickDays: 1,
    tripDays: 0,
    leaveDays: 1,
    absenceDays: 0,
    missingDays: 0,
    plannedDays: 2,
    filledPercent: 100,
    holidayHours: "0.00",
    today: null,
  },
  closures: [],
  closed: false,
  pendingRequests: 0,
  total: 1,
  limit: 100,
  offset: 0,
};

describe("buildTimesheetXlsx", () => {
  it("пишет на сотрудника строку отметок и строку часов", async () => {
    const blob = await buildTimesheetXlsx(grid, {
      organizationName: "Клиника",
      generatedAt: new Date(2026, 9, 6),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet("Табель");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    expect(String(sheet.getCell("A1").value)).toContain("Сентябрь 2026");
    expect(String(sheet.getCell("A2").value)).toContain("Клиника · Центр");
    // Шапка: № / Сотрудник / Должность, затем дни.
    expect(sheet.getCell(4, 2).value).toBe("Сотрудник");
    expect(sheet.getCell(4, 4).value).toBe(1);
    expect(sheet.getCell(5, 4).value).toBe("Вт");
    // Строки сотрудника.
    expect(sheet.getCell(6, 2).value).toBe("Асанова Айгерим");
    expect(sheet.getCell(6, 4).value).toBe("Я");
    expect(sheet.getCell(7, 4).value).toBe(8);
    expect(sheet.getCell(6, 5).value).toBe("Б");
    // Итоги: «Дней» и «Больничный».
    expect(sheet.getCell(6, 6).value).toBe(1);
    expect(sheet.getCell(6, 11).value).toBe(1);
    expect(workbook.getWorksheet("Обозначения")?.getCell("B2").value).toBe("Явка");
  });

  it("называет файл по месяцу", () => {
    expect(timesheetFileName("2026-09")).toBe("Табель_2026-09.xlsx");
  });
});
