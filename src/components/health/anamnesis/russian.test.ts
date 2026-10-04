import { describe, expect, it } from "vitest";

import {
  ageGenitive,
  ageNominative,
  ageParts,
  decimal,
  gestationText,
  joinAnd,
  lowerFirst,
  monthYear,
  ordinalDays,
  ordinalFem,
  ordinalGenPlural,
  plural,
  timesText,
} from "./russian";

describe("russian", () => {
  it("порядковые: от 2-й, 2-х, 1-е, 3-и, 13-е, 23-и", () => {
    expect(ordinalFem(2)).toBe("2-й");
    expect(ordinalGenPlural(7)).toBe("7-х");
    expect([1, 2, 3, 4, 13, 23, 33, 113].map(ordinalDays)).toEqual(["1-е", "2-е", "3-и", "4-е", "13-е", "23-и", "33-и", "113-е"]);
  });

  it("множественное число", () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, "год", "года", "лет"))).toEqual(["год", "года", "лет", "лет", "год", "года", "лет"]);
    expect(timesText(3)).toBe("3 раза");
    expect(timesText(5)).toBe("5 раз");
  });

  it("числа, срок, месяцы", () => {
    expect(decimal(50)).toBe("50");
    expect(decimal(50.5)).toBe("50,5");
    expect(decimal(6.04)).toBe("6");
    expect(gestationText(39, 0)).toBe("39 нед");
    expect(gestationText(39, 2)).toBe("39 нед 2 дн");
    expect(monthYear("2025-12-12")).toBe("декабрь 2025");
  });

  it("строчная буква и списки", () => {
    expect(lowerFirst("Острый бронхит")).toBe("острый бронхит");
    expect(lowerFirst("ОРВИ")).toBe("ОРВИ");
    expect(joinAnd(["а", "б", "в"])).toBe("а, б и в");
    expect(joinAnd(["а"])).toBe("а");
  });

  it("возраст в падежах", () => {
    const age = (on: string) => ageParts("2025-03-26", on)!;
    expect(ageNominative(age("2026-03-26"))).toBe("1 год");
    expect(ageNominative(age("2026-09-30"))).toBe("1 год 6 мес");
    expect(ageNominative(age("2025-04-05"))).toBe("10 дн");
    expect(ageGenitive(age("2025-09-26"))).toBe("6 мес");
    expect(ageGenitive(age("2026-05-26"))).toBe("1 года 2 мес");
    expect(ageGenitive(age("2027-03-26"))).toBe("2 лет");
    expect(ageParts("2025-03-26", "2025-03-25")).toBeNull();
  });
});
