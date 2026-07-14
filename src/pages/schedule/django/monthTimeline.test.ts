import { describe, expect, it } from "vitest";
import type { DayOccurrence } from "./occurrences";
import {
  MONTH_DAY_END_MIN,
  MONTH_DAY_START_MIN,
  MONTH_MIN_SEG_MIN,
  hourlyOccupancy,
  occMinutes,
  packIntoLanes,
  timeToLeftPct,
} from "./monthTimeline";

const occ = (over: Partial<DayOccurrence> = {}): DayOccurrence => ({
  employeeId: 10,
  employeeName: "Аббасова Айгерим",
  startTime: "09:00",
  endTime: "17:00",
  kind: "rule",
  sourceId: 1,
  ...over,
});

describe("occMinutes", () => {
  it("парсит HH:MM в минуты от полуночи", () => {
    expect(occMinutes("09:30")).toBe(9 * 60 + 30);
    expect(occMinutes("00:00")).toBe(0);
    expect(occMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("нераспознанное время → начало окна", () => {
    expect(occMinutes("")).toBe(MONTH_DAY_START_MIN);
    expect(occMinutes("25:00")).toBe(MONTH_DAY_START_MIN);
  });
});

describe("timeToLeftPct", () => {
  it("границы окна: 07:00 → 0%, 22:00 → 100%", () => {
    expect(timeToLeftPct(MONTH_DAY_START_MIN)).toBe(0);
    expect(timeToLeftPct(MONTH_DAY_END_MIN)).toBe(100);
  });

  it("клампит значения вне окна", () => {
    expect(timeToLeftPct(0)).toBe(0);
    expect(timeToLeftPct(24 * 60)).toBe(100);
  });
});

describe("packIntoLanes", () => {
  it("пустой день → без дорожек", () => {
    expect(packIntoLanes([])).toEqual([]);
  });

  it("непересекающиеся смены делят одну дорожку", () => {
    const lanes = packIntoLanes([
      occ({ startTime: "09:00", endTime: "12:00" }),
      occ({ employeeId: 11, startTime: "12:00", endTime: "17:00" }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].segments).toHaveLength(2);
  });

  it("пересекающиеся смены разъезжаются на две дорожки", () => {
    const lanes = packIntoLanes([
      occ({ startTime: "09:00", endTime: "14:00" }),
      occ({ employeeId: 11, startTime: "13:00", endTime: "17:00" }),
    ]);
    expect(lanes).toHaveLength(2);
  });

  it("ночная смена через полночь рисуется до конца окна", () => {
    const [lane] = packIntoLanes([occ({ startTime: "20:00", endTime: "02:00" })]);
    expect(lane.segments[0].startMin).toBe(20 * 60);
    expect(lane.segments[0].endMin).toBe(MONTH_DAY_END_MIN);
  });

  it("смена целиком до 07:00 прижимается к левому краю с мин. шириной", () => {
    const [lane] = packIntoLanes([occ({ startTime: "05:00", endTime: "06:30" })]);
    expect(lane.segments[0].startMin).toBe(MONTH_DAY_START_MIN);
    expect(lane.segments[0].endMin).toBe(MONTH_DAY_START_MIN + MONTH_MIN_SEG_MIN);
  });

  it("смена целиком после 22:00 прижимается к правому краю", () => {
    const [lane] = packIntoLanes([occ({ startTime: "22:00", endTime: "23:00" })]);
    expect(lane.segments[0].startMin).toBe(MONTH_DAY_END_MIN - MONTH_MIN_SEG_MIN);
    expect(lane.segments[0].endMin).toBe(MONTH_DAY_END_MIN);
  });

  it("короткая смена внутри окна растягивается до минимальной ширины", () => {
    const [lane] = packIntoLanes([occ({ startTime: "10:00", endTime: "10:05" })]);
    const seg = lane.segments[0];
    expect(seg.endMin - seg.startMin).toBe(MONTH_MIN_SEG_MIN);
    expect(seg.startMin).toBeGreaterThanOrEqual(MONTH_DAY_START_MIN);
    expect(seg.endMin).toBeLessThanOrEqual(MONTH_DAY_END_MIN);
  });
});

describe("hourlyOccupancy", () => {
  it("возвращает 15 слотов (07..21)", () => {
    expect(hourlyOccupancy([])).toHaveLength(15);
  });

  it("считает уникальных сотрудников в каждый час", () => {
    const slots = hourlyOccupancy([
      occ({ employeeId: 10, startTime: "09:00", endTime: "12:00" }),
      occ({ employeeId: 11, startTime: "10:00", endTime: "13:00" }),
    ]);
    // Индекс = час − 7.
    expect(slots[9 - 7]).toBe(1); // 09:00 — только первый
    expect(slots[10 - 7]).toBe(2); // 10:00 — оба
    expect(slots[12 - 7]).toBe(1); // 12:00 — первый уже ушёл (end exclusive)
    expect(slots[13 - 7]).toBe(0);
  });

  it("сотрудник с двумя сегментами (обед) считается один раз", () => {
    const slots = hourlyOccupancy([
      occ({ startTime: "09:00", endTime: "13:00", sourceId: 1 }),
      occ({ startTime: "14:00", endTime: "18:00", sourceId: 1 }),
    ]);
    expect(slots[10 - 7]).toBe(1);
    expect(slots[13 - 7]).toBe(0); // обеденный час — никого
    expect(slots[15 - 7]).toBe(1);
  });
});
