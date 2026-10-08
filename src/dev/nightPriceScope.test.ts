import { describe, expect, it } from "vitest";

import { nightDatesForScope, nightsToChange, parsePriceInput } from "./nightPriceScope";

const nights = [
  { date: "2026-10-06", price: "1800.00" },
  { date: "2026-10-07", price: "1800.00" },
  { date: "2026-10-08", price: "2000.00" },
];

describe("nightDatesForScope", () => {
  it("«к выбранной дате» — только она", () => {
    expect(nightDatesForScope(nights, "2026-10-07", "date")).toEqual(["2026-10-07"]);
  });

  it("«к выбранной и последующим» — она и всё, что позже", () => {
    expect(nightDatesForScope(nights, "2026-10-07", "fromDate")).toEqual(["2026-10-07", "2026-10-08"]);
    expect(nightDatesForScope(nights, "2026-10-06", "fromDate")).toHaveLength(3);
  });

  it("«ко всем датам» — все ночи номера, и раньше выбранной тоже", () => {
    expect(nightDatesForScope(nights, "2026-10-08", "all")).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
  });

  it("дата не из ночей номера — ничего не выбирается", () => {
    expect(nightDatesForScope(nights, "2026-10-20", "date")).toEqual([]);
  });
});

describe("nightsToChange", () => {
  it("пропускает ночи, где цена уже такая", () => {
    expect(nightsToChange(nights, "2026-10-06", "all", 1800)).toEqual(["2026-10-08"]);
  });

  it("всё уже по этой цене — менять нечего", () => {
    expect(nightsToChange(nights, "2026-10-06", "date", 1800)).toEqual([]);
  });

  it("разница в копейки считается изменением, а «1800.00» и 1800 — нет", () => {
    expect(nightsToChange(nights, "2026-10-06", "date", 1800.5)).toEqual(["2026-10-06"]);
    expect(nightsToChange(nights, "2026-10-06", "date", 1800)).toEqual([]);
  });
});

describe("parsePriceInput", () => {
  it("понимает запятую и пробелы", () => {
    expect(parsePriceInput("3 150,5")).toBe(3150.5);
    expect(parsePriceInput("3150")).toBe(3150);
  });

  it("ноль допустим, пусто и мусор — нет", () => {
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-5")).toBeNull();
  });
});
