import { describe, expect, it } from "vitest";

import type { DayOccurrence } from "./occurrences";
import {
  computeWeekWindow,
  hourTicks,
  windowPct,
  DEFAULT_WEEK_WINDOW,
  MIN_WINDOW_MIN,
} from "./weekWindow";

const occ = (startTime: string, endTime: string): DayOccurrence => ({
  employeeId: 1,
  employeeName: "Аббасова Айгерим",
  startTime,
  endTime,
  kind: "rule",
  sourceId: 1,
  lunch: null,
});

describe("computeWeekWindow", () => {
  it("без смен отдаёт окно по умолчанию", () => {
    expect(computeWeekWindow([])).toEqual(DEFAULT_WEEK_WINDOW);
  });

  it("сужается до графика недели с запасом в полчаса", () => {
    // 09:00–17:00 и 08:00–18:00 → 07:30…18:30 → округление до часа.
    expect(computeWeekWindow([occ("09:00", "17:00"), occ("08:00", "18:00")])).toEqual({
      startMin: 7 * 60,
      endMin: 19 * 60,
    });
  });

  it("одна короткая смена не растягивается на всю колонку", () => {
    const w = computeWeekWindow([occ("10:00", "12:00")]);
    expect(w.endMin - w.startMin).toBe(MIN_WINDOW_MIN);
    // Смена остаётся внутри окна.
    expect(w.startMin).toBeLessThanOrEqual(10 * 60);
    expect(w.endMin).toBeGreaterThanOrEqual(12 * 60);
  });

  it("ночную смену тянет до конца суток", () => {
    expect(computeWeekWindow([occ("20:00", "02:00")]).endMin).toBe(24 * 60);
  });

  it("не выходит за границы суток", () => {
    const w = computeWeekWindow([occ("00:00", "23:30")]);
    expect(w.startMin).toBe(0);
    expect(w.endMin).toBe(24 * 60);
  });
});

describe("windowPct", () => {
  const w = { startMin: 8 * 60, endMin: 18 * 60 };

  it("края окна дают 0 и 100", () => {
    expect(windowPct(8 * 60, w)).toBe(0);
    expect(windowPct(18 * 60, w)).toBe(100);
  });

  it("середина окна — 50", () => {
    expect(windowPct(13 * 60, w)).toBe(50);
  });

  it("время вне окна прижимается к краю", () => {
    expect(windowPct(6 * 60, w)).toBe(0);
    expect(windowPct(23 * 60, w)).toBe(100);
  });
});

describe("hourTicks", () => {
  it("у привычного окна 07–22 шаг остаётся трёхчасовым", () => {
    expect(hourTicks({ startMin: 7 * 60, endMin: 22 * 60 })).toEqual([9, 12, 15, 18]);
  });

  it("у более узкого окна метки становятся чаще", () => {
    expect(hourTicks({ startMin: 8 * 60, endMin: 18 * 60 })).toEqual([10, 12, 14, 16]);
  });

  it("края окна не подписываются", () => {
    const ticks = hourTicks({ startMin: 9 * 60, endMin: 17 * 60 });
    expect(ticks).not.toContain(9);
    expect(ticks).not.toContain(17);
  });

  it("меток не больше пяти", () => {
    expect(hourTicks({ startMin: 0, endMin: 24 * 60 }).length).toBeLessThanOrEqual(5);
  });
});
