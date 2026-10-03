import { describe, expect, it } from "vitest";

import { matchesByParts, phoneVariants, searchWords } from "./searchParts";

describe("searchWords", () => {
  it("слова, а телефон с пробелами и скобками — одним словом", () => {
    expect(searchWords("  Иван   Иванов ")).toEqual(["Иван", "Иванов"]);
    expect(searchWords("+996 (555) 58-88-74")).toEqual(["996555588874"]);
    expect(searchWords("0555 58 88 74")).toEqual(["0555588874"]);
    expect(searchWords("201 202")).toEqual(["201", "202"]);
    expect(searchWords("")).toEqual([]);
  });

  it("местный номер с нулём ищется и без нуля", () => {
    expect(phoneVariants("0555588874")).toEqual(["0555588874", "555588874"]);
    expect(phoneVariants("12")).toEqual([]);
  });
});

describe("matchesByParts", () => {
  const bekova = { texts: ["Айгерим Бекова", "ОсОО «Альфа»", "BK-778"], phones: ["+996555111002"], exact: ["201", 18] };

  it("слова в любом порядке, е = ё, регистр не важен", () => {
    expect(matchesByParts("бекова айгерим", bekova)).toBe(true);
    expect(matchesByParts("Королева", { texts: ["Королёва Анна"] })).toBe(true);
    expect(matchesByParts("альфа", bekova)).toBe(true);
  });

  it("все слова должны найтись", () => {
    expect(matchesByParts("Бекова 201", bekova)).toBe(true);
    expect(matchesByParts("Бекова 202", bekova)).toBe(false);
  });

  it("телефон по цифрам в любом виде", () => {
    expect(matchesByParts("0555 11 10 02", bekova)).toBe(true);
    expect(matchesByParts("111002", bekova)).toBe(true);
    expect(matchesByParts("700", bekova)).toBe(false);
  });

  it("короткое число — номер брони целиком, не часть текста", () => {
    expect(matchesByParts("18", bekova)).toBe(true);
    expect(matchesByParts("7", bekova)).toBe(false);
    expect(matchesByParts("", bekova)).toBe(true);
  });
});
