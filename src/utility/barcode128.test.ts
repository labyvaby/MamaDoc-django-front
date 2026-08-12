import { describe, it, expect } from "vitest";

import { code128bModules, barcode128Svg } from "./barcode128";
import { amountInWordsKgs, integerInWords } from "./amountInWords";

describe("Code 128", () => {
  it("каждый символ занимает 11 модулей (стоп — 13)", () => {
    // Инвариант стандарта: опечатка в таблице паттернов ломает именно его,
    // а неверный штрихкод на бумаге незаметен до попытки сканирования.
    const modules = code128bModules("12345");
    const total = modules.reduce((s, m) => s + m, 0);
    // 5 символов + старт + контрольная сумма = 7 паттернов по 11 + стоп 13.
    expect(total).toBe(7 * 11 + 13);
  });

  it("полосы чередуются, код начинается и заканчивается чёрной", () => {
    const modules = code128bModules("A1");
    expect(modules.length % 2).toBe(1); // нечётное → последняя полоса чёрная
    expect(modules.every((m) => m >= 1 && m <= 4)).toBe(true);
  });

  it("контрольная сумма меняется вместе со значением", () => {
    expect(code128bModules("105")).not.toEqual(code128bModules("106"));
  });

  it("пустое значение не рисует SVG", () => {
    expect(barcode128Svg("")).toBe("");
    expect(barcode128Svg("105")).toContain("<svg");
  });
});

describe("сумма прописью", () => {
  it("ноль", () => {
    expect(amountInWordsKgs(0)).toBe("Ноль сомов 00 тыйынов");
  });

  it("склоняет сом по последней цифре", () => {
    expect(amountInWordsKgs(1)).toBe("Один сом 00 тыйынов");
    expect(amountInWordsKgs(2)).toBe("Два сома 00 тыйынов");
    expect(amountInWordsKgs(5)).toBe("Пять сомов 00 тыйынов");
    expect(amountInWordsKgs(11)).toBe("Одиннадцать сомов 00 тыйынов");
    expect(amountInWordsKgs(21)).toBe("Двадцать один сом 00 тыйынов");
  });

  it("тысячи — женского рода", () => {
    expect(amountInWordsKgs(1500)).toBe("Одна тысяча пятьсот сомов 00 тыйынов");
    expect(amountInWordsKgs(2000)).toBe("Две тысячи сомов 00 тыйынов");
    expect(amountInWordsKgs(5000)).toBe("Пять тысяч сомов 00 тыйынов");
  });

  it("тыйын — цифрами, с округлением", () => {
    expect(amountInWordsKgs(1500.5)).toBe("Одна тысяча пятьсот сомов 50 тыйынов");
    expect(amountInWordsKgs(1500.999)).toBe("Одна тысяча пятьсот один сом 00 тыйынов");
    expect(amountInWordsKgs(0.01)).toBe("Ноль сомов 01 тыйын");
  });

  it("миллионы — мужского рода", () => {
    expect(integerInWords(1_000_000)).toBe("один миллион");
    expect(integerInWords(2_345_678)).toBe(
      "два миллиона триста сорок пять тысяч шестьсот семьдесят восемь",
    );
  });
});
