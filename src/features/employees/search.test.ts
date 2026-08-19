import { describe, it, expect } from "vitest";
import { matchesEmployeeQuery, filterEmployeesByQuery } from "./search";
import type { EmployesRow } from "./types";

function emp(over: Partial<EmployesRow>): EmployesRow {
  return { id: "1", full_name: "Иванов Иван", ...over } as EmployesRow;
}

const pediatr = emp({
  id: "1",
  full_name: "Иванов Иван",
  phone: "+996 555 123 456",
  _djangoSpecializations: [{ id: 2, name: "Педиатр" }],
});
const nevrolog = emp({
  id: "2",
  full_name: "Петрова Ёлкина Анна",
  phone: "+996700998877",
  _djangoSpecializations: [
    { id: 5, name: "Невролог" },
    { id: 4, name: "Дерматолог" },
  ],
});
const noSpec = emp({ id: "3", full_name: "Сидоров Пётр", phone: null, _djangoSpecializations: [] });

describe("matchesEmployeeQuery", () => {
  it("находит по названию специализации", () => {
    expect(matchesEmployeeQuery(pediatr, "педиатр")).toBe(true);
    expect(matchesEmployeeQuery(nevrolog, "педиатр")).toBe(false);
  });

  it("находит по любой из нескольких специализаций", () => {
    expect(matchesEmployeeQuery(nevrolog, "дерматолог")).toBe(true);
  });

  it("ищет по части слова и без учёта регистра", () => {
    expect(matchesEmployeeQuery(pediatr, "ПЕДИ")).toBe(true);
  });

  it("не различает ё и е", () => {
    expect(matchesEmployeeQuery(nevrolog, "елкина")).toBe(true);
    expect(matchesEmployeeQuery(noSpec, "петр")).toBe(true);
  });

  it("ищет по телефону независимо от форматирования", () => {
    expect(matchesEmployeeQuery(pediatr, "555123")).toBe(true);
    expect(matchesEmployeeQuery(pediatr, "+996 555")).toBe(true);
    expect(matchesEmployeeQuery(nevrolog, "555123")).toBe(false);
  });

  it("игнорирует слишком короткие числовые токены как номер", () => {
    // «55» совпало бы почти с любым номером — шум, а не результат
    expect(matchesEmployeeQuery(pediatr, "55")).toBe(false);
  });

  it("требует совпадения всех токенов: ФИО + специальность", () => {
    expect(matchesEmployeeQuery(pediatr, "иванов педиатр")).toBe(true);
    expect(matchesEmployeeQuery(pediatr, "петрова педиатр")).toBe(false);
  });

  it("пустой запрос пропускает всех", () => {
    expect(matchesEmployeeQuery(noSpec, "   ")).toBe(true);
  });

  it("не падает на сотруднике без специализаций и телефона", () => {
    expect(matchesEmployeeQuery(noSpec, "педиатр")).toBe(false);
  });
});

describe("filterEmployeesByQuery", () => {
  it("оставляет только совпавших", () => {
    const rows = [pediatr, nevrolog, noSpec];
    expect(filterEmployeesByQuery(rows, "невролог").map((r) => r.id)).toEqual(["2"]);
    expect(filterEmployeesByQuery(rows, "").length).toBe(3);
  });
});
