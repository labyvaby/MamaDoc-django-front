import { describe, expect, it } from "vitest";

import { isSingleBranchOrg } from "./organization";

describe("isSingleBranchOrg", () => {
  it("один филиал у организации — true", () => {
    expect(isSingleBranchOrg({ activeBranchCount: 1 })).toBe(true);
  });
  it("два филиала, ноль или поле не пришло — false", () => {
    expect(isSingleBranchOrg({ activeBranchCount: 2 })).toBe(false);
    expect(isSingleBranchOrg({ activeBranchCount: 0 })).toBe(false);
    expect(isSingleBranchOrg({})).toBe(false);
    expect(isSingleBranchOrg(null)).toBe(false);
  });
});
