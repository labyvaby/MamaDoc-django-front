import { describe, expect, it } from "vitest";
import type { RbacMembership } from "../../api/auth";
import { activeBranchesOf, isSwitcherInteractive, showsOrgWideItem } from "./contextMenuModel";

const m = (id: number, branches: Array<{ id: number; isActive: boolean }>) =>
  ({ id, organization: { id, name: `org${id}`, slug: `o${id}`, status: "active" }, branches }) as unknown as RbacMembership;

describe("меню организаций и филиалов", () => {
  it("«Все филиалы» есть только при двух и более филиалах, «Без филиала» — при нуле", () => {
    expect(showsOrgWideItem(0)).toBe(true);
    expect(showsOrgWideItem(1)).toBe(false);
    expect(showsOrgWideItem(2)).toBe(true);
  });
  it("неактивные филиалы не считаются", () => {
    expect(activeBranchesOf(m(1, [{ id: 1, isActive: true }, { id: 2, isActive: false }]))).toHaveLength(1);
  });
  it("одно членство с одним филиалом, сессия уже в нём — выбирать нечего", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }])], 1)).toBe(false);
    expect(isSwitcherInteractive([m(1, [])], null)).toBe(false);
  });
  it("два членства или два филиала — меню нужно", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }]), m(2, [])], null)).toBe(true);
    expect(
      isSwitcherInteractive([m(1, [{ id: 1, isActive: true }, { id: 2, isActive: true }])], 1),
    ).toBe(true);
  });
  it("старый бэкенд или не обновившаяся сессия: activeBranchId ещё пуст — меню нужно, чтобы войти в единственный филиал", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }])], null)).toBe(true);
  });
  it("активный филиал уже проставлен — меню не нужно (тот же случай, что и выше)", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }])], 1)).toBe(false);
  });
});
