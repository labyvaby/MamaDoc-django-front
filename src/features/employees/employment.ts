import type { RestoreEmployeeResult } from "../../api/staff";
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
    // Восстановление вернёт статус, что был до увольнения; выбранный статус
    // досылается PATCH-ем, если он окажется другим (решает вызывающий код,
    // сравнив с ответом ручки восстановления).
    return { restore: true, patchStatus: selected };
  }
  if (selected === recordStatus) return { restore: false };
  return { restore: false, patchStatus: selected };
}

/**
 * Уведомление после восстановления — ровно о том, что вернулось.
 *
 * Для уволенных до журнала бэк возвращает только статус, и обещать «доступ
 * и услуги вернутся» было бы неправдой: человек окажется «Активным», но не
 * сможет войти и не будет стоять ни на одной услуге.
 */
export function restoreOutcomeMessage(
  result: Pick<
    RestoreEmployeeResult,
    "alreadyActive" | "fromJournal" | "accessRestored" | "servicesRestored"
  >,
  name: string,
): { type: "success"; message: string } {
  const who = name ? `Сотрудник ${name}` : "Сотрудник";
  // Не был уволен — восстанавливать было нечего; текст «уволили до журнала»
  // тут был бы неправдой.
  if (result.alreadyActive) {
    return { type: "success", message: `${who} уже в штате.` };
  }
  if (!result.fromJournal) {
    return {
      type: "success",
      message:
        `${who} снова в штате. Его уволили до появления журнала, поэтому ` +
        "доступ в систему и услуги нужно выдать вручную.",
    };
  }
  const parts: string[] = [];
  if (result.accessRestored) parts.push("доступ в систему");
  if (result.servicesRestored > 0) parts.push(`услуги (${result.servicesRestored})`);
  return {
    type: "success",
    message: parts.length
      ? `${who} восстановлен: вернулись ${parts.join(" и ")}.`
      : `${who} восстановлен.`,
  };
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
