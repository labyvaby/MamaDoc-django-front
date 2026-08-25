import { describe, expect, it } from "vitest";

import { validatePrepaymentAmount } from "./employeeValidation";

/**
 * Бэк отвечает 400 на «предоплата включена, суммы нет» — форма обязана
 * поймать это раньше, иначе врач сохраняется с суммой 0 («оплатите 0 сом»).
 */
describe("validatePrepaymentAmount", () => {
  it("не требует сумму, когда предоплата выключена", () => {
    expect(validatePrepaymentAmount(false, "")).toBe("");
    expect(validatePrepaymentAmount(false, "0")).toBe("");
  });

  it("требует сумму при включённой предоплате", () => {
    expect(validatePrepaymentAmount(true, "")).toBeTruthy();
    expect(validatePrepaymentAmount(true, "   ")).toBeTruthy();
  });

  it("отвергает ноль и отрицательную сумму", () => {
    expect(validatePrepaymentAmount(true, "0")).toBeTruthy();
    expect(validatePrepaymentAmount(true, "-100")).toBeTruthy();
  });

  it("принимает целое и дробное, в том числе через запятую", () => {
    expect(validatePrepaymentAmount(true, "500")).toBe("");
    expect(validatePrepaymentAmount(true, "500.50")).toBe("");
    expect(validatePrepaymentAmount(true, "500,50")).toBe("");
  });

  it("отвергает нечисловой ввод", () => {
    expect(validatePrepaymentAmount(true, "пятьсот")).toBeTruthy();
  });
});
