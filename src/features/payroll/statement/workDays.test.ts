import { describe, expect, it } from "vitest";

import { countWorkDays } from "./workDays";
import type { EmployeeDailyDetailRow } from "../../../api/payroll";

function day(overrides: Partial<EmployeeDailyDetailRow>): EmployeeDailyDetailRow {
  return {
    workDate: "2026-08-01",
    dayHours: "0.00",
    nightHours: "0.00",
    dayHoursSum: "0.00",
    nightHoursSum: "0.00",
    hoursSum: "0.00",
    appointmentsCount: 0,
    distributedAppointments: "0",
    createdByCount: 0,
    percentSum: "0.00",
    expensesSum: "0.00",
    totalSalary: "0.00",
    isWeekend: false,
    hasWarning: false,
    ...overrides,
  };
}

/**
 * Колонки «Рабочих дней» у бэка нет — считаем её из дневной детализации.
 * Живой API (16.08.2026) отдаёт строку и за день, где были только приёмы, без
 * часов СКУД, поэтому день без часов тоже рабочий.
 */
describe("countWorkDays", () => {
  it("считает дни с часами, приёмами и созданными записями", () => {
    const days = [
      day({ workDate: "2026-08-01", hoursSum: "8.00" }),
      day({ workDate: "2026-08-02", appointmentsCount: 3 }),
      day({ workDate: "2026-08-03", createdByCount: 5 }),
      day({ workDate: "2026-08-04", distributedAppointments: "1.50" }),
    ];

    expect(countWorkDays(days)).toBe(4);
  });

  it("не считает дни без активности (например, только расход)", () => {
    const days = [
      day({ workDate: "2026-08-05", expensesSum: "5000.00" }),
      day({ workDate: "2026-08-06", hoursSum: "0.00" }),
    ];

    expect(countWorkDays(days)).toBe(0);
  });

  it("переживает пустой ответ", () => {
    expect(countWorkDays([])).toBe(0);
  });
});
