import { describe, expect, it } from "vitest";

import type { ProfitRow } from "../../api/doctorProfit";
import { formatMargin, formatMinutes, rowLabel, sortRows, toNumber } from "./profitTable";

const row = (over: Partial<ProfitRow>): ProfitRow => ({
  employeeId: 1,
  fullName: "А",
  scheduleMinutes: 0,
  outsideMinutes: 0,
  totalMinutes: 0,
  byAppointments: false,
  revenueServices: "0.00",
  revenueProducts: "0.00",
  revenue: "0.00",
  debt: "0.00",
  salary: "0.00",
  salaryParts: {
    servicePercent: "0.00",
    serviceFixed: "0.00",
    appointment: "0.00",
    product: "0.00",
    bonus: "0.00",
    hourly: "0.00",
    cleaning: "0.00",
  },
  costVaccines: "0.00",
  costProducts: "0.00",
  costConsumables: "0.00",
  cost: "0.00",
  profitDirect: "0.00",
  overheadExpenses: "0.00",
  overheadStaff: "0.00",
  overheadFixed: "0.00",
  overhead: "0.00",
  profit: "0.00",
  marginPct: null,
  ...over,
});

describe("sortRows", () => {
  it("сортирует деньги как числа, «Без врача» всегда внизу", () => {
    const rows = [
      row({ employeeId: null, fullName: "", profit: "9999.00" }),
      row({ employeeId: 1, fullName: "Б", profit: "900.00" }),
      row({ employeeId: 2, fullName: "А", profit: "10000.00" }),
    ];

    expect(sortRows(rows, "profit", "desc").map((r) => r.employeeId)).toEqual([2, 1, null]);
    expect(sortRows(rows, "profit", "asc").map((r) => r.employeeId)).toEqual([1, 2, null]);
  });

  it("сортирует по имени и марже (пустая маржа — в конце)", () => {
    const rows = [
      row({ employeeId: 1, fullName: "Борис", marginPct: null }),
      row({ employeeId: 2, fullName: "Анна", marginPct: 12.5 }),
      row({ employeeId: 3, fullName: "Вера", marginPct: -4 }),
    ];

    expect(sortRows(rows, "fullName", "asc").map((r) => r.employeeId)).toEqual([2, 1, 3]);
    expect(sortRows(rows, "marginPct", "asc").map((r) => r.employeeId)).toEqual([3, 2, 1]);
    expect(sortRows(rows, "marginPct", "desc").map((r) => r.employeeId)).toEqual([2, 3, 1]);
  });

  it("сортирует по часам и не меняет исходный массив", () => {
    const rows = [row({ employeeId: 1, totalMinutes: 60 }), row({ employeeId: 2, totalMinutes: 600 })];

    expect(sortRows(rows, "totalMinutes", "desc").map((r) => r.employeeId)).toEqual([2, 1]);
    expect(rows.map((r) => r.employeeId)).toEqual([1, 2]);
  });
});

describe("форматирование", () => {
  it("часы с минутами", () => {
    expect(formatMinutes(0)).toBe("0 ч");
    expect(formatMinutes(45)).toBe("45 мин");
    expect(formatMinutes(180)).toBe("3 ч");
    expect(formatMinutes(195)).toBe("3 ч 15 мин");
  });

  it("маржа", () => {
    expect(formatMargin(null)).toBe("—");
    expect(formatMargin(12.5)).toBe("12,5 %");
    expect(formatMargin(-3)).toBe("-3 %");
  });

  it("подписывает строку без врача и переводит decimal-строки", () => {
    expect(rowLabel(row({ employeeId: null, fullName: "" }))).toBe("Без врача");
    expect(rowLabel(row({ fullName: "Иванова" }))).toBe("Иванова");
    expect(toNumber("-12.50")).toBe(-12.5);
    expect(toNumber(undefined)).toBe(0);
  });
});
