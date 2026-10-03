import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { canGoForward, periodBounds, periodLabel, shiftPeriod } from "./periodStep";

describe("PeriodStepper", () => {
  it("подпись словами", () => {
    expect(periodLabel("2026-09", "month")).toBe("Сентябрь 2026");
    expect(periodLabel("2026-09", "year")).toBe("2026 год");
  });

  it("шаг через границу года", () => {
    expect(shiftPeriod("2026-01", "month", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-12", "month", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-09", "year", -1)).toBe("2025-09");
  });

  it("вперёд — не дальше текущего периода", () => {
    const today = dayjs("2026-09-27");
    expect(canGoForward("2026-08", "month", today)).toBe(true);
    expect(canGoForward("2026-09", "month", today)).toBe(false);
    expect(canGoForward("2025-03", "year", today)).toBe(true);
    expect(canGoForward("2026-03", "year", today)).toBe(false);
  });
});

describe("periodBounds", () => {
  it("месяц и год целиком", () => {

    expect(periodBounds("2026-02", "month")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("2026-09", "year")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});
