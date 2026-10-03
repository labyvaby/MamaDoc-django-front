import { describe, expect, it } from "vitest";

import type { CalendarTemplateRow } from "../../api/vaccinations";
import { doseAgeText, doseMaxAgeText, groupCalendarByVaccine } from "./calendarTable";

const row = (over: Partial<CalendarTemplateRow>): CalendarTemplateRow => ({
  id: 1,
  organizationId: 1,
  vaccineId: 1,
  vaccineName: "ИПВ",
  doseNumber: 1,
  ageMonths: 2,
  ageDays: null,
  maxAgeMonths: null,
  dueWindowDays: 30,
  mandatory: true,
  label: "",
  isActive: true,
  sex: "any",
  ...over,
});

describe("calendarTable", () => {
  it("одна строка на вакцину, дозы по номеру, порядок по первой дозе", () => {
    const groups = groupCalendarByVaccine([
      row({ id: 3, vaccineId: 2, vaccineName: "ИПВ", doseNumber: 2, ageDays: 105 }),
      row({ id: 2, vaccineId: 2, vaccineName: "ИПВ", doseNumber: 1, ageMonths: 2 }),
      row({ id: 1, vaccineId: 1, vaccineName: "БЦЖ", doseNumber: 1, ageMonths: 0, ageDays: 0 }),
      row({ id: 4, vaccineId: 3, vaccineName: "ВПЧ", doseNumber: 1, ageMonths: 132, sex: "female" }),
    ]);
    expect(groups.map((g) => [g.vaccineName, g.doses.map((d) => d.doseNumber), g.sexText, g.nextDose])).toEqual([
      ["БЦЖ", [1], "Всем", 2],
      ["ИПВ", [1, 2], "Всем", 3],
      ["ВПЧ", [1], "Девочкам", 2],
    ]);
  });

  it("возраст дозы словами", () => {
    expect(doseAgeText({ ageMonths: 0, ageDays: 0 })).toBe("При рождении");
    expect(doseAgeText({ ageMonths: 3, ageDays: 105 })).toBe("105 дн.");
    expect(doseAgeText({ ageMonths: 138, ageDays: null })).toBe("11 лет 6 мес.");
    expect(doseMaxAgeText({ maxAgeMonths: 168 })).toBe("до 14 лет");
    expect(doseMaxAgeText({ maxAgeMonths: null })).toBeNull();
  });
});
