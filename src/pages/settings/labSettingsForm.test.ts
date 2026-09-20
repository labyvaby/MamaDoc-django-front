import { describe, expect, it } from "vitest";

import {
  findLabSettingsProblem,
  labConfigToForm,
  labFormToInput,
  type LabSettingsForm,
} from "./labSettingsForm";
import type { LabConfig } from "../../api/lab";

const config: LabConfig = {
  configured: true,
  lisOrganizationId: 2497,
  lisDoctorId: 123,
  chargeInstruments: true,
  branches: [
    { branchId: 1, branchName: "Центр", lisRegistryId: 259269, lisLaboratoryId: 950463 },
    { branchId: 2, branchName: "Филиал", lisRegistryId: null, lisLaboratoryId: null },
  ],
  mirror: { tests: 0, doctors: 0, clientTypes: 0, instruments: 0, preparations: 0, lastSyncedAt: null },
};

const form = (over: Partial<LabSettingsForm> = {}): LabSettingsForm => ({
  ...labConfigToForm(config),
  ...over,
});

describe("labConfigToForm", () => {
  it("числа становятся строками, пустая точка — пустыми полями", () => {
    expect(labConfigToForm(config)).toEqual({
      lisOrganizationId: "2497",
      lisDoctorId: "123",
      chargeInstruments: true,
      branches: [
        { branchId: 1, branchName: "Центр", lisRegistryId: "259269", lisLaboratoryId: "950463" },
        { branchId: 2, branchName: "Филиал", lisRegistryId: "", lisLaboratoryId: "" },
      ],
    });
  });

  it("ненастроенная организация — пустые коды", () => {
    const blank = labConfigToForm({ ...config, configured: false, lisOrganizationId: null, lisDoctorId: null });
    expect(blank.lisOrganizationId).toBe("");
    expect(blank.lisDoctorId).toBe("");
  });
});

describe("findLabSettingsProblem", () => {
  it("корректная форма проходит", () => {
    expect(findLabSettingsProblem(form())).toBeNull();
  });

  it.each(["", "0", "abc", "-5", "12.5"])("код организации «%s» отклоняется", (value) => {
    expect(findLabSettingsProblem(form({ lisOrganizationId: value }))).toContain("организации");
  });

  it("половина пары точки регистрации — отказ с названием филиала", () => {
    const rows = form().branches;
    rows[1] = { ...rows[1], lisRegistryId: "5" };
    expect(findLabSettingsProblem(form({ branches: rows }))).toContain("Филиал:");
  });

  it("нулевая точка — отказ", () => {
    const rows = form().branches;
    rows[0] = { ...rows[0], lisRegistryId: "0", lisLaboratoryId: "0" };
    expect(findLabSettingsProblem(form({ branches: rows }))).toContain("Центр:");
  });
});

describe("labFormToInput", () => {
  it("пустая точка уезжает как null — бэкенд отвяжет филиал", () => {
    expect(labFormToInput(form())).toEqual({
      lisOrganizationId: 2497,
      lisDoctorId: 123,
      chargeInstruments: true,
      branches: [
        { branchId: 1, lisRegistryId: 259269, lisLaboratoryId: 950463 },
        { branchId: 2, lisRegistryId: null, lisLaboratoryId: null },
      ],
    });
  });
});
