/**
 * EAN-13 для этикеток товара — без внешних библиотек, как и `barcode128.ts`.
 *
 * Штрихкоды, которые CRM выдаёт товару сама, — EAN-13. Их можно было бы
 * печатать Code 128, но тринадцать цифр в Code 128B — 178 модулей против 95
 * у EAN-13: на этикетке 40 мм полосы становятся тоньше точки термопринтера,
 * и сканер на кассе код не читает.
 */

const L_CODES = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];

const invert = (bits: string): string =>
  bits.replace(/[01]/g, (bit) => (bit === "0" ? "1" : "0"));

/** R-коды — инверсия L, G-коды — R задом наперёд. */
const R_CODES = L_CODES.map(invert);
const G_CODES = R_CODES.map((bits) => bits.split("").reverse().join(""));

/** Первая цифра кодируется не полосами, а чередованием L/G слева. */
const PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/** Контрольная цифра для первых двенадцати. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** 95 модулей EAN-13 строкой из «1» (полоса) и «0» (пробел). */
export function ean13Bits(code: string): string {
  if (!isValidEan13(code)) throw new Error(`Не EAN-13: ${code}`);
  const digits = code.split("").map(Number);
  const parity = PARITY[digits[0]];
  const left = digits
    .slice(1, 7)
    .map((d, i) => (parity[i] === "L" ? L_CODES[d] : G_CODES[d]))
    .join("");
  const right = digits.slice(7).map((d) => R_CODES[d]).join("");
  return `101${left}01010${right}101`;
}

/** Ширины полос и пробелов подряд, начиная с полосы — формат `code128bModules`. */
export function bitsToModules(bits: string): number[] {
  const runs: number[] = [];
  let current = "";
  for (const bit of bits) {
    if (bit === current) runs[runs.length - 1] += 1;
    else {
      runs.push(1);
      current = bit;
    }
  }
  return runs;
}
