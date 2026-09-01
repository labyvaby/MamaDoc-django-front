import { describe, expect, it } from "vitest";

import {
  formatDuration,
  lunchMinutes,
  netShiftMinutes,
  occurrenceNote,
  shiftMinutes,
  type DayOccurrence,
} from "./occurrences";

const occ = (over: Partial<DayOccurrence> = {}): DayOccurrence => ({
  employeeId: 10,
  employeeName: "Аббасова Айгерим",
  startTime: "09:00",
  endTime: "17:00",
  kind: "rule",
  sourceId: 1,
  lunch: null,
  ...over,
});

describe("длительность смены", () => {
  it("считает часы смены", () => {
    expect(shiftMinutes(occ())).toBe(480);
  });

  it("ночную смену считает до конца суток", () => {
    // 20:00–02:00: в дне, к которому смена привязана, отработано 4 часа.
    expect(shiftMinutes(occ({ startTime: "20:00", endTime: "02:00" }))).toBe(240);
  });

  it("вычитает обед из рабочего времени", () => {
    const withLunch = occ({ lunch: { start: "13:00", end: "14:00" } });
    expect(lunchMinutes(withLunch)).toBe(60);
    expect(netShiftMinutes(withLunch)).toBe(420);
  });

  it("без обеда чистое время равно длительности", () => {
    expect(netShiftMinutes(occ())).toBe(480);
  });
});

describe("formatDuration", () => {
  it("часы без минут", () => {
    expect(formatDuration(480)).toBe("8 ч");
  });

  it("часы с минутами", () => {
    expect(formatDuration(450)).toBe("7 ч 30 мин");
  });

  it("меньше часа — только минуты", () => {
    expect(formatDuration(45)).toBe("45 мин");
  });

  it("ноль и отрицательное не ломают подпись", () => {
    expect(formatDuration(0)).toBe("0 мин");
    expect(formatDuration(-30)).toBe("0 мин");
  });
});

describe("occurrenceNote", () => {
  it("смена без обеда — часы и длительность", () => {
    expect(occurrenceNote(occ())).toBe("09:00–17:00 · 8 ч");
  });

  it("смена с обедом — плюс перерыв и чистое время", () => {
    expect(occurrenceNote(occ({ lunch: { start: "13:00", end: "14:00" } }))).toBe(
      "09:00–17:00 · 8 ч · обед 13:00–14:00 · чистых 7 ч",
    );
  });

  it("точечную смену помечает отдельно", () => {
    expect(occurrenceNote(occ({ kind: "extra" }))).toBe("09:00–17:00 · 8 ч · точечная смена");
  });
});
