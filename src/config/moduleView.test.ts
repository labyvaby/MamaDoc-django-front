import { describe, it, expect } from "vitest";

import { visibleModules } from "./moduleView";

const all = ["appointments", "cleaning", "pos", "rbac"];
const clinic = ["appointments", "rbac"];

describe("visibleModules", () => {
  it("gives the platform admin every module by default", () => {
    expect(
      visibleModules({ isPlatformAdmin: true, viewAsOrganization: false, enabledModules: all, organizationModules: clinic }),
    ).toBe(all);
  });

  it("shows the platform admin the clinic's modules in the clinic view", () => {
    expect(
      visibleModules({ isPlatformAdmin: true, viewAsOrganization: true, enabledModules: all, organizationModules: clinic }),
    ).toBe(clinic);
  });

  it("keeps every module when the backend sent no clinic list", () => {
    expect(
      visibleModules({ isPlatformAdmin: true, viewAsOrganization: true, enabledModules: all, organizationModules: null }),
    ).toBe(all);
  });

  it("never narrows a clinic employee's modules", () => {
    expect(
      visibleModules({ isPlatformAdmin: false, viewAsOrganization: true, enabledModules: clinic, organizationModules: [] }),
    ).toBe(clinic);
  });
});
