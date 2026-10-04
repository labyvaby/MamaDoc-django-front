import { describe, expect, it } from "vitest";
import { bonusBranchId, salaryReportBranchId } from "./branchScope";

describe("salaryReportBranchId", () => {
  it("организация с одним филиалом — отчёт по всей организации", () => {
    expect(salaryReportBranchId(5, { activeBranchCount: 1 })).toBeUndefined();
  });
  it("несколько филиалов — срез по активному филиалу", () => {
    expect(salaryReportBranchId(5, { activeBranchCount: 3 })).toBe(5);
    expect(salaryReportBranchId(null, { activeBranchCount: 3 })).toBeUndefined();
  });
  it("старый бэкенд без activeBranchCount — как раньше", () => {
    expect(salaryReportBranchId(5, {})).toBe(5);
  });
});

describe("bonusBranchId", () => {
  it("в организации с одним филиалом премия всё равно в активном филиале", () => {
    expect(bonusBranchId(5)).toBe(5);
  });
  it("нет активного филиала — undefined", () => {
    expect(bonusBranchId(null)).toBeUndefined();
    expect(bonusBranchId(undefined)).toBeUndefined();
  });
});
