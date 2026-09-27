import { describe, expect, it } from "vitest";
import { salaryReportBranchId } from "./branchScope";

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
