import { describe, it, expect } from "vitest";
import { expandShortYear, expandShortYearInText } from "./shortYear";

/**
 * Инварианты дописывания века у короткого года.
 * Текущий год в тестах фиксирован (2026), чтобы проверки не «поехали» в январе.
 */
describe("expandShortYear", () => {
  const NOW = 2026;

  it("режим past: год не уходит в будущее", () => {
    expect(expandShortYear(27, "past", NOW)).toBe(1927); // 2027 был бы в будущем
    expect(expandShortYear(95, "past", NOW)).toBe(1995);
    expect(expandShortYear(20, "past", NOW)).toBe(2020);
    expect(expandShortYear(26, "past", NOW)).toBe(2026);
    expect(expandShortYear(0, "past", NOW)).toBe(2000);
    expect(expandShortYear(5, "past", NOW)).toBe(2005);
  });

  it("режим future: год не уходит в прошлое", () => {
    expect(expandShortYear(27, "future", NOW)).toBe(2027);
    expect(expandShortYear(26, "future", NOW)).toBe(2026);
    expect(expandShortYear(30, "future", NOW)).toBe(2030);
  });

  it("режим nearest: ближайший год в любую сторону", () => {
    expect(expandShortYear(27, "nearest", NOW)).toBe(2027);
    expect(expandShortYear(95, "nearest", NOW)).toBe(1995);
    expect(expandShortYear(80, "nearest", NOW)).toBe(1980);
  });

  it("четырехзначный год и режим off не меняются", () => {
    expect(expandShortYear(1995, "past", NOW)).toBe(1995);
    expect(expandShortYear(2030, "past", NOW)).toBe(2030);
    expect(expandShortYear(27, "off", NOW)).toBe(27);
  });

  it("правило века не привязано к 2000-м", () => {
    expect(expandShortYear(3, "past", 2103)).toBe(2103);
    expect(expandShortYear(5, "past", 2103)).toBe(2005); // 2105 был бы в будущем
    expect(expandShortYear(50, "past", 2103)).toBe(2050);
    expect(expandShortYear(99, "past", 1999)).toBe(1999);
  });
});

/**
 * Разбор набранного в поле текста. Так короткий год и приходит из MUI X:
 * секция года дополняется нулями («0095»), а само значение пикер считает невалидным.
 */
describe("expandShortYearInText", () => {
  const NOW = 2026;
  const FMT = "DD.MM.YYYY";

  it("разворачивает год из набранного текста", () => {
    expect(expandShortYearInText("27.07.0095", FMT, "past", NOW)).toBe("1995-07-27");
    expect(expandShortYearInText("27.07.0027", FMT, "past", NOW)).toBe("1927-07-27");
    expect(expandShortYearInText("27.07.0027", FMT, "future", NOW)).toBe("2027-07-27");
    expect(expandShortYearInText("01.01.0005", FMT, "past", NOW)).toBe("2005-01-01");
  });

  it("не трогает полный год и неполный ввод", () => {
    expect(expandShortYearInText("27.07.1995", FMT, "past", NOW)).toBeNull();
    expect(expandShortYearInText("27.07.ГГГГ", FMT, "past", NOW)).toBeNull();
    expect(expandShortYearInText("ДД.ММ.ГГГГ", FMT, "past", NOW)).toBeNull();
    expect(expandShortYearInText("", FMT, "past", NOW)).toBeNull();
    expect(expandShortYearInText("27.07.0095", FMT, "off", NOW)).toBeNull();
  });

  it("не выдумывает несуществующие даты", () => {
    expect(expandShortYearInText("31.02.0095", FMT, "past", NOW)).toBeNull();
    expect(expandShortYearInText("29.02.0095", FMT, "past", NOW)).toBeNull(); // 1995 не високосный
    expect(expandShortYearInText("29.02.0096", FMT, "past", NOW)).toBe("1996-02-29");
  });

  it("учитывает порядок частей в формате", () => {
    expect(expandShortYearInText("0095-07-27", "YYYY-MM-DD", "past", NOW)).toBe("1995-07-27");
    expect(expandShortYearInText("07/27/0095", "MM/DD/YYYY", "past", NOW)).toBe("1995-07-27");
    expect(expandShortYearInText("27.07.95", "DD.MM.YY", "past", NOW)).toBeNull();
  });
});
