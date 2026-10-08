/**
 * Чистая логика страницы настройки ЛИС: форма ↔ контракт, проверка перед
 * отправкой. Вынесено из компонента по правилу проекта — рендер-тестов нет,
 * логика тестируется отдельно.
 */

import type { LabAccountConfigInput, LabConfig, LabConfigInput } from "../../api/lab";

export interface LabBranchRow {
  branchId: number;
  branchName: string;
  /** Строки полей: пустая — точка не задана. */
  lisRegistryId: string;
  lisLaboratoryId: string;
  lisUsername: string;
  lisPassword: string;
  hasPassword: boolean;
  savedUsername: string;
  clearCredentials: boolean;
  eveningEnabled: boolean;
  eveningLisRegistryId: string;
  eveningLisUsername: string;
  eveningLisPassword: string;
  eveningHasPassword: boolean;
  eveningSavedUsername: string;
  clearEveningCredentials: boolean;
}

export interface LabSettingsForm {
  lisOrganizationId: string;
  lisDoctorId: string;
  chargeInstruments: boolean;
  branches: LabBranchRow[];
  /** Учётная запись, выданная лабораторией этой клинике. */
  lisUsername: string;
  /** Пустое поле — пароль не меняем; `hasPassword` говорит, задан ли он. */
  lisPassword: string;
  hasPassword: boolean;
}

const numberOrEmpty = (value: number | null): string => (value == null ? "" : String(value));

export function labConfigToForm(config: LabConfig): LabSettingsForm {
  return {
    lisOrganizationId: numberOrEmpty(config.lisOrganizationId),
    lisDoctorId: numberOrEmpty(config.lisDoctorId),
    chargeInstruments: config.chargeInstruments,
    lisUsername: config.lisUsername,
    lisPassword: "",
    hasPassword: config.hasPassword,
    branches: config.branches.map((row) => ({
      branchId: row.branchId,
      branchName: row.branchName,
      lisRegistryId: numberOrEmpty(row.lisRegistryId),
      lisLaboratoryId: numberOrEmpty(row.lisLaboratoryId),
      lisUsername: row.lisUsername ?? "",
      lisPassword: "",
      hasPassword: row.hasPassword ?? false,
      savedUsername: row.lisUsername ?? "",
      clearCredentials: false,
      eveningEnabled: row.eveningEnabled ?? false,
      eveningLisRegistryId: numberOrEmpty(row.eveningLisRegistryId ?? null),
      eveningLisUsername: row.eveningLisUsername ?? "",
      eveningLisPassword: "",
      eveningHasPassword: row.eveningHasPassword ?? false,
      eveningSavedUsername: row.eveningLisUsername ?? "",
      clearEveningCredentials: false,
    })),
  };
}

/** Положительное целое из поля или `null` для пустого/мусора. */
function positiveInt(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function eveningProblem(row: LabBranchRow, hasOwnAccount: boolean): string | null {
  const hasEvening = !row.clearEveningCredentials && (row.eveningLisUsername.trim() !== "" || row.eveningHasPassword || row.eveningLisPassword !== "");
  if (row.eveningEnabled && (!hasOwnAccount || !hasEvening)) {
    return `${row.branchName}: для двух смен нужны отдельные логин и пароль каждой смены.`;
  }
  if (hasEvening) {
    if (!row.eveningLisUsername.trim()) return `${row.branchName}: укажите логин вечерней смены.`;
    if ((!row.eveningHasPassword || row.eveningLisUsername.trim() !== row.eveningSavedUsername) && !row.eveningLisPassword.trim()) {
      return `${row.branchName}: укажите пароль вечерней смены.`;
    }
    if (row.lisRegistryId.trim() === "" || row.lisLaboratoryId.trim() === "") {
      return `${row.branchName}: укажите регистратора и лабораторию для учётной записи смены.`;
    }
  }
  if ((row.eveningEnabled || row.eveningLisRegistryId.trim() !== "") && positiveInt(row.eveningLisRegistryId) == null) {
    return `${row.branchName}: ID вечернего регистратора — положительное целое число.`;
  }
  return null;
}

/**
 * Причина, по которой бэк откажет, — до отправки и словами. Правила те
 * же, что в `services.save_lab_config`: код организации и врача —
 * положительные числа; у филиала либо оба id точки, либо ни одного.
 */
export function findLabSettingsProblem(form: LabSettingsForm): string | null {
  if (positiveInt(form.lisOrganizationId) == null) {
    return "Код организации в ЛИС — положительное число.";
  }
  const sharedUsername = form.lisUsername.trim();
  const sharedPassword = form.hasPassword || form.lisPassword.trim() !== "";
  if (!sharedUsername && sharedPassword) {
    return "Укажите логин общей учётной записи ЛИС.";
  }
  if (sharedUsername && !sharedPassword) {
    return "Укажите пароль от учётной записи ЛИС.";
  }
  if (positiveInt(form.lisDoctorId) == null) {
    return "Код врача по умолчанию в ЛИС — положительное число.";
  }
  for (const row of form.branches) {
    const registryEmpty = row.lisRegistryId.trim() === "";
    const laboratoryEmpty = row.lisLaboratoryId.trim() === "";
    const hasOwnAccount = !row.clearCredentials && (row.lisUsername.trim() !== "" || row.hasPassword || row.lisPassword !== "");
    const shiftProblem = eveningProblem(row, hasOwnAccount);
    if (shiftProblem) return shiftProblem;
    if (hasOwnAccount) {
      if (!row.lisUsername.trim()) return `${row.branchName}: укажите логин филиала в ЛИС.`;
      if ((!row.hasPassword || row.lisUsername.trim() !== row.savedUsername) && !row.lisPassword.trim()) {
        return `${row.branchName}: укажите пароль филиала в ЛИС.`;
      }
      if (registryEmpty && laboratoryEmpty) {
        return `${row.branchName}: укажите точку регистрации и лабораторию для учётной записи филиала.`;
      }
    }
    if (registryEmpty && laboratoryEmpty) continue;
    if (registryEmpty !== laboratoryEmpty) {
      return `${row.branchName}: укажите и точку регистрации, и лабораторию — либо оставьте оба поля пустыми.`;
    }
    if (positiveInt(row.lisRegistryId) == null || positiveInt(row.lisLaboratoryId) == null) {
      return `${row.branchName}: идентификаторы точки и лаборатории — положительные числа.`;
    }
    if (!hasOwnAccount && !sharedUsername) {
      return `${row.branchName}: укажите логин и пароль филиала или общую учётную запись ЛИС.`;
    }
  }
  return null;
}

/** Тело PUT из проверенной формы (см. `findLabSettingsProblem`). */
export function labFormToInput(form: LabSettingsForm): LabConfigInput {
  return {
    lisOrganizationId: positiveInt(form.lisOrganizationId) ?? 0,
    lisDoctorId: positiveInt(form.lisDoctorId) ?? 0,
    chargeInstruments: form.chargeInstruments,
    lisUsername: form.lisUsername.trim(),
    lisPassword: form.lisPassword,
    branches: form.branches.map((row) => ({
      branchId: row.branchId,
      lisRegistryId: positiveInt(row.lisRegistryId),
      lisLaboratoryId: positiveInt(row.lisLaboratoryId),
      lisUsername: row.lisUsername.trim(),
      lisPassword: row.lisPassword,
      clearCredentials: row.clearCredentials,
      eveningEnabled: row.eveningEnabled,
      eveningLisRegistryId: positiveInt(row.eveningLisRegistryId),
      eveningLisUsername: row.eveningLisUsername.trim(),
      eveningLisPassword: row.eveningLisPassword,
      clearEveningCredentials: row.clearEveningCredentials,
    })),
  };
}

/** Automatic setup needs only credentials; provider IDs stay on the server. */
export function findLabAccountProblem(form: LabSettingsForm): string | null {
  const shared = !!form.lisUsername.trim();
  if (shared && (!form.hasPassword || form.lisPassword) && !form.lisPassword.trim()) {
    return "Укажите пароль общей учётной записи.";
  }
  if (!shared && (form.hasPassword || form.lisPassword)) return "Укажите логин общей учётной записи.";
  let hasAccount = shared || !!form.lisOrganizationId;
  for (const row of form.branches) {
    const day = !row.clearCredentials && !!(row.lisUsername.trim() || row.hasPassword || row.lisPassword);
    if (day) {
      if (!row.lisUsername.trim()) return `${row.branchName}: укажите логин филиала.`;
      if ((!row.hasPassword || row.lisUsername.trim() !== row.savedUsername) && !row.lisPassword.trim()) {
        return `${row.branchName}: укажите пароль филиала.`;
      }
      hasAccount = true;
    }
    if (row.eveningEnabled) {
      if (!day || row.clearEveningCredentials || !row.eveningLisUsername.trim()) {
        return `${row.branchName}: для двух смен нужны логин и пароль каждой смены.`;
      }
      if ((!row.eveningHasPassword || row.eveningLisUsername.trim() !== row.eveningSavedUsername) && !row.eveningLisPassword.trim()) {
        return `${row.branchName}: укажите пароль вечерней смены.`;
      }
    }
  }
  return hasAccount ? null : "Укажите логин и пароль хотя бы одного филиала.";
}

export function labAccountsFormToInput(form: LabSettingsForm): LabAccountConfigInput {
  return {
    chargeInstruments: form.chargeInstruments,
    lisUsername: form.lisUsername.trim(),
    lisPassword: form.lisPassword,
    branches: form.branches.map((row) => ({
      branchId: row.branchId,
      lisUsername: row.lisUsername.trim(),
      lisPassword: row.lisPassword,
      clearCredentials: row.clearCredentials,
      eveningEnabled: row.eveningEnabled,
      eveningLisUsername: row.eveningLisUsername.trim(),
      eveningLisPassword: row.eveningLisPassword,
      clearEveningCredentials: row.clearEveningCredentials,
    })),
  };
}
