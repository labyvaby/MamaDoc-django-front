import { describe, expect, it } from "vitest";

import {
  findLabSettingsProblem,
  labConfigToForm,
  labFormToInput,
  type LabSettingsForm,
} from "./labSettingsForm";
import type { LabConfig } from "../../api/lab";

const eveningDefaults = {
  eveningEnabled: false, eveningLisRegistryId: "", eveningLisUsername: "",
  eveningLisPassword: "", eveningHasPassword: false, eveningSavedUsername: "", clearEveningCredentials: false,
};
const eveningInput = { eveningEnabled: false, eveningLisRegistryId: null, eveningLisUsername: "", eveningLisPassword: "", clearEveningCredentials: false };

const config: LabConfig = {
  configured: true,
  lisOrganizationId: 2497,
  lisDoctorId: 123,
  chargeInstruments: true,
  lisUsername: "avicenna",
  hasPassword: true,
  sync: { state: "idle", startedAt: null, finishedAt: null, error: "" },
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

const shiftsForm = (): LabSettingsForm => labConfigToForm({
  ...config,
  branches: [{ branchId: 1, branchName: "Центр", lisRegistryId: 11, lisLaboratoryId: 7,
    lisUsername: "day", hasPassword: true, eveningEnabled: true, eveningLisRegistryId: 22,
    eveningLisUsername: "night", eveningHasPassword: true }],
});

describe("две смены", () => {
  it("пустые поля паролей сохраняют обе учётные записи", () => {
    const next = shiftsForm();
    expect(findLabSettingsProblem(next)).toBeNull();
    expect(next.branches[0].eveningLisPassword).toBe("");
    expect(labFormToInput(next).branches[0]).toMatchObject({
      eveningEnabled: true, eveningLisRegistryId: 22, eveningLisUsername: "night", eveningLisPassword: "",
    });
  });

  it("смена вечернего логина требует нового пароля", () => {
    const next = shiftsForm();
    next.branches[0].eveningLisUsername = "another";
    expect(findLabSettingsProblem(next)).toContain("пароль вечерней смены");
    next.branches[0].eveningLisPassword = "replacement";
    expect(findLabSettingsProblem(next)).toBeNull();
    expect(labFormToInput(next).branches[0].lisPassword).toBe("");
  });

  it("общая учётка не заменяет дневную при двух сменах", () => {
    const next = shiftsForm();
    next.branches[0].clearCredentials = true;
    expect(findLabSettingsProblem(next)).toContain("каждой смены");
  });

  it("вечерний регистратор обязателен и должен быть целым", () => {
    const next = shiftsForm();
    for (const value of ["", "0", "22.5", "-1", "9007199254740993"]) {
      next.branches[0].eveningLisRegistryId = value;
      expect(findLabSettingsProblem(next)).toContain("ID вечернего регистратора");
    }
  });

  it("отключение сохраняет вечерние доступы, удаление задаётся явно", () => {
    const next = shiftsForm();
    next.branches[0].eveningEnabled = false;
    expect(findLabSettingsProblem(next)).toBeNull();
    expect(labFormToInput(next).branches[0]).toMatchObject({ eveningEnabled: false, eveningLisUsername: "night", clearEveningCredentials: false });
    Object.assign(next.branches[0], { eveningLisUsername: "", eveningHasPassword: false, clearEveningCredentials: true });
    expect(findLabSettingsProblem(next)).toBeNull();
    expect(labFormToInput(next).branches[0].clearEveningCredentials).toBe(true);
  });
});

describe("labConfigToForm", () => {
  it("числа становятся строками, пустая точка — пустыми полями", () => {
    expect(labConfigToForm(config)).toEqual({
      lisOrganizationId: "2497",
      lisDoctorId: "123",
      chargeInstruments: true,
      lisUsername: "avicenna",
      lisPassword: "",
      hasPassword: true,
      branches: [
        { branchId: 1, branchName: "Центр", lisRegistryId: "259269", lisLaboratoryId: "950463", lisUsername: "", lisPassword: "", hasPassword: false, savedUsername: "", clearCredentials: false, ...eveningDefaults },
        { branchId: 2, branchName: "Филиал", lisRegistryId: "", lisLaboratoryId: "", lisUsername: "", lisPassword: "", hasPassword: false, savedUsername: "", clearCredentials: false, ...eveningDefaults },
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

describe("учётная запись ЛИС", () => {
  it("без логина не сохраняем — его выдаёт лаборатория", () => {
    expect(findLabSettingsProblem(form({ lisUsername: "  " }))).toContain("логин");
  });

  it("первое подключение требует пароль", () => {
    expect(
      findLabSettingsProblem(form({ hasPassword: false, lisPassword: "" })),
    ).toContain("пароль");
  });

  it("сохранённый пароль не заставляет вводить его заново", () => {
    expect(findLabSettingsProblem(form({ hasPassword: true, lisPassword: "" }))).toBeNull();
  });
});

describe("labFormToInput", () => {
  it("пустая точка уезжает как null — бэкенд отвяжет филиал", () => {
    expect(labFormToInput(form())).toEqual({
      lisOrganizationId: 2497,
      lisDoctorId: 123,
      chargeInstruments: true,
      lisUsername: "avicenna",
      lisPassword: "",
      branches: [
        { branchId: 1, lisRegistryId: 259269, lisLaboratoryId: 950463, lisUsername: "", lisPassword: "", clearCredentials: false, ...eveningInput },
        { branchId: 2, lisRegistryId: null, lisLaboratoryId: null, lisUsername: "", lisPassword: "", clearCredentials: false, ...eveningInput },
      ],
    });
  });
});

describe("доступы филиалов", () => {
  const ownAccount = (): LabSettingsForm => {
    const next = form({ lisUsername: "", lisPassword: "", hasPassword: false });
    next.branches[0] = {
      ...next.branches[0], lisUsername: "branch", lisPassword: "secret",
    };
    return next;
  };

  it("общий логин не нужен, если у подключённых филиалов свои доступы", () => {
    expect(findLabSettingsProblem(ownAccount())).toBeNull();
  });

  it("сохранённый пароль филиала не возвращается в форму", () => {
    const next = labConfigToForm({ ...config, branches: [{ ...config.branches[0], lisUsername: "branch", hasPassword: true }] });
    expect(next.branches[0]).toMatchObject({ lisUsername: "branch", hasPassword: true, lisPassword: "", savedUsername: "branch" });
  });

  it("новой учётной записи филиала нужен пароль", () => {
    const next = ownAccount();
    next.branches[0].lisPassword = "";
    expect(findLabSettingsProblem(next)).toContain("Центр: укажите пароль");
  });

  it("смена логина требует пароль заново", () => {
    const next = ownAccount();
    next.branches[0] = { ...next.branches[0], hasPassword: true, savedUsername: "old", lisPassword: "" };
    expect(findLabSettingsProblem(next)).toContain("пароль");
    next.branches[0].savedUsername = "branch";
    expect(findLabSettingsProblem(next)).toBeNull();
  });

  it("подключённый филиал без доступов не получает учётку соседнего", () => {
    const next = ownAccount();
    next.branches[1] = { ...next.branches[1], lisRegistryId: "12", lisLaboratoryId: "14" };
    expect(findLabSettingsProblem(next)).toContain("Филиал: укажите логин и пароль");
  });

  it("отдельные доступы передаются внутри своего филиала", () => {
    const next = ownAccount();
    expect(labFormToInput(next).branches[0]).toMatchObject({ branchId: 1, lisUsername: "branch", lisPassword: "secret", clearCredentials: false });
    next.branches[0] = { ...next.branches[0], lisUsername: "", lisPassword: "", clearCredentials: true };
    expect(labFormToInput(next).branches[0].clearCredentials).toBe(true);
  });
});
