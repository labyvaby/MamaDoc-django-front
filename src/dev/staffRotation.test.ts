import { describe, expect, it } from "vitest";

import type { HotelStaffRotation } from "../api/hotel";
import { isoWeekday, rotationEmployeeOn, rotationFill, rotationLabel, weekdaysLabel } from "./staffRotation";

const names = (id: number) => ({ 1: "Асель", 2: "Бакыт", 3: "Чолпон" })[id] ?? `№${id}`;

describe("rotationEmployeeOn — по очереди", () => {
  // 5 октября 2026 — понедельник.
  const twoByTwo: HotelStaffRotation = { mode: "cycle", startDate: "2026-10-05", daysPerTurn: 2, repeat: true, members: [{ employeeId: 1, weekdays: [] }, { employeeId: 2, weekdays: [] }] };

  it("2 через 2: по два дня каждому, по кругу", () => {
    expect(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => rotationEmployeeOn(twoByTwo, d))).toEqual([1, 1, 2, 2, 1]);
    expect(rotationEmployeeOn(twoByTwo, "2026-10-04")).toBeNull();
  });

  it("сутки через двое: трое по одному дню", () => {
    const r: HotelStaffRotation = { ...twoByTwo, daysPerTurn: 1, members: [1, 2, 3].map((id) => ({ employeeId: id, weekdays: [] })) };
    expect(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((d) => rotationEmployeeOn(r, d))).toEqual([1, 2, 3, 1]);
    expect(rotationLabel(r, names)).toBe("сутки через двое · Асель, Бакыт, Чолпон");
    expect(rotationLabel(twoByTwo, names)).toBe("2 через 2 · Асель, Бакыт");
  });
});

describe("rotationEmployeeOn — по дням недели", () => {
  const r: HotelStaffRotation = {
    mode: "weekdays",
    startDate: "2026-10-01",
    daysPerTurn: 1,
    repeat: false,
    members: [{ employeeId: 1, weekdays: [1, 2, 3] }, { employeeId: 2, weekdays: [4, 5, 6, 7] }],
  };
  it("понедельник — 1, воскресенье — 7", () => {
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(rotationEmployeeOn(r, "2026-10-05")).toBe(1);
    expect(rotationEmployeeOn(r, "2026-10-08")).toBe(2);
    expect(rotationLabel(r, names)).toBe("по дням недели: Асель — пн–ср; Бакыт — чт–вс");
    expect(weekdaysLabel([1, 3, 5, 6])).toBe("пн, ср, пт, сб");
  });
});

describe("rotationFill", () => {
  it("только пустые дни и только с даты начала", () => {
    const r: HotelStaffRotation = { mode: "cycle", startDate: "2026-10-05", daysPerTurn: 1, repeat: true, members: [{ employeeId: 1, weekdays: [] }, { employeeId: 2, weekdays: [] }] };
    expect(rotationFill(r, "2026-10-03", "2026-10-08", new Set(["2026-10-06"]))).toEqual([
      { date: "2026-10-05", employeeId: 1 },
      { date: "2026-10-07", employeeId: 1 },
      { date: "2026-10-08", employeeId: 2 },
    ]);
  });
});
