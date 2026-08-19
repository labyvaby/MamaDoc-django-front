import { describe, expect, it } from "vitest";

import { caretAfterDigits } from "./usePhoneLocalInput";
import { formatPhoneLocalDisplay } from "../utility/phone";

/**
 * Каретка считается по цифрам, а не по символам: в «702 122 762» между
 * группами стоят пробелы, и после перерисовки позиция должна попасть на ту же
 * цифру, что была слева от курсора до правки.
 */
describe("caretAfterDigits", () => {
  const formatted = formatPhoneLocalDisplay("+996", "702122762"); // «702 122 762»

  it("ставит курсор в начало, когда слева нет цифр", () => {
    expect(caretAfterDigits(formatted, 0)).toBe(0);
  });

  it("считает разделители пропущенными", () => {
    expect(formatted).toBe("702 122 762");
    expect(caretAfterDigits(formatted, 3)).toBe(3); // сразу после «702», до пробела
    expect(caretAfterDigits(formatted, 4)).toBe(5); // после первой цифры второй группы
    expect(caretAfterDigits(formatted, 6)).toBe(7);
  });

  it("не выходит за пределы строки", () => {
    expect(caretAfterDigits(formatted, 9)).toBe(formatted.length);
    expect(caretAfterDigits(formatted, 42)).toBe(formatted.length);
  });

  it("работает на десятизначном формате (+7)", () => {
    const ru = formatPhoneLocalDisplay("+7", "9161234567"); // «916 123 45 67»
    expect(ru).toBe("916 123 45 67");
    expect(caretAfterDigits(ru, 7)).toBe(9);
  });
});
