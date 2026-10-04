import { describe, expect, it } from "vitest";

import { diffStats, diffWords, sameText, type DiffPart } from "./textDiff";

/** Текст «до» и «после» обязан собираться из частей без потерь. */
const before = (parts: DiffPart[]) =>
  parts.filter((p) => p.kind !== "added").map((p) => p.text).join("");
const after = (parts: DiffPart[]) =>
  parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("");

describe("diffWords", () => {
  const cases: Array<[string, string]> = [
    ["", "Жалоб нет."],
    ["Жалоб нет.", ""],
    ["жалобы на кашель", "Жалобы на сухой кашель."],
    ["Температура 37,5. Зев чистый", "Температура 37,5 °C.\nЗев спокоен, чистый."],
    ["a X Y b", "a b"],
    ["один два три", "четыре пять шесть"],
    ["  двойные   пробелы ", "двойные пробелы"],
  ];

  it.each(cases)("не теряет текст: %j → %j", (a, b) => {
    const parts = diffWords(a, b);
    expect(before(parts)).toBe(a);
    expect(after(parts)).toBe(b);
  });

  it("одинаковый текст — одна неизменная часть", () => {
    expect(diffWords("Жалоб нет.", "Жалоб нет.")).toEqual([{ kind: "same", text: "Жалоб нет." }]);
    expect(diffWords("", "")).toEqual([]);
  });

  it("правку по словам, а не по буквам: общее слово остаётся нетронутым", () => {
    const parts = diffWords("жалобы на кашель", "жалобы на сухой кашель");
    expect(parts).toEqual([
      { kind: "same", text: "жалобы на " },
      { kind: "added", text: "сухой " },
      { kind: "same", text: "кашель" },
    ]);
  });

  it("замену нескольких слов подряд показывает одним куском, а не чередой", () => {
    const parts = diffWords("один два три", "четыре пять шесть");
    expect(parts.map((p) => p.kind)).toEqual(["removed", "added"]);
  });

  it("огромный текст не считает LCS — заменяет целиком", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `a${i}`).join(" ");
    const b = `${a} конец`;
    const parts = diffWords(a, b);
    expect(parts).toEqual([
      { kind: "removed", text: a },
      { kind: "added", text: b },
    ]);
  });
});

describe("diffStats", () => {
  it("считает слова, а не пробелы", () => {
    expect(diffStats(diffWords("жалобы на кашель", "жалобы на сухой ночной кашель"))).toEqual({
      added: 2,
      removed: 0,
    });
  });
});

describe("sameText", () => {
  it("пробелы и переводы строк не в счёт", () => {
    expect(sameText("Жалоб  нет.\n", " Жалоб нет.")).toBe(true);
    expect(sameText("Жалоб нет.", "Жалоб нет")).toBe(false);
  });
});
