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
  it("одно членство с одним филиалом — выбирать нечего", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }])])).toBe(false);
    expect(isSwitcherInteractive([m(1, [])])).toBe(false);
  });
  it("два членства или два филиала — меню нужно", () => {
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }]), m(2, [])])).toBe(true);
    expect(isSwitcherInteractive([m(1, [{ id: 1, isActive: true }, { id: 2, isActive: true }])])).toBe(true);
  });
});
