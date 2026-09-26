import { describe, expect, it } from "vitest";

import {
  absenceForDay,
  buildDayAbsences,
  formatAbsenceRanges,
  hitsAbsence,
} from "./absenceHours";
import type { ScheduleException } from "../../api/scheduling";

const exc = (over: Partial<ScheduleException>): ScheduleException => ({
  id: 1,
  employeeId: 41,
  employeeName: "Nursultan Doctor",
  branchId: 12,
  branchName: "Тестовый филиал",
  date: "2026-09-11",
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  ...over,
});

describe("buildDayAbsences", () => {
  it("целодневное отсутствие — без интервалов", () => {
    const map = buildDayAbsences([exc({})]);
    expect(absenceForDay(map, 41, "2026-09-11")).toEqual({
      kind: "day_off",
      fullDay: true,
      ranges: [],
    });
  });

  it("частичное отсутствие сохраняет часы", () => {
    const map = buildDayAbsences([exc({ startTime: "14:00", endTime: "18:00" })]);
    expect(absenceForDay(map, 41, "2026-09-11")).toEqual({
      kind: "day_off",
      fullDay: false,
      ranges: [{ start: "14:00", end: "18:00" }],
    });
  });

  it("рабочие смены (extra/override) отсутствием не считаются", () => {
    const map = buildDayAbsences([
      exc({ kind: "extra", startTime: "09:00", endTime: "13:00" }),
      exc({ id: 2, kind: "override", startTime: "09:00", endTime: "13:00" }),
    ]);
    expect(map.size).toBe(0);
  });

  it("целодневное перебивает часы того же дня", () => {
    const map = buildDayAbsences([
      exc({ startTime: "14:00", endTime: "18:00" }),
      exc({ id: 2 }),
    ]);
    expect(absenceForDay(map, 41, "2026-09-11")).toMatchObject({ fullDay: true, ranges: [] });
  });

  it("смежные интервалы склеиваются в один", () => {
    const map = buildDayAbsences([
      exc({ startTime: "10:00", endTime: "12:00" }),
      exc({ id: 2, startTime: "12:00", endTime: "14:00" }),
      exc({ id: 3, startTime: "16:00", endTime: "18:00" }),
    ]);
    expect(absenceForDay(map, 41, "2026-09-11")?.ranges).toEqual([
      { start: "10:00", end: "14:00" },
      { start: "16:00", end: "18:00" },
    ]);
  });

  it("отпуск выигрывает у выходного в подписи дня", () => {
    const map = buildDayAbsences([exc({}), exc({ id: 2, kind: "vacation" })]);
    expect(absenceForDay(map, 41, "2026-09-11")?.kind).toBe("vacation");
  });

  it("перевёрнутый интервал считается целодневным, а не молча теряется", () => {
    const map = buildDayAbsences([exc({ startTime: "18:00", endTime: "14:00" })]);
    expect(absenceForDay(map, 41, "2026-09-11")?.fullDay).toBe(true);
  });

  it("дни и сотрудники не смешиваются", () => {
    const map = buildDayAbsences([exc({}), exc({ id: 2, employeeId: 157, date: "2026-09-12" })]);
    expect(absenceForDay(map, 41, "2026-09-12")).toBeUndefined();
    expect(absenceForDay(map, 157, "2026-09-12")).toBeDefined();
  });
});

describe("hitsAbsence", () => {
  const partial = buildDayAbsences([exc({ startTime: "14:00", endTime: "18:00" })]);
  const absence = absenceForDay(partial, 41, "2026-09-11")!;

  it("окно внутри интервала — попадает", () => {
    expect(hitsAbsence(absence, "14:30", "15:00")).toBe(true);
  });

  it("окно до интервала — не попадает", () => {
    expect(hitsAbsence(absence, "13:00", "13:30")).toBe(false);
  });

  it("приём, накрывающий начало интервала, попадает", () => {
    expect(hitsAbsence(absence, "13:30", "14:30")).toBe(true);
  });

  it("время конца интервала уже свободно", () => {
    expect(hitsAbsence(absence, "18:00", "18:30")).toBe(false);
  });

  it("целодневное забирает любое время", () => {
    const full = absenceForDay(buildDayAbsences([exc({})]), 41, "2026-09-11")!;
    expect(hitsAbsence(full, "07:00", "07:30")).toBe(true);
  });
});

describe("formatAbsenceRanges", () => {
  it("перечисляет интервалы через запятую", () => {
    expect(
      formatAbsenceRanges([
        { start: "10:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ]),
    ).toBe("10:00–12:00, 14:00–18:00");
  });
});
