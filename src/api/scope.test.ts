import { describe, it, expect } from "vitest";
import { scopeParams, orgWide } from "./scope";

describe("scopeParams helper", () => {
  it("serializes organizationId and branchId when present", () => {
    const params = scopeParams({ organizationId: 5, branchId: 12 });
    expect(params.get("organizationId")).toBe("5");
    expect(params.get("branchId")).toBe("12");
  });

  it("handles branchId only", () => {
    const params = scopeParams({ branchId: 7 });
    expect(params.get("organizationId")).toBeNull();
    expect(params.get("branchId")).toBe("7");
  });
});

describe("orgWide helper", () => {
  it("keeps the organization but drops the branch", () => {
    const params = scopeParams(orgWide(5));
    expect(params.get("organizationId")).toBe("5");
    expect(params.get("branchId")).toBeNull();
  });

  it("produces an empty query when the org is inferred from the session", () => {
    // useActiveScope отдаёт undefined, когда у пользователя одна организация:
    // бэк выводит её из сессии, лишний параметр не нужен.
    expect(scopeParams(orgWide(undefined)).toString()).toBe("");
  });
});
