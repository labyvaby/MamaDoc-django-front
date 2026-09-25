import { describe, it, expect } from "vitest";

import { keepsClinicView, moduleField, superSeesAllPages, visibleModules } from "./moduleView";

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

describe("moduleField", () => {
  it("sends the field while its module is on", () => {
    expect(moduleField(true, false)).toBe(false);
    expect(moduleField(true, true)).toBe(true);
  });

  it("leaves the field out while its module is off, so the stored value survives", () => {
    // Иначе форма товара при выключенных «Прививках» слала isVaccine=false,
    // и бэк снимал отметку вакцины у сохранённого товара.
    expect(moduleField(false, false)).toBeUndefined();
    expect(JSON.stringify({ isVaccine: moduleField(false, false) })).toBe("{}");
  });
});

describe("superSeesAllPages", () => {
  it("lets a superadmin see the menu pages regardless of modules", () => {
    expect(superSeesAllPages(true, true, false)).toBe(true);
  });

  it("drops that pass in the clinic view, so menu pages follow the clinic's modules", () => {
    // Иначе «СКУД», «Регистратура» и др. (обход «isSuper ||» в сайдбаре)
    // оставались в меню «как у клиники», хотя модуля у неё нет.
    expect(superSeesAllPages(true, true, true)).toBe(false);
  });

  it("keeps the pass of a clinic's own superadmin role even if the flag is stale", () => {
    // Флаг режима мог остаться от прежнего пользователя вкладки — роль
    // «superadmin» клиники режимом не пользуется и терять обход не должна.
    expect(superSeesAllPages(true, false, true)).toBe(true);
  });

  it("never gives the pass to anyone else", () => {
    expect(superSeesAllPages(false, false, false)).toBe(false);
  });
});

describe("keepsClinicView", () => {
  const me = (id: number, isSuperuser: boolean) => ({ user: { id, isSuperuser } });

  it("keeps the mode for the same platform admin on a refresh or an organization switch", () => {
    expect(keepsClinicView(true, "1", me(1, true))).toBe(true);
  });

  it("drops the mode when another user signed in in this tab's session", () => {
    expect(keepsClinicView(true, "1", me(2, true))).toBe(false);
  });

  it("drops the mode for a user who is not a platform admin", () => {
    expect(keepsClinicView(true, "1", me(1, false))).toBe(false);
  });

  it("never turns the mode on by itself", () => {
    expect(keepsClinicView(false, "1", me(1, true))).toBe(false);
  });
});
