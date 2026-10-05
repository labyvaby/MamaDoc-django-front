import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { customPeriod, describeRange, monthLabel, periodFor, periodTitle, shiftPeriod, toApiDate } from "./period";

const TODAY = dayjs("2026-10-04");

describe("periodFor", () => {
  it("год до конца текущего месяца", () => {
    const p = periodFor("year", TODAY, TODAY);
    expect([toApiDate(p.from), toApiDate(p.to)]).toEqual(["2026-01-01", "2026-10-31"]);
  });

  it("прошлый год целиком", () => {
    const p = periodFor("year", dayjs("2025-05-31"), TODAY);
    expect([toApiDate(p.from), toApiDate(p.to)]).toEqual(["2025-01-01", "2025-12-31"]);
  });

  it("квартал от 31-го числа не перескакивает месяц", () => {
    const p = periodFor("quarter", dayjs("2026-08-31"), TODAY);
    expect([toApiDate(p.from), toApiDate(p.to)]).toEqual(["2026-07-01", "2026-09-30"]);
  });

  it("месяц", () => {
    const p = periodFor("month", dayjs("2026-02-10"), TODAY);
    expect([toApiDate(p.from), toApiDate(p.to)]).toEqual(["2026-02-01", "2026-02-28"]);
  });
});

describe("shiftPeriod", () => {
  it("листает квартал и год", () => {
    expect(toApiDate(shiftPeriod(periodFor("quarter", dayjs("2026-08-01"), TODAY), -1, TODAY).from)).toBe("2026-04-01");
    expect(toApiDate(shiftPeriod(periodFor("year", TODAY, TODAY), -1, TODAY).to)).toBe("2025-12-31");
  });

  it("свой период не листается", () => {
    const p = customPeriod(dayjs("2026-02-01"), dayjs("2026-03-15"));
    expect(shiftPeriod(p, 1, TODAY)).toBe(p);
  });
});

describe("подписи", () => {
  it("describeRange", () => {
    expect(describeRange(dayjs("2026-09-01"), dayjs("2026-09-30"))).toBe("сентябрь 2026");
    expect(describeRange(dayjs("2025-01-01"), dayjs("2025-12-31"))).toBe("2025");
    expect(describeRange(dayjs("2026-01-01"), dayjs("2026-09-30"))).toBe("январь–сентябрь 2026");
    expect(describeRange(dayjs("2025-11-01"), dayjs("2026-02-28"))).toBe("ноябрь 2025 – февраль 2026");
    expect(describeRange(dayjs("2026-02-01"), dayjs("2026-03-15"))).toBe("01.02.2026–15.03.2026");
  });

  it("periodTitle квартала и года", () => {
    expect(periodTitle(periodFor("quarter", dayjs("2026-08-01"), TODAY))).toBe("III квартал 2026");
    expect(periodTitle(periodFor("year", TODAY, TODAY))).toBe("январь–октябрь 2026");
  });

  it("monthLabel", () => {
    expect(monthLabel("2026-01")).toBe("янв");
    expect(monthLabel("2026-01", true)).toBe("янв 2026");
  });
});
