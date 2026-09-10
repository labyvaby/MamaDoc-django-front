import { describe, expect, it } from "vitest";

import { filterEmployeesByQuery, matchesEmployeeQuery } from "./employeeSearch";

describe("matchesEmployeeQuery", () => {
  it("ищет по подстроке без учёта регистра", () => {
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "петр")).toBe(true);
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "ИВАН")).toBe(true);
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "сидор")).toBe(false);
  });

  it("не различает «е» и «ё»", () => {
    expect(matchesEmployeeQuery("Королёва Анна", "королева")).toBe(true);
    expect(matchesEmployeeQuery("Королева Анна", "королёва")).toBe(true);
  });

  it("не зависит от порядка слов", () => {
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "иван петров")).toBe(true);
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "петров иван")).toBe(true);
  });

  it("требует, чтобы нашлись все слова запроса", () => {
    expect(matchesEmployeeQuery("Петров Иван Сергеевич", "петров сидоров")).toBe(false);
  });

  it("пустой запрос подходит всем", () => {
    expect(matchesEmployeeQuery("Петров Иван", "")).toBe(true);
    expect(matchesEmployeeQuery("Петров Иван", "   ")).toBe(true);
  });
});

describe("filterEmployeesByQuery", () => {
  const employees = [
    { id: 1, fullName: "Петров Иван Сергеевич" },
    { id: 2, fullName: "Королёва Анна Петровна" },
    { id: 3, fullName: "Сидоров Пётр" },
  ];

  it("оставляет только подходящих", () => {
    expect(filterEmployeesByQuery(employees, { inputValue: "петр" }).map((e) => e.id)).toEqual([
      1, 2, 3,
    ]);
    expect(filterEmployeesByQuery(employees, { inputValue: "анна" }).map((e) => e.id)).toEqual([2]);
  });

  it("без запроса отдаёт весь список", () => {
    expect(filterEmployeesByQuery(employees, { inputValue: "" })).toHaveLength(3);
  });
});
