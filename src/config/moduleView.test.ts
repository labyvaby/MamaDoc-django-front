import { describe, it, expect } from "vitest";

import { superSeesAllPages, visibleModules } from "./moduleView";

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

describe("superSeesAllPages", () => {
  it("lets a superadmin see the menu pages regardless of modules", () => {
    expect(superSeesAllPages(true, false)).toBe(true);
  });

  it("drops that pass in the clinic view, so menu pages follow the clinic's modules", () => {
    // Иначе «СКУД», «Регистратура» и др. (обход «isSuper ||» в сайдбаре)
    // оставались в меню «как у клиники», хотя модуля у неё нет.
    expect(superSeesAllPages(true, true)).toBe(false);
  });

  it("never gives the pass to anyone else", () => {
    expect(superSeesAllPages(false, false)).toBe(false);
  });
});
