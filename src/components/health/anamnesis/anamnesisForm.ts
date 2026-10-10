import type { SensitiveHistory } from "../../../api/health";
import { parseNumberField } from "../healthForms";

/**
 * Числа форм раздела: в форме — строки, в запросе — числа; пусто — null,
 * ошибка ввода — NaN (кнопка сохранения выключается).
 */

export const numText = (value: number | null | undefined): string => (value == null ? "" : String(value).replace(".", ","));

export function numValue(raw: string): number | null {
  return parseNumberField(raw);
}

/** Целое в границах; пусто — null; вне границ или мусор — NaN. */
export function intInRange(raw: string, min: number, max: number): number | null {
  const value = parseNumberField(raw);
  if (value == null) return null;
  if (Number.isNaN(value) || !Number.isInteger(value) || value < min || value > max) return Number.NaN;
  return value;
}

/** Дробное в границах (до десятых); пусто — null; иначе NaN. */
export function decimalInRange(raw: string, min: number, max: number): number | null {
  const value = parseNumberField(raw);
  if (value == null) return null;
  if (Number.isNaN(value) || value < min || value > max) return Number.NaN;
  return Math.round(value * 10) / 10;
}

/** Закрытые сведения до первого сохранения: всё «неизвестно». */
export function emptySensitiveHistory(): SensitiveHistory {
  return {
    motherHbsag: "",
    motherHcv: "",
    motherHiv: "",
    motherSyphilis: "",
    tbContact: "",
    tbContactPlace: "",
    tbContactFrom: null,
    tbContactTo: null,
    tbSourceBacillary: null,
    tbPreventiveTherapy: null,
    tbPreventiveFrom: null,
    tbPreventiveTo: null,
    householdInfections: null,
    asocialFamily: null,
    asocialNote: "",
    notes: "",
  };
}
