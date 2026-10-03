import type { InnAbsentReason, PatientGenderValue } from "../../api/vaccinations";
import { parseKgPin } from "../../utils/kgPin";

/** Данные пациента, без которых прививку не оформить. */
export interface PatientDraft {
  gender: PatientGenderValue;
  birthDate: string | null;
  inn: string;
  innAbsentReason: InnAbsentReason | "";
}

export type PatientGap = "gender" | "birthDate" | "inn";

/** Каких данных пациента не хватает до «Проведена». */
export function patientGaps(p: PatientDraft): PatientGap[] {
  const gaps: PatientGap[] = [];
  if (p.gender === "unknown") gaps.push("gender");
  if (!p.birthDate) gaps.push("birthDate");
  if (!p.inn && !p.innAbsentReason) gaps.push("inn");
  return gaps;
}

/**
 * Ввод ИНН: заполняет пустые пол и дату рождения, расхождение возвращает
 * текстом и ничего не затирает (как бэк — там это 400).
 */
export function applyInnToPatientDraft(
  draft: PatientDraft,
  inn: string,
): { draft: PatientDraft; conflict: string | null } {
  const next: PatientDraft = { ...draft, inn };
  if (!inn) return { draft: next, conflict: null };
  const parsed = parseKgPin(inn);
  if (!parsed.ok) {
    // Номер не на 1/2 — не ПИН физлица: сохраняется как есть, но с подсказкой.
    const accepted = "notPersonal" in parsed ? { ...next, innAbsentReason: "" as const } : next;
    return { draft: accepted, conflict: parsed.error };
  }
  next.innAbsentReason = "";
  if (draft.gender !== "unknown" && draft.gender !== parsed.gender) {
    return { draft: next, conflict: "Пол не совпадает с ИНН" };
  }
  if (draft.birthDate && draft.birthDate !== parsed.birthDate) {
    return { draft: next, conflict: "Дата рождения не совпадает с ИНН" };
  }
  return {
    draft: { ...next, gender: parsed.gender, birthDate: parsed.birthDate },
    conflict: null,
  };
}

/** Что из пациента реально поменяли — только это уходит в тело administer. */
export interface PatientChanges {
  gender?: "male" | "female";
  birthDate?: string;
  inn?: string;
  innAbsentReason?: PatientDraft["innAbsentReason"];
}

export function changedPatientFields(original: PatientDraft, current: PatientDraft): PatientChanges {
  const out: PatientChanges = {};
  if (current.gender !== original.gender && current.gender !== "unknown") {
    out.gender = current.gender;
  }
  if (current.birthDate !== original.birthDate && current.birthDate) {
    out.birthDate = current.birthDate;
  }
  if (current.inn !== original.inn && current.inn) out.inn = current.inn;
  if (current.innAbsentReason !== original.innAbsentReason) {
    out.innAbsentReason = current.innAbsentReason;
  }
  return out;
}

/** Возраст «2 г. 3 мес.» / «5 мес.» / «12 дн.» на дату *on* (по умолчанию сегодня). */
export function ageLabel(birthDate: string | null, on: Date = new Date()): string {
  if (!birthDate) return "";
  const [y, m, d] = birthDate.split("-").map(Number);
  let months = (on.getFullYear() - y) * 12 + (on.getMonth() + 1 - m);
  if (on.getDate() < d) months -= 1;
  if (months < 1) {
    const days = Math.floor((on.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
    return `${Math.max(days, 0)} дн.`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} мес.`;
  return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
}
