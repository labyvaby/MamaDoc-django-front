import { describe, expect, it } from "vitest";

import { isPermissionEditable, membershipGrants } from "./platformGrantedPermissions";

describe("isPermissionEditable", () => {
  it("shows module switching only to the platform superuser", () => {
    expect(isPermissionEditable("tenancy.catalog.connect", false)).toBe(false);
    expect(isPermissionEditable("tenancy.catalog.disconnect", false)).toBe(false);
    expect(isPermissionEditable("tenancy.catalog.connect", true)).toBe(true);
  });

  it("leaves every other right as it was", () => {
    expect(isPermissionEditable("tenancy.catalog.view", false)).toBe(true);
    expect(isPermissionEditable("patients.view", false)).toBe(true);
  });
});

describe("membershipGrants", () => {
  it("reads the right of this organization only, with no bypass for a role name", () => {
    const superadmin = { role: { code: "superadmin" }, permissions: ["tenancy.catalog.view"] };
    expect(membershipGrants(superadmin, "tenancy.catalog.connect")).toBe(false);
    expect(membershipGrants({ permissions: ["tenancy.catalog.connect"] }, "tenancy.catalog.connect")).toBe(true);
    expect(membershipGrants(null, "tenancy.catalog.connect")).toBe(false);
  });
});
