/**
 * Чистая логика страницы настройки ЛИС: форма ↔ контракт, проверка перед
 * отправкой. Вынесено из компонента по правилу проекта — рендер-тестов нет,
 * логика тестируется отдельно.
 */

import type { LabConfig, LabConfigInput } from "../../api/lab";

export interface LabBranchRow {
  branchId: number;
  branchName: string;
  /** Строки полей: пустая — точка не задана. */
  lisRegistryId: string;
  lisLaboratoryId: string;
}

export interface LabSettingsForm {
  lisOrganizationId: string;
  lisDoctorId: string;
  chargeInstruments: boolean;
  branches: LabBranchRow[];
}

const numberOrEmpty = (value: number | null): string => (value == null ? "" : String(value));

export function labConfigToForm(config: LabConfig): LabSettingsForm {
  return {
    lisOrganizationId: numberOrEmpty(config.lisOrganizationId),
    lisDoctorId: numberOrEmpty(config.lisDoctorId),
    chargeInstruments: config.chargeInstruments,
    branches: config.branches.map((row) => ({
      branchId: row.branchId,
      branchName: row.branchName,
      lisRegistryId: numberOrEmpty(row.lisRegistryId),
      lisLaboratoryId: numberOrEmpty(row.lisLaboratoryId),
    })),
  };
}

/** Положительное целое из поля или `null` для пустого/мусора. */
function positiveInt(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
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
  if (positiveInt(form.lisDoctorId) == null) {
    return "Код врача по умолчанию в ЛИС — положительное число.";
  }
  for (const row of form.branches) {
    const registryEmpty = row.lisRegistryId.trim() === "";
    const laboratoryEmpty = row.lisLaboratoryId.trim() === "";
    if (registryEmpty && laboratoryEmpty) continue;
    if (registryEmpty !== laboratoryEmpty) {
      return `${row.branchName}: укажите и точку регистрации, и лабораторию — либо оставьте оба поля пустыми.`;
    }
    if (positiveInt(row.lisRegistryId) == null || positiveInt(row.lisLaboratoryId) == null) {
      return `${row.branchName}: идентификаторы точки и лаборатории — положительные числа.`;
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
    branches: form.branches.map((row) => ({
      branchId: row.branchId,
      lisRegistryId: positiveInt(row.lisRegistryId),
      lisLaboratoryId: positiveInt(row.lisLaboratoryId),
    })),
  };
}
