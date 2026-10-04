import type { ScribeResult, ScribeSection } from "../api/scribe";

/** Текущие значения формы заключения, к которым применяется результат записи. */
export interface FormSnapshot {
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusion: string;
  weightKg: string;
  heightCm: string;
  temperature: string;
}

export type VitalField = "weightKg" | "heightCm" | "temperature";

export interface ScribePlan {
  /** Вписать сразу (поле было пустым). */
  direct: Partial<Record<ScribeSection, string>>;
  /** Поле заполнено и отличается — в окно сравнения. */
  review: Array<{ key: ScribeSection; suggestion: string }>;
  /** Показатели — только в пустые поля. */
  vitals: Partial<Record<VitalField, string>>;
}

const SECTIONS: ScribeSection[] = ["complaints", "anamnesis", "objective", "conclusion"];
const VITALS: VitalField[] = ["weightKg", "heightCm", "temperature"];
const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Правило из спеки: пустые поля заполняются сразу, заполненные — через
 * сравнение; совпадающее с точностью до пробелов/регистра не предлагается.
 * Поля, которых нет в `editable` (спрятаны под бланком, недоступны), не
 * трогаются вовсе.
 */
export function planScribeApply(
  form: FormSnapshot,
  result: ScribeResult,
  editable: readonly ScribeSection[],
): ScribePlan {
  const plan: ScribePlan = { direct: {}, review: [], vitals: {} };
  for (const key of SECTIONS) {
    const text = (result.sections[key] ?? "").trim();
    if (!text || !editable.includes(key)) continue;
    const current = form[key];
    if (!current.trim()) plan.direct[key] = text;
    else if (norm(current) !== norm(text)) plan.review.push({ key, suggestion: text });
  }
  for (const key of VITALS) {
    const value = result.vitals[key];
    if (value != null && !form[key].trim()) plan.vitals[key] = String(value);
  }
  return plan;
}
