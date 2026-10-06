import { describe, it, expect } from "vitest";
import dayjs from "dayjs";

import { parsePeriod } from "./useRegistryFilters";

const current = { year: dayjs().year(), month: dayjs().month() };

describe("parsePeriod: срез журнала из ссылки", () => {
  it("месяц и весь год", () => {
    expect(parsePeriod("2026-08")).toEqual({ year: 2026, month: 7 });
    expect(parsePeriod("2026")).toEqual({ year: 2026, month: null });
  });

  it("свой период", () => {
    expect(parsePeriod("2026-08-10_2026-09-05")).toEqual({
      year: 2026,
      month: 7,
      range: { from: "2026-08-10", to: "2026-09-05" },
    });
  });

  it("один день — тоже период", () => {
    expect(parsePeriod("2026-09-29_2026-09-29").range).toEqual({ from: "2026-09-29", to: "2026-09-29" });
  });

  it("битая ссылка — текущий месяц, а не пустой журнал", () => {
    expect(parsePeriod(null)).toEqual(current);
    expect(parsePeriod("2026-13")).toEqual(current);
    expect(parsePeriod("2026-8-1_2026-8-5")).toEqual(current); // не YYYY-MM-DD
    expect(parsePeriod("2026-09-10_2026-09-01")).toEqual(current); // конец раньше начала
    expect(parsePeriod("2020-01-01_2026-01-01")).toEqual(current); // длиннее двух лет
  });
});
