import { describe, expect, it } from "vitest";

import { ageTick, ageTicks, chartRange, formatNumber } from "./growthUi";

describe("growth ui helpers", () => {
  it("labels the age axis without repeats", () => {
    expect(ageTick(8)).toBe("8 мес.");
    expect(ageTick(60)).toBe("5 лет");
    expect(ageTick(24)).toBe("2 года");
    expect(ageTick(54)).toBe("4,5 г.");
    expect(ageTicks(42, 70)).toEqual([42, 48, 54, 60, 66]);
    expect(ageTicks(0, 12)).toEqual([0, 3, 6, 9, 12]);
    expect(ageTicks(40, 130)).toEqual([48, 60, 72, 84, 96, 108, 120]);
  });

  it("keeps the age axis on the measurements and the WHO corridors inside their table", () => {
    expect(chartRange([30, 42], 60)).toEqual({ from: 27, to: 48, curveTo: 48 });
    expect(chartRange([50, 62], 60)).toEqual({ from: 47, to: 68, curveTo: 60 });
    // Вес в 12,5 лет: таблица ВОЗ по весу кончается на 10 годах — ось по замеру, коридоров нет.
    expect(chartRange([150], 120)).toEqual({ from: 147, to: 156, curveTo: null });
    expect(chartRange([1], null)).toEqual({ from: 0, to: 7, curveTo: null });
  });

  it("prints numbers the Russian way", () => {
    expect(formatNumber(24, 1)).toBe("24");
    expect(formatNumber(24.5, 1)).toBe("24,5");
    expect(formatNumber(15.86, 1)).toBe("15,9");
  });
});

describe("valueAxis", () => {
  it("охватывает коридор ВОЗ и странную точку, деления круглые", async () => {
    const { valueAxis } = await import("./growthUi");
    expect(valueAxis([])).toBeNull();
    const axis = valueAxis([44, 96]);
    expect(axis?.domain).toEqual([40, 100]);
    expect(axis?.ticks).toEqual([40, 50, 60, 70, 80, 90, 100]);
    const wide = valueAxis([76, 90, 173]);
    expect(wide?.domain[0]).toBeLessThanOrEqual(76);
    expect(wide?.domain[1]).toBeGreaterThanOrEqual(173);
  });
});
