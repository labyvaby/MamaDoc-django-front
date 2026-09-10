import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import {
  buildMonthOptions,
  formatMonthLabel,
  monthKeyForRange,
  rangeForMonth,
} from "./monthFilter";

describe("rangeForMonth", () => {
  it("отдаёт границы календарного месяца", () => {
    expect(rangeForMonth("2026-09")).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("учитывает високосный февраль", () => {
    expect(rangeForMonth("2024-02").endDate).toBe("2024-02-29");
  });
});

describe("monthKeyForRange", () => {
  it("узнаёт период, равный одному месяцу", () => {
    expect(monthKeyForRange("2026-08-01", "2026-08-31")).toBe("2026-08");
  });

  it("не узнаёт произвольный период", () => {
    expect(monthKeyForRange("2026-08-01", "2026-09-30")).toBeNull();
    expect(monthKeyForRange("2026-08-05", "2026-08-31")).toBeNull();
    expect(monthKeyForRange("2026-08-01", "2026-08-20")).toBeNull();
  });

  it("не падает на пустых и битых датах", () => {
    expect(monthKeyForRange("", "2026-08-31")).toBeNull();
    expect(monthKeyForRange("2026-08-01", "не дата")).toBeNull();
  });
});

describe("buildMonthOptions", () => {
  const today = dayjs("2026-09-10");

  it("показывает текущий месяц первым и заканчивает годом назад", () => {
    const options = buildMonthOptions(null, 12, today);
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ value: "2026-09", label: "Сентябрь 2026" });
    expect(options[11].value).toBe("2025-10");
  });

  it("добавляет выбранный месяц вне окна", () => {
    const options = buildMonthOptions("2024-03", 12, today);
    expect(options).toHaveLength(13);
    expect(options.at(-1)).toEqual({ value: "2024-03", label: "Март 2024" });
  });

  it("не дублирует выбранный месяц из окна", () => {
    expect(buildMonthOptions("2026-09", 12, today)).toHaveLength(12);
  });
});

describe("formatMonthLabel", () => {
  it("подписывает месяц по-русски", () => {
    expect(formatMonthLabel("2026-01")).toBe("Январь 2026");
    expect(formatMonthLabel("2026-12")).toBe("Декабрь 2026");
  });
});
