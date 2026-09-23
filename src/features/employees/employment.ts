import { formatDateRu } from "../../utility/format";
import type { DjangoEmploymentInfoLocal } from "./types";

export type EmployeeStatusValue = "active" | "inactive" | "fired";

export type StatusSavePlan = {
  /** Вызвать POST .../restore/ перед сохранением остальных полей. */
  restore: boolean;
  /** Статус в PATCH; `undefined` — не слать поле вовсе. */
  patchStatus?: EmployeeStatusValue;
};

/**
 * Что делать со статусом при сохранении карточки.
 *
 * Переходы в «Уволен» и из него бэк через PATCH не пропускает: вместе со
 * статусом надо снять или вернуть членство в организации и услуги, иначе
 * получается полусостояние — в карточке «Активный», а человек без доступа.
 * Поэтому возврат уходит в отдельную ручку, а PATCH досылает статус только
 * если выбранный отличается от того, каким сотрудник станет после неё.
 */
export function planStatusSave(
  recordStatus: EmployeeStatusValue,
  selected: EmployeeStatusValue,
): StatusSavePlan {
  if (recordStatus === "fired") {
    if (selected === "fired") return { restore: false };
    // restore_employee всегда делает сотрудника активным.
    return { restore: true, patchStatus: selected === "inactive" ? "inactive" : undefined };
  }
  if (selected === recordStatus) return { restore: false };
  return { restore: false, patchStatus: selected };
}

/**
 * Подпись под словом «Уволен» в карточке: «22.09.2026 · Бахтибаева Нуржан».
 *
 * Обе части необязательны — сотрудников, уволенных до появления журнала,
 * система знает только по факту статуса.
 */
export function formatFiredNote(
  employment: DjangoEmploymentInfoLocal | null | undefined,
): string {
  if (!employment?.firedAt) return "";
  const when = formatDateRu(employment.firedAt);
  return employment.firedBy ? `${when} · ${employment.firedBy}` : when;
}
