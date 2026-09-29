import { describe, expect, it } from "vitest";

import { fieldError, hasFieldErrors, sanitizeFieldInput } from "./formRules";

describe("sanitizeFieldInput", () => {
  it("не пропускает буквы в целое число (этаж)", () => {
    expect(sanitizeFieldInput("3а", { kind: "int" })).toBe("3");
    expect(sanitizeFieldInput("abc", { kind: "int" })).toBe("");
    expect(sanitizeFieldInput("1e5", { kind: "int" })).toBe("15");
  });

  it("минус в целом — только если разрешены отрицательные (цокольный этаж)", () => {
    expect(sanitizeFieldInput("-1", { kind: "int" })).toBe("1");
    expect(sanitizeFieldInput("-1", { kind: "int", min: -5 })).toBe("-1");
  });

  it("десятичное: запятая → точка, одна точка, не больше двух знаков", () => {
    expect(sanitizeFieldInput("12,5", { kind: "decimal" })).toBe("12.5");
    expect(sanitizeFieldInput("1.2.3", { kind: "decimal" })).toBe("1.23");
    expect(sanitizeFieldInput("2.756", { kind: "decimal" })).toBe("2.75");
    expect(sanitizeFieldInput("м2 30", { kind: "decimal" })).toBe("230");
  });

  it("телефон: цифры, плюс в начале и разделители", () => {
    expect(sanitizeFieldInput("+996 (700) 12-34-56abc", { kind: "phone" })).toBe("+996 (700) 12-34-56");
    expect(sanitizeFieldInput("99+6", { kind: "phone" })).toBe("996");
  });
});

describe("fieldError", () => {
  it("пустое необязательное — не ошибка, пустое обязательное — ошибка", () => {
    expect(fieldError("", { kind: "int" })).toBeNull();
    expect(fieldError("  ", { required: true })).toBe("Обязательное поле");
  });

  it("границы числа", () => {
    expect(fieldError("0", { kind: "int", min: 1 })).toBe("Не меньше 1");
    expect(fieldError("300", { kind: "int", max: 200 })).toBe("Не больше 200");
    expect(fieldError("5", { kind: "int", min: 1, max: 200 })).toBeNull();
    expect(fieldError("3.", { kind: "decimal" })).toBe("Введите число");
  });

  it("телефон и email", () => {
    expect(fieldError("+996 700", { kind: "phone" })).toBe("Телефон: от 9 до 15 цифр");
    expect(fieldError("+996 700 123 456", { kind: "phone" })).toBeNull();
    expect(fieldError("ivan@mail", { kind: "email" })).not.toBeNull();
    expect(fieldError("ivan@mail.kg", { kind: "email" })).toBeNull();
  });

  it("hasFieldErrors — хоть одна ошибка блокирует сохранение", () => {
    expect(hasFieldErrors([["2", { kind: "int" }], ["", { required: true }]])).toBe(true);
    expect(hasFieldErrors([["2", { kind: "int" }], ["x", { required: true }]])).toBe(false);
  });
});
