import { describe, expect, it } from "vitest";

import type { AvailabilityDay, EmployeeAvailability } from "../../api/scheduling";
import {
  computeSpecsPresence,
  railSpecializations,
  resolveSpecsPresence,
  specializationsOnShift,
  type SpecsPresenceInput,
} from "./specPresence";

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

describe("computeSpecsPresence", () => {
  const found = new Set([10]);
  const ready: SpecsPresenceInput = {
    specSelected: false,
    permissionsLoading: false,
    canViewStaff: true,
    staffLoading: false,
    staffFailed: false,
    todayLoaded: true,
    todayFailed: false,
    compute: () => found,
  };

  it("всё загружено — посчитанный набор", () => {
    expect(computeSpecsPresence(ready)).toBe(found);
  });

  it("выбрана специальность — считать нечем, берётся запомненное", () => {
    expect(computeSpecsPresence({ ...ready, specSelected: true })).toBeUndefined();
  });

  it("права ещё грузятся — ждём, а не показываем всё и схлопываем", () => {
    expect(computeSpecsPresence({ ...ready, permissionsLoading: true })).toBeUndefined();
  });

  it("нет права на справочник сотрудников — сразу весь список, без ожидания", () => {
    expect(computeSpecsPresence({ ...ready, canViewStaff: false, staffLoading: true })).toBeNull();
  });

  it("справочник или окна недоступны и данных нет — весь список", () => {
    expect(computeSpecsPresence({ ...ready, staffFailed: true })).toBeNull();
    expect(computeSpecsPresence({ ...ready, todayLoaded: false, todayFailed: true })).toBeNull();
  });

  it("справочник или окна ещё грузятся — ждём", () => {
    expect(computeSpecsPresence({ ...ready, staffLoading: true })).toBeUndefined();
    expect(computeSpecsPresence({ ...ready, todayLoaded: false })).toBeUndefined();
  });
});

describe("resolveSpecsPresence", () => {
  const computed = new Set([10]);
  const remembered = new Set([11]);

  it("посчитанное важнее запомненного", () => {
    expect(resolveSpecsPresence(computed, remembered, false)).toBe(computed);
    expect(resolveSpecsPresence(null, remembered, false)).toBeNull();
  });

  it("не посчитано — запомненное для этого филиала", () => {
    expect(resolveSpecsPresence(undefined, remembered, true)).toBe(remembered);
  });

  it("выбрана специальность и ничего не запомнено — весь список", () => {
    expect(resolveSpecsPresence(undefined, undefined, true)).toBeNull();
  });

  it("ещё считается и ничего не запомнено — ждём", () => {
    expect(resolveSpecsPresence(undefined, undefined, false)).toBeUndefined();
  });
});

describe("railSpecializations", () => {
  const specs = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }];
  const nobodyToday = () => false;

  it("состав неизвестен — весь справочник", () => {
    expect(railSpecializations(specs, null, null, nobodyToday)).toBe(specs);
  });

  it("только специальности со сменами", () => {
    expect(railSpecializations(specs, new Set([11]), null, nobodyToday)).toEqual([{ id: 11 }]);
  });

  it("выбранная специальность видна всегда", () => {
    expect(railSpecializations(specs, new Set([11]), 13, nobodyToday)).toEqual([
      { id: 11 },
      { id: 13 },
    ]);
  });

  it("кто-то работает сегодня по свежему бейджу — строка видна, даже если справочник устарел", () => {
    expect(railSpecializations(specs, new Set([11]), null, (id) => id === 12)).toEqual([
      { id: 11 },
      { id: 12 },
    ]);
  });
});
