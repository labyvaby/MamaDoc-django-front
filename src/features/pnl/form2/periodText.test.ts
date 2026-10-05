import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { isFullYear, kyrgyzPeriod, russianPeriod } from "./periodText";

describe("период для формы №2", () => {
  it("кыргызский — как в шаблоне", () => {
    expect(kyrgyzPeriod(dayjs("2028-01-01"), dayjs("2028-12-31"))).toBe("2028-жылдын 1-январынан 31-декабрына чейин");
  });

  it.each([
    [1, "январынан", "январына"], [2, "февралынан", "февралына"], [3, "мартынан", "мартына"],
    [4, "апрелинен", "апрелине"], [5, "майынан", "майына"], [6, "июнунан", "июнуна"],
    [7, "июлунан", "июлуна"], [8, "августунан", "августуна"], [9, "сентябрынан", "сентябрына"],
    [10, "октябрынан", "октябрына"], [11, "ноябрынан", "ноябрына"], [12, "декабрынан", "декабрына"],
  ])("месяц %i", (month, from, to) => {
    const day = dayjs(`2026-${String(month).padStart(2, "0")}-01`);
    expect(kyrgyzPeriod(day, day.endOf("month"))).toBe(`2026-жылдын 1-${from} ${day.daysInMonth()}-${to} чейин`);
  });

  it("кыргызский через год", () => {
    expect(kyrgyzPeriod(dayjs("2025-10-01"), dayjs("2026-09-30"))).toBe(
      "2025-жылдын 1-октябрынан 2026-жылдын 30-сентябрына чейин",
    );
  });

  it("русский", () => {
    expect(russianPeriod(dayjs("2026-01-01"), dayjs("2026-09-30"))).toBe(
      "за период с 1 января 2026 г. по 30 сентября 2026 г.",
    );
  });

  it("целый год", () => {
    expect(isFullYear(dayjs("2026-01-01"), dayjs("2026-12-31"))).toBe(true);
    expect(isFullYear(dayjs("2026-01-01"), dayjs("2026-09-30"))).toBe(false);
  });
});
