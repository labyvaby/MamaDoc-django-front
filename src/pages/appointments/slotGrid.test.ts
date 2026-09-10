import { describe, expect, it } from "vitest";

import { resampleDay, resampleEmployeeDays } from "./slotGrid";
import type { AvailabilityDay, AvailabilitySlot } from "../../api/scheduling";

function slot(
  start: string,
  end: string,
  {
    free = true,
    appointmentId = null as number | null,
    patientName = null as string | null,
    branchId = 13 as number | null,
    branchName = "Мама Доктор Плюс" as string | null,
    busyElsewhere = false,
  } = {},
): AvailabilitySlot {
  return { start, end, free, appointmentId, patientName, branchId, branchName, busyElsewhere };
}

function day(overrides: Partial<AvailabilityDay> = {}): AvailabilityDay {
  return {
    date: "2026-09-10",
    scheduled: true,
    dayOff: false,
    freeCount: 0,
    slots: [],
    appointments: [],
    ...overrides,
  };
}

/** Только свободные окна, в виде «09:00–09:20». */
function freeWindows(d: AvailabilityDay): string[] {
  return d.slots
    .filter((s) => s.free && s.appointmentId == null && !s.busyElsewhere)
    .map((s) => `${s.start}–${s.end}`);
}

describe("resampleDay", () => {
  it("режет свободный час по 20 минут вместо тридцатиминутной сетки бэка", () => {
    const result = resampleDay(
      day({ freeCount: 2, slots: [slot("09:00", "09:30"), slot("09:30", "10:00")] }),
      20,
    );
    expect(freeWindows(result)).toEqual(["09:00–09:20", "09:20–09:40", "09:40–10:00"]);
    // Счётчик окон на плитке даты обязан совпадать с тем, что видно в дне.
    expect(result.freeCount).toBe(3);
  });

  it("не перешагивает через приём: интервалы до и после режутся отдельно", () => {
    const result = resampleDay(
      day({
        slots: [
          slot("09:00", "09:30"),
          slot("09:30", "10:00", { free: false, appointmentId: 7, patientName: "Иванова А." }),
          slot("10:00", "10:30"),
          slot("10:30", "11:00"),
        ],
      }),
      20,
    );
    // 09:00–09:30 даёт одно окно на 20 минут (хвост в 10 минут не окно),
    // 10:00–11:00 — три.
    expect(freeWindows(result)).toEqual([
      "09:00–09:20",
      "10:00–10:20",
      "10:20–10:40",
      "10:40–11:00",
    ]);
    // Занятое окно осталось нетронутым и на своём месте.
    expect(result.slots[1]).toMatchObject({ start: "09:30", appointmentId: 7 });
  });

  it("не перешагивает через обед", () => {
    const result = resampleDay(
      day({ slots: [slot("12:00", "12:30"), slot("13:00", "13:30")] }),
      15,
    );
    expect(freeWindows(result)).toEqual([
      "12:00–12:15",
      "12:15–12:30",
      "13:00–13:15",
      "13:15–13:30",
    ]);
  });

  it("шаг длиннее свободного интервала окон не даёт", () => {
    const result = resampleDay(day({ freeCount: 1, slots: [slot("09:00", "09:30")] }), 40);
    expect(freeWindows(result)).toEqual([]);
    expect(result.freeCount).toBe(0);
  });

  it("сохраняет филиал смены — у сотрудника на две смены окна не обезличиваются", () => {
    const result = resampleDay(
      day({
        slots: [
          slot("09:00", "09:30", { branchId: 13, branchName: "Орозбекова" }),
          slot("14:00", "14:30", { branchId: 21, branchName: "Ахунбаева" }),
        ],
      }),
      15,
    );
    expect(result.slots.map((s) => [s.start, s.branchName])).toEqual([
      ["09:00", "Орозбекова"],
      ["09:15", "Орозбекова"],
      ["14:00", "Ахунбаева"],
      ["14:15", "Ахунбаева"],
    ]);
  });

  it("прошедшие и занятые в другом филиале окна не трогает", () => {
    const source = day({
      slots: [
        slot("08:00", "08:30", { free: false }),
        slot("08:30", "09:00", { free: false, busyElsewhere: true }),
        slot("09:00", "09:30"),
      ],
    });
    const result = resampleDay(source, 15);
    expect(result.slots.slice(0, 2)).toEqual(source.slots.slice(0, 2));
    expect(freeWindows(result)).toEqual(["09:00–09:15", "09:15–09:30"]);
  });

  it("идемпотентность: сетку, уже нарезанную этим шагом, возвращает как есть", () => {
    // Так будет, когда бэк начнёт применять шаг сотрудника сам.
    const source = day({
      slots: [slot("09:00", "09:20"), slot("09:20", "09:40"), slot("09:40", "10:00")],
    });
    expect(resampleDay(source, 20)).toBe(source);
  });

  it("без шага и с нулевым шагом день не меняется", () => {
    const source = day({ slots: [slot("09:00", "09:30")] });
    expect(resampleDay(source, null)).toBe(source);
    expect(resampleDay(source, 0)).toBe(source);
  });
});

describe("resampleEmployeeDays", () => {
  it("применяет шаг ко всем дням, а без изменений отдаёт прежний объект", () => {
    const employee = {
      employeeId: 4,
      fullName: "Аббасова А. А.",
      nearestFree: { date: "2026-09-10", start: "09:00" },
      days: [
        day({ slots: [slot("09:00", "09:30")] }),
        day({ date: "2026-09-11", slots: [slot("09:00", "09:30")] }),
      ],
    };
    const result = resampleEmployeeDays(employee, 15);
    expect(result.days.map(freeWindows)).toEqual([
      ["09:00–09:15", "09:15–09:30"],
      ["09:00–09:15", "09:15–09:30"],
    ]);
    // Ближайшее свободное время не сдвигается: начало интервала — всегда окно.
    expect(result.nearestFree).toEqual({ date: "2026-09-10", start: "09:00" });
    expect(resampleEmployeeDays(employee, null)).toBe(employee);
  });
});
