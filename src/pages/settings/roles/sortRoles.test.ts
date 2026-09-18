import { describe, expect, it } from "vitest";
import { sortRolesByMembers } from "./sortRoles";

const role = (id: number, name: string) => ({ id, name });

describe("sortRolesByMembers", () => {
  it("больше сотрудников — выше; при равенстве — по имени", () => {
    const counts = new Map([
      [1, 1],
      [2, 2],
      [3, 1],
    ]);
    const sorted = sortRolesByMembers(
      [role(1, "Уборщица"), role(2, "Регистратор"), role(3, "Администратор")],
      counts,
    );
    expect(sorted.map((r) => r.name)).toEqual(["Регистратор", "Администратор", "Уборщица"]);
  });

  it("роли без сотрудников уходят вниз, между собой — по имени", () => {
    const counts = new Map([[3, 1]]);
    const sorted = sortRolesByMembers(
      [role(1, "Test Admin Role"), role(2, "Knowledge Admin Role"), role(3, "Врач")],
      counts,
    );
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("без счётчиков (доступы не загрузились) — просто по имени", () => {
    const sorted = sortRolesByMembers([role(1, "Врач"), role(2, "Администратор")], null);
    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it("не мутирует входной массив", () => {
    const input = [role(1, "Б"), role(2, "А")];
    sortRolesByMembers(input, null);
    expect(input.map((r) => r.id)).toEqual([1, 2]);
  });
});
