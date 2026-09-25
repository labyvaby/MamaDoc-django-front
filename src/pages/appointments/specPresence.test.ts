import { describe, expect, it } from "vitest";

import type { AvailabilityDay, EmployeeAvailability } from "../../api/scheduling";
import { specializationsOnShift } from "./specPresence";

const day = (date: string, over: Partial<AvailabilityDay> = {}): AvailabilityDay => ({
  date,
  scheduled: false,
  dayOff: false,
  freeCount: 0,
  slots: [],
  appointments: [],
  ...over,
});

const emp = (employeeId: number, days: AvailabilityDay[]): EmployeeAvailability => ({
  employeeId,
  fullName: `Сотрудник ${employeeId}`,
  nearestFree: null,
  days,
});

const TODAY = "2026-09-26";

describe("specializationsOnShift", () => {
  it("специальности врачей со сменой сегодня или позже", () => {
    const specs = new Map([
      [1, [10, 11]],
      [2, [12]],
    ]);
    const result = specializationsOnShift(
      [
        emp(1, [day("2026-09-28", { scheduled: true })]),
        emp(2, [day(TODAY, { scheduled: true })]),
      ],
      specs,
      TODAY,
    );
    expect(result).toEqual(new Set([10, 11, 12]));
  });

  it("смены только в прошлом не считаются", () => {
    const result = specializationsOnShift(
      [emp(1, [day("2026-09-20", { scheduled: true })])],
      new Map([[1, [10]]]),
      TODAY,
    );
    expect(result).toEqual(new Set());
  });

  it("выходной или отпуск на весь день — не смена", () => {
    const result = specializationsOnShift(
      [emp(1, [day("2026-09-28", { scheduled: true, dayOff: true })])],
      new Map([[1, [10]]]),
      TODAY,
    );
    expect(result).toEqual(new Set());
  });

  it("приём вне графика без смены специальность не открывает", () => {
    const result = specializationsOnShift(
      [
        emp(1, [
          day("2026-09-28", {
            appointments: [
              {
                id: 5,
                branchId: 23,
                branchName: "Филиал",
                start: "10:00",
                end: "10:30",
                patientName: "Пациент",
                status: "scheduled",
              },
            ],
          }),
        ]),
      ],
      new Map([[1, [10]]]),
      TODAY,
    );
    expect(result).toEqual(new Set());
  });

  it("врач со сменой, которого нет в справочнике, — состав неизвестен", () => {
    const result = specializationsOnShift(
      [emp(1, [day("2026-09-28", { scheduled: true })])],
      new Map(),
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("врач без смен, которого нет в справочнике, ничему не мешает", () => {
    const result = specializationsOnShift(
      [
        emp(1, [day("2026-09-28")]),
        emp(2, [day("2026-09-28", { scheduled: true })]),
      ],
      new Map([[2, [12]]]),
      TODAY,
    );
    expect(result).toEqual(new Set([12]));
  });

  it("врач без специальности в справочнике — известен, но ничего не добавляет", () => {
    const result = specializationsOnShift(
      [emp(1, [day("2026-09-28", { scheduled: true })])],
      new Map([[1, []]]),
      TODAY,
    );
    expect(result).toEqual(new Set());
  });
});
