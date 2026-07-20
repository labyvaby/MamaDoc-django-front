import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import type { ScheduleException, ScheduleRule } from "../../../api/scheduling";
import { computeDayOccurrences } from "./occurrences";

// 2026-07-09 — четверг (isoWeekday 4 → weekday-индекс 3)
const THU = dayjs("2026-07-09");
const FRI = dayjs("2026-07-10");
const SAT = dayjs("2026-07-11");

const rule = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: 1,
  employeeId: 10,
  employeeName: "Аббасова Айгерим",
  branchId: null,
  branchName: null,
  dateFrom: "2026-07-01",
  dateTo: "2026-12-31",
  weekdays: [0, 1, 2, 3, 4], // Пн–Пт
  startTime: "09:00",
  endTime: "17:00",
  lunchStart: null,
  lunchEnd: null,
  comment: "",
  isActive: true,
  ...over,
});

const exception = (over: Partial<ScheduleException> = {}): ScheduleException => ({
  id: 100,
  employeeId: 10,
  employeeName: "Аббасова Айгерим",
  branchId: null,
  branchName: null,
  date: "2026-07-09",
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  ...over,
});

describe("computeDayOccurrences", () => {
  it("создаёт смену для дня недели, входящего в правило", () => {
    const occs = computeDayOccurrences(THU, [rule()], []);
    expect(occs).toEqual([
      expect.objectContaining({ employeeId: 10, startTime: "09:00", endTime: "17:00", kind: "rule" }),
    ]);
  });

  it("не создаёт смену для дня недели вне правила", () => {
    expect(computeDayOccurrences(SAT, [rule()], [])).toEqual([]);
  });

  it("игнорирует неактивное правило", () => {
    expect(computeDayOccurrences(THU, [rule({ isActive: false })], [])).toEqual([]);
  });

  describe("границы периода действия", () => {
    it("включает крайние даты dateFrom и dateTo", () => {
      const r = rule({ dateFrom: "2026-07-09", dateTo: "2026-07-09" });
      expect(computeDayOccurrences(THU, [r], [])).toHaveLength(1);
    });

    it("не создаёт смену до dateFrom", () => {
      const r = rule({ dateFrom: "2026-07-10" });
      expect(computeDayOccurrences(THU, [r], [])).toEqual([]);
    });

    it("не создаёт смену после dateTo", () => {
      const r = rule({ dateTo: "2026-07-08" });
      expect(computeDayOccurrences(THU, [r], [])).toEqual([]);
    });
  });

  describe("обеденный перерыв", () => {
    it("режет смену на два сегмента", () => {
      const r = rule({ lunchStart: "13:00", lunchEnd: "14:00" });
      const occs = computeDayOccurrences(THU, [r], []);
      expect(occs).toEqual([
        expect.objectContaining({ startTime: "09:00", endTime: "13:00" }),
        expect.objectContaining({ startTime: "14:00", endTime: "17:00" }),
      ]);
    });

    it("оба сегмента ссылаются на одно правило", () => {
      const r = rule({ lunchStart: "13:00", lunchEnd: "14:00" });
      const occs = computeDayOccurrences(THU, [r], []);
      expect(occs.map((o) => o.sourceId)).toEqual([1, 1]);
    });

    it("не режет, если обед совпадает с границей смены", () => {
      const r = rule({ lunchStart: "09:00", lunchEnd: "10:00" });
      expect(computeDayOccurrences(THU, [r], [])).toHaveLength(1);
    });

    it("не режет, если обед выходит за пределы смены", () => {
      const r = rule({ lunchStart: "13:00", lunchEnd: "18:00" });
      expect(computeDayOccurrences(THU, [r], [])).toHaveLength(1);
    });

    it("не режет при некорректном обеде (начало позже конца)", () => {
      const r = rule({ lunchStart: "14:00", lunchEnd: "13:00" });
      expect(computeDayOccurrences(THU, [r], [])).toHaveLength(1);
    });
  });

  describe("исключения", () => {
    it("day_off отменяет смену по правилу", () => {
      expect(computeDayOccurrences(THU, [rule()], [exception()])).toEqual([]);
    });

    it("vacation отменяет смену по правилу", () => {
      const exc = exception({ kind: "vacation" });
      expect(computeDayOccurrences(THU, [rule()], [exc])).toEqual([]);
    });

    it("отмена действует только на своего сотрудника", () => {
      const other = rule({ id: 2, employeeId: 20, employeeName: "Клепова Диана" });
      const occs = computeDayOccurrences(THU, [rule(), other], [exception()]);
      expect(occs).toHaveLength(1);
      expect(occs[0].employeeId).toBe(20);
    });

    it("отмена действует только на свою дату", () => {
      const occs = computeDayOccurrences(FRI, [rule()], [exception()]);
      expect(occs).toHaveLength(1);
    });

    it("day_off отменяет обе половины смены с обедом", () => {
      const r = rule({ lunchStart: "13:00", lunchEnd: "14:00" });
      expect(computeDayOccurrences(THU, [r], [exception()])).toEqual([]);
    });

    it("extra добавляет доп. смену в выходной день", () => {
      const exc = exception({
        id: 200,
        date: SAT.format("YYYY-MM-DD"),
        kind: "extra",
        startTime: "18:00",
        endTime: "20:00",
      });
      const occs = computeDayOccurrences(SAT, [rule()], [exc]);
      expect(occs).toEqual([
        expect.objectContaining({ kind: "extra", startTime: "18:00", endTime: "20:00", sourceId: 200 }),
      ]);
    });

    it("extra не отменяется собственным day_off (разные сущности)", () => {
      const dayOff = exception({ id: 1 });
      const extra = exception({ id: 2, kind: "extra", startTime: "18:00", endTime: "20:00" });
      const occs = computeDayOccurrences(THU, [rule()], [dayOff, extra]);
      expect(occs).toEqual([expect.objectContaining({ kind: "extra" })]);
    });

    it("extra без времени раскрывается на весь день", () => {
      const exc = exception({ kind: "extra", startTime: null, endTime: null });
      const occs = computeDayOccurrences(THU, [], [exc]);
      expect(occs[0]).toMatchObject({ startTime: "00:00", endTime: "23:59" });
    });
  });

  it("собирает смены нескольких сотрудников", () => {
    const second = rule({ id: 2, employeeId: 20, employeeName: "Клепова Диана", startTime: "10:00" });
    expect(computeDayOccurrences(THU, [rule(), second], [])).toHaveLength(2);
  });

  it("воскресенье соответствует weekday-индексу 6", () => {
    const sunday = dayjs("2026-07-12");
    const r = rule({ weekdays: [6] });
    expect(computeDayOccurrences(sunday, [r], [])).toHaveLength(1);
    expect(computeDayOccurrences(THU, [r], [])).toEqual([]);
  });
});
