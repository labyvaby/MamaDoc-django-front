import { describe, it, expect } from "vitest";
import { scopeParams, ORG_WIDE } from "./scope";

describe("scopeParams helper", () => {
  it("serializes organizationId and branchId when present", () => {
    const params = scopeParams({ organizationId: 5, branchId: 12 });
    expect(params.get("organizationId")).toBe("5");
    expect(params.get("branchId")).toBe("12");
  });

  it("produces empty query string for ORG_WIDE intentional cross-branch scope", () => {
    const params = scopeParams(ORG_WIDE);
    expect(params.toString()).toBe("");
  });

  it("handles branchId only", () => {
    const params = scopeParams({ branchId: 7 });
    expect(params.get("organizationId")).toBeNull();
    expect(params.get("branchId")).toBe("7");
  });
});
