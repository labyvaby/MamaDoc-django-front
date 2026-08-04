import { describe, expect, it } from "vitest";
import { capitalizeFullName } from "./name";

describe("capitalizeFullName", () => {
  it("делает каждое слово с заглавной буквы", () => {
    expect(capitalizeFullName("иванов иван иванович")).toBe("Иванов Иван Иванович");
  });

  it("чинит ввод с Caps Lock", () => {
    expect(capitalizeFullName("ИВАНОВ ИВАН")).toBe("Иванов Иван");
  });

  it("схлопывает лишние пробелы и обрезает края", () => {
    expect(capitalizeFullName("  иванов   иван  ")).toBe("Иванов Иван");
  });

  it("капитализирует обе части фамилии через дефис", () => {
    expect(capitalizeFullName("петрова-водкина анна")).toBe("Петрова-Водкина Анна");
    expect(capitalizeFullName("ПЕТРОВА-ВОДКИНА АННА")).toBe("Петрова-Водкина Анна");
  });

  it("оставляет строчными кыргызские частицы отчества", () => {
    expect(capitalizeFullName("айбек уулу нурсултан")).toBe("Айбек уулу Нурсултан");
    expect(capitalizeFullName("АЙГУЛЬ КЫЗЫ АСЕЛЬ")).toBe("Айгуль кызы Асель");
  });

  it("не считает частицей первое слово", () => {
    expect(capitalizeFullName("уулу нурсултан")).toBe("Уулу Нурсултан");
  });

  it("не ломает осознанный внутренний регистр", () => {
    expect(capitalizeFullName("МакДональд Джон")).toBe("МакДональд Джон");
  });

  it("работает с латиницей", () => {
    expect(capitalizeFullName("john smith")).toBe("John Smith");
  });

  it("возвращает пустую строку для пустого ввода", () => {
    expect(capitalizeFullName("   ")).toBe("");
    expect(capitalizeFullName("")).toBe("");
  });
});
