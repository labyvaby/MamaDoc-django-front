import type { ConclusionFormTemplate, FormFieldSlot } from "../api/conclusionForms";
import type { ConclusionTrailerFields } from "../components/conclusion-forms/ConclusionTrailer";

/**
 * Разложение заключения на печатный лист бланка и «хвост» под ним.
 *
 * Зачем отдельным модулем. Правило «что уже напечатано листом, а что нужно
 * допечатать» — единственное место, где документ может молча потерять данные
 * или напечатать их дважды. Оба раза, когда оно жило внутри дровера в
 * `useMemo`, оно оказывалось неверным (08.09.2026: сначала не печатался
 * диагноз, потом дважды печаталось «Объективно»). Здесь это чистая функция —
 * её видно целиком и она покрыта тестами.
 *
 * Бланк забирает колонку заключения двумя РАЗНЫМИ путями, и печать обязана
 * различать их:
 *  - `field.slot` — конкретное поле пишет прямо в колонку и стоит на листе
 *    своей строкой. Колонка напечатана полностью, в хвост не идёт.
 *  - `target` — в эту колонку уходит текст, собранный из всех НЕпривязанных
 *    полей (`renderFilledForm`), плюс ручной хвост врача. Строки бланка на
 *    листе уже есть, а вот ручной хвост (`formData.manual`) ни одной строкой
 *    листа не представлен — печатать в хвосте нужно именно его, иначе
 *    дописанное врачом не попадает на бумагу вообще.
 */

/** Значения колонок заключения — то, что реально сохранено в карточке. */
export interface ConclusionColumns {
  heightCm: string;
  weightKg: string;
  temperature: string;
  complaints: string;
  /** Диагнозы, уже собранные в одну строку (см. formatDiagnoses). */
  diagnosis: string;
  anamnesis: string;
  objective: string;
  conclusion: string;
}

export interface ConclusionPrintParts {
  /** Значения полей листа: свободные строки плюс подставленные колонки. */
  sheetValues: Record<string, string>;
  /** Что печатается под листом, перед подписью врача. */
  trailer: ConclusionTrailerFields;
}

const COLUMN_KEYS: FormFieldSlot[] = [
  "heightCm",
  "weightKg",
  "temperature",
  "complaints",
  "diagnosis",
  "anamnesis",
  "objective",
  "conclusion",
];

export function buildConclusionPrintParts(args: {
  template: Pick<ConclusionFormTemplate, "fields" | "target">;
  /** Значения полей бланка по id (из `formData`). */
  formValues: Record<string, string>;
  /** Ручной хвост врача под собранным текстом (из `formData.manual`). */
  manual: string;
  columns: ConclusionColumns;
}): ConclusionPrintParts {
  const { template, formValues, manual, columns } = args;

  const boundSlots = new Set<FormFieldSlot>();
  const sheetValues: Record<string, string> = { ...formValues };
  for (const field of template.fields ?? []) {
    if (!field.slot) continue;
    boundSlots.add(field.slot);
    // Привязанное поле показывает на листе не то, что набрали в бланке, а
    // текущее значение колонки заключения — источник правды у неё.
    sheetValues[field.id] = columns[field.slot] ?? "";
  }

  const trailer: ConclusionTrailerFields = {};
  for (const key of COLUMN_KEYS) {
    // Колонка стоит на листе своей строкой — второй раз не печатаем.
    if (boundSlots.has(key)) continue;
    if (key === template.target) {
      // Собранный текст бланка на листе уже есть построчно, а дописанное
      // врачом вручную — нет. В хвост идёт только оно.
      if (manual.trim()) trailer[key] = manual;
      continue;
    }
    if (columns[key]?.trim()) trailer[key] = columns[key];
  }

  return { sheetValues, trailer };
}

/**
 * Диагнозы МКБ в одну строку — тот же формат во всех документах: название для
 * пациента, если оно задано в каталоге, иначе «код - название».
 */
export function formatDiagnoses(
  items: { diagnosisCode?: string | null; title?: string | null; displayName?: string | null }[],
): string {
  return items
    .map((d) => {
      const display = d.displayName?.trim();
      if (display) return display;
      const title = d.title?.trim() ?? "";
      return d.diagnosisCode ? `${d.diagnosisCode} - ${title}` : title;
    })
    .filter(Boolean)
    .join("; ");
}
