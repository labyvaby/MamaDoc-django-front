import { describe, expect, it } from "vitest";
import {
  ageFromRow,
  ageToPayload,
  defaultGroupLabel,
  formatMonths,
  formatRowAge,
  maxAgeFromRow,
  maxAgeToPayload,
  rowSummary,
} from "./calendarRowForm";

describe("calendarRowForm", () => {
  it("возраст строки → поле и обратно", () => {
    expect(ageFromRow({ ageMonths: 4, ageDays: 135 })).toEqual({ mode: "days", days: "135" });
    expect(ageFromRow({ ageMonths: 138, ageDays: null })).toEqual({ mode: "ym", years: "11", months: "6" });
    expect(ageFromRow({ ageMonths: 24, ageDays: null })).toEqual({ mode: "ym", years: "2", months: "" });
    expect(ageFromRow({ ageMonths: 2, ageDays: null })).toEqual({ mode: "ym", years: "", months: "2" });
    expect(ageFromRow({ ageMonths: 0, ageDays: null })).toEqual({ mode: "ym", years: "", months: "0" });
    expect(ageToPayload({ mode: "days", days: "135" })).toEqual({ ageMonths: 4, ageDays: 135 });
    expect(ageToPayload({ mode: "ym", years: "11", months: "6" })).toEqual({ ageMonths: 138, ageDays: null });
    expect(ageToPayload({ mode: "ym", years: "", months: "" })).toBeNull();
  });

  it("не назначать старше", () => {
    expect(maxAgeFromRow({ maxAgeMonths: 168 })).toEqual({ mode: "ym", years: "14", months: "" });
    expect(maxAgeToPayload({ mode: "ym", years: "5", months: "" })).toBe(60);
    expect(maxAgeToPayload({ mode: "ym", years: "", months: "" })).toBeNull();
  });

  it("возраст человеческим языком", () => {
    expect(formatMonths(132)).toBe("11 лет");
    expect(formatMonths(138)).toBe("11 лет 6 мес.");
    expect(formatMonths(18)).toBe("1 год 6 мес.");
    expect(formatMonths(2)).toBe("2 мес.");
    expect(formatRowAge({ ageMonths: 0, ageDays: 0 })).toBe("При рождении");
    expect(formatRowAge({ ageMonths: 3, ageDays: 105 })).toBe("105 дн.");
  });

  it("подпись и сводка простыми словами", () => {
    expect(defaultGroupLabel({ mode: "days", days: "0" })).toBe("При рождении");
    expect(defaultGroupLabel({ mode: "ym", years: "", months: "3" })).toBe("3 месяца");
    expect(
      rowSummary({
        vaccineName: "БЦЖ",
        doseNumber: "1",
        age: { mode: "ym", years: "", months: "0" },
        windowDays: "30",
        maxAge: { mode: "ym", years: "5", months: "" },
        sex: "any",
      }),
    ).toEqual([
      "БЦЖ, 1-я доза — при рождении.",
      "В срок — с рождения до 1 месяца; позже — просрочена.",
      "Старше 5 лет не назначается.",
      "Всем детям.",
    ]);
    expect(
      rowSummary({
        vaccineName: "ВПЧ",
        doseNumber: "2",
        age: { mode: "ym", years: "11", months: "6" },
        windowDays: "365",
        maxAge: { mode: "ym", years: "", months: "" },
        sex: "female",
      }),
    ).toEqual([
      "ВПЧ, 2-я доза — в 11 лет 6 месяцев.",
      "В срок — с 11 лет 6 месяцев до 12 лет 6 месяцев; позже — просрочена.",
      "Только девочкам.",
    ]);
  });
});
