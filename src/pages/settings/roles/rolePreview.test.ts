import { describe, expect, it } from "vitest";

import { PREVIEW_SECTIONS, previewSectionsFor } from "./rolePreview";

const keysFor = (codes: string[]) => previewSectionsFor(codes).map((s) => s.key);

describe("previewSectionsFor", () => {
  it("без прав не открывает ни одного раздела", () => {
    expect(keysFor([])).toEqual([]);
  });

  it("открывает раздел по его праву", () => {
    expect(keysFor(["patients.view"])).toContain("patients");
    expect(keysFor(["finance.view"])).toContain("cashbox");
  });

  it("любого из перечисленных прав достаточно", () => {
    // payroll: ["payroll.view", "payroll.view_own"]
    expect(keysFor(["payroll.view"])).toContain("payroll");
    expect(keysFor(["payroll.view_own"])).toContain("payroll");
  });

  it("не открывает раздел по чужому праву", () => {
    expect(keysFor(["patients.view"])).not.toContain("cashbox");
  });

  it("«Настройки» открывает любая вкладка настроек", () => {
    expect(keysFor(["organization.view"])).toContain("settings");
    expect(keysFor(["rbac.roles.view"])).toContain("settings");
  });

  it("сохраняет порядок сайдбара независимо от порядка прав", () => {
    const order = PREVIEW_SECTIONS.map((s) => s.key);
    const got = keysFor(["finance.view", "patients.view", "appointments.registry.view"]);
    expect(got).toEqual(got.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it("каждый раздел витрины требует хотя бы одно право", () => {
    for (const section of PREVIEW_SECTIONS) {
      expect(section.permissions.length).toBeGreaterThan(0);
    }
  });
});
