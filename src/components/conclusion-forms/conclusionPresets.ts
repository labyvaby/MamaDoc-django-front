/**
 * Заготовки заключения и заполненность формы — чистые функции дровера.
 *
 * Заготовка — это то, чем врач заполняет документ не с нуля: сохранённый
 * шаблон или прошлое заключение того же пациента («как в прошлый раз»). У
 * обеих одинаковая форма: тексты колонок заключения плюс, если есть,
 * заполненный бланк (`formData`). Поэтому и применяются они одним правилом.
 *
 * Зачем отдельным модулем. Правило «куда лечь тексту заготовки» уже однажды
 * теряло данные молча: до 28.09.2026 шаблон писал текст прямо в колонку,
 * которую собирает прикреплённый бланк, и эффект проекции перезаписывал её при
 * первом же нажатии клавиши. Здесь правило видно целиком и покрыто тестами.
 */
import type { FormField, FormTarget } from "../../api/conclusionForms";

/** Текстовые колонки заключения, которые переносит заготовка. */
export type PresetColumn = "complaints" | "anamnesis" | "objective" | "conclusion";

export const PRESET_COLUMNS: PresetColumn[] = ["complaints", "anamnesis", "objective", "conclusion"];

export type PresetTexts = Partial<Record<PresetColumn, string | null | undefined>>;

export interface PresetTextPlan {
  /** Колонки, в которые текст ложится как есть. */
  set: Partial<Record<PresetColumn, string>>;
  /**
   * Тексты, которым в текущей форме нет своего поля: колонку собирает бланк
   * (`target`) или бланк её не показывает. Они дописываются в «Дополнительно»,
   * иначе пропали бы молча — ровно та ошибка, из-за которой модуль и появился.
   */
  manual: string[];
}

/**
 * Куда положить тексты заготовки.
 *
 * - Без бланка — каждая колонка в своё поле.
 * - С бланком — в своё поле только видимые колонки, которые бланк не собирает;
 *   колонка-адресат бланка и спрятанные колонки уходят в «Дополнительно».
 *
 * `visible` — видит ли врач колонку отдельным полем (штатным или строкой
 * бланка со `slot`); без бланка не спрашивается.
 */
export function planPresetTexts(args: {
  texts: PresetTexts;
  /** Колонка, которую собирает прикреплённый бланк; null — бланка нет. */
  formTarget: FormTarget | null;
  visible: (column: PresetColumn) => boolean;
}): PresetTextPlan {
  const { texts, formTarget, visible } = args;
  const plan: PresetTextPlan = { set: {}, manual: [] };
  for (const column of PRESET_COLUMNS) {
    const text = (texts[column] ?? "").trim();
    if (!text) continue;
    if (formTarget == null) {
      plan.set[column] = text;
    } else if (column !== formTarget && visible(column)) {
      plan.set[column] = text;
    } else {
      plan.manual.push(text);
    }
  }
  return plan;
}

/**
 * Значения строк бланка из заготовки поверх норм бланка.
 *
 * Берутся только строки, которые есть в бланке сейчас (администратор мог
 * убрать строку после сохранения шаблона), и только непустые: пустая строка
 * заготовки не должна стирать норму.
 */
export function presetFormValues(
  fields: Pick<FormField, "id">[],
  defaults: Record<string, string>,
  preset: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const own = preset[field.id];
    values[field.id] = own != null && own.trim() !== "" ? own : defaults[field.id] ?? "";
  }
  return values;
}

/** «Дополнительно» после заготовки: прежний хвост + ручной текст заготовки + её тексты без поля. */
export function mergeManual(current: string, ...parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [current, ...parts]) {
    const text = (part ?? "").trim();
    // Повторное применение той же заготовки не должно удваивать хвост.
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join("\n\n");
}

// ── заполненность ──────────────────────────────────────────────────────────────

export interface ProgressRow {
  id: string;
  value: string;
  /** Норма строки из бланка; у штатных полей нормы нет. */
  defaultValue?: string;
}

export interface ProgressSummary {
  total: number;
  /** Врач написал своё — строка отличается от нормы. */
  filled: number;
  /** Строка осталась нормой из бланка: заполнена, но врач её не трогал. */
  norm: number;
  /** Первая пустая строка — сюда ведёт «к пустому». */
  firstEmpty: string | null;
  /** Первая нетронутая норма — сюда ведёт «проверить норму». */
  firstNorm: string | null;
}

/**
 * Сводка для счётчика в шапке.
 *
 * Норма считается отдельно от заполненного: у карты гинеколога почти все
 * строки приходят с нормой, и счётчик «Заполнено 14 из 16» при открытии
 * говорил врачу, что документ почти готов, хотя он его ещё не читал.
 */
export function summarizeProgress(rows: ProgressRow[]): ProgressSummary {
  const summary: ProgressSummary = {
    total: rows.length,
    filled: 0,
    norm: 0,
    firstEmpty: null,
    firstNorm: null,
  };
  for (const row of rows) {
    const value = row.value.trim();
    const norm = (row.defaultValue ?? "").trim();
    if (!value) {
      summary.firstEmpty ??= row.id;
    } else if (norm && value === norm) {
      summary.norm += 1;
      summary.firstNorm ??= row.id;
    } else {
      summary.filled += 1;
    }
  }
  return summary;
}

// ── диагнозы из истории пациента ─────────────────────────────────────────────

export interface HistoryDiagnosis {
  code: string;
  title: string;
}

/**
 * Диагнозы из прошлых заключений пациента — для выбора в один клик.
 *
 * Новые сверху (история приходит от новых к старым), без повторов по коду,
 * без уже выбранных и без записей без кода: по свободному тексту каталог их
 * не найдёт, а одинаковые формулировки врачи пишут по-разному.
 */
export function historyDiagnoses(
  history: Array<{ diagnosisData?: Array<{ title?: string; diagnosis_code?: string; diagnosisCode?: string }> }>,
  selectedCodes: string[],
  limit = 6,
): HistoryDiagnosis[] {
  const taken = new Set(selectedCodes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  const out: HistoryDiagnosis[] = [];
  for (const conclusion of history) {
    for (const item of conclusion.diagnosisData ?? []) {
      const code = (item.diagnosis_code ?? item.diagnosisCode ?? "").trim();
      const key = code.toUpperCase();
      if (!code || taken.has(key)) continue;
      taken.add(key);
      out.push({ code, title: (item.title ?? "").trim() });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
