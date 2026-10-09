import { describe, expect, it } from "vitest";

import { bitsToModules, ean13Bits, ean13CheckDigit, isValidEan13 } from "./ean13";

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const flip = (bits: string) => bits.replace(/[01]/g, (b) => (b === "0" ? "1" : "0"));
const R = L.map(flip);
const G = R.map((bits) => bits.split("").reverse().join(""));

/** Обратное преобразование: по полосам восстановить цифры. */
function decode(bits: string): string {
  const left = bits.slice(3, 45);
  const right = bits.slice(50, 92);
  let parity = "";
  let digits = "";
  for (let i = 0; i < 6; i += 1) {
    const chunk = left.slice(i * 7, i * 7 + 7);
    const l = L.indexOf(chunk);
    parity += l >= 0 ? "L" : "G";
    digits += String(l >= 0 ? l : G.indexOf(chunk));
  }
  for (let i = 0; i < 6; i += 1) digits += String(R.indexOf(right.slice(i * 7, i * 7 + 7)));
  const first = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"].indexOf(parity);
  return `${first}${digits}`;
}

describe("EAN-13", () => {
  it("считает контрольную цифру", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("590123412345")).toBe(7);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("12345")).toBe(false);
    expect(isValidEan13("ABC6381333931")).toBe(false);
  });

  it("кодирует в 95 модулей с охранными знаками", () => {
    const bits = ean13Bits("5901234123457");
    expect(bits).toHaveLength(95);
    expect(bits.slice(0, 3)).toBe("101");
    expect(bits.slice(45, 50)).toBe("01010");
    expect(bits.slice(92)).toBe("101");
  });

  it("полосы читаются обратно в тот же код", () => {
    for (const code of ["5901234123457", "4006381333931", "2000000000015", "0000000000000"]) {
      expect(decode(ean13Bits(code))).toBe(code);
    }
  });

  it("не рисует невалидный код", () => {
    expect(() => ean13Bits("5901234123458")).toThrow();
  });

  it("ширины полос начинаются с полосы и дают 95 модулей", () => {
    const modules = bitsToModules(ean13Bits("4006381333931"));
    expect(modules.slice(0, 3)).toEqual([1, 1, 1]);
    expect(modules.reduce((sum, m) => sum + m, 0)).toBe(95);
  });
});
