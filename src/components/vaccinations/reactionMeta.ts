import type {
  FollowupCheck,
  FollowupState,
  GeneralReaction,
  LocalReaction,
  TuberculinKind,
  TuberculinResult,
  TuberculinThresholds,
} from "../../api/vaccinations";

// Книжка ребёнка, этап 2в: доза и реакция на прививку, Манту и Диаскинтест,
// сетка БЦЖ. Чистая логика и подписи — компоненты берут отсюда.

export type ChipTone = "default" | "success" | "info" | "warning" | "error";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  tone?: ChipTone;
}

/** Частые объёмы дозы, мл: БЦЖ — 0,05; большинство вакцин — 0,5. */
export const DOSE_ML_OPTIONS: ChoiceOption<string>[] = [
  { value: "0.05", label: "0,05" },
  { value: "0.1", label: "0,1" },
  { value: "0.5", label: "0,5" },
  { value: "1", label: "1,0" },
];

export const LOCAL_REACTION_OPTIONS: ChoiceOption<LocalReaction>[] = [
  { value: "none", label: "Нет", tone: "success" },
  { value: "normal", label: "Обычная", tone: "info" },
  { value: "strong", label: "Сильная", tone: "error" },
];

export const GENERAL_REACTION_OPTIONS: ChoiceOption<GeneralReaction>[] = [
  { value: "none", label: "Нет", tone: "success" },
  { value: "mild", label: "Слабая", tone: "info" },
  { value: "moderate", label: "Средняя", tone: "warning" },
  { value: "strong", label: "Сильная", tone: "error" },
];

export const TUBERCULIN_KIND_OPTIONS: ChoiceOption<TuberculinKind>[] = [
  { value: "mantoux", label: "Манту" },
  { value: "diaskintest", label: "Диаскинтест" },
];

export const TUBERCULIN_RESULT_OPTIONS: ChoiceOption<TuberculinResult>[] = [
  { value: "negative", label: "Отрицательная", tone: "success" },
  { value: "doubtful", label: "Сомнительная", tone: "warning" },
  { value: "positive", label: "Положительная", tone: "warning" },
  { value: "hyperergic", label: "Гиперергическая", tone: "error" },
];

export const FOLLOWUP_STATE_META: Record<FollowupState, { label: string; tone: ChipTone }> = {
  waiting: { label: "ждёт", tone: "default" },
  due: { label: "пора", tone: "warning" },
  overdue: { label: "просрочено", tone: "error" },
  done: { label: "внесено", tone: "success" },
};

/** Что видно на месте прививки — частые записи кнопками. */
export const SITE_LOOK_PRESETS: string[] = [
  "Без изменений",
  "Инфильтрат",
  "Папула",
  "Пустула",
  "Корочка",
  "Рубчик",
];

/** Сетка БЦЖ формы 112/у — те же сроки, что бэк ставит БЦЖ по умолчанию. */
export const BCG_FOLLOWUP_PRESET: FollowupCheck[] = [
  { key: "w4_6", label: "4–6 нед.", fromDays: 28, toDays: 42 },
  { key: "m2", label: "2 мес.", fromDays: 56, toDays: 70 },
  { key: "m3_4", label: "3–4 мес.", fromDays: 90, toDays: 122 },
  { key: "m6_9", label: "6–9 мес.", fromDays: 180, toDays: 274 },
  { key: "y1", label: "1 год", fromDays: 365, toDays: 396 },
];

export function optionLabel<T extends string>(
  options: ChoiceOption<T>[],
  value: T | "" | null | undefined,
): string {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? value;
}

export function optionTone<T extends string>(
  options: ChoiceOption<T>[],
  value: T | "" | null | undefined,
): ChipTone {
  return options.find((option) => option.value === value)?.tone ?? "default";
}

export interface Parsed<T> {
  value: T | null;
  error: string | null;
}

/** «0,5» → "0.5"; пусто → null; не число или вне 0,01–10 мл — ошибка. */
export function parseDoseMl(text: string): Parsed<string> {
  const raw = text.trim().replace(",", ".");
  if (!raw) return { value: null, error: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw)) {
    return { value: null, error: "Число, до двух знаков после запятой" };
  }
  const amount = Number(raw);
  if (amount < 0.01 || amount > 10) return { value: null, error: "От 0,01 до 10 мл" };
  return { value: String(amount), error: null };
}

/** Значение поля из ответа: "0.50" → "0,5"; null → "". */
export function doseInput(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount).replace(".", ",") : "";
}

/** Подпись дозы: "0.50" → «0,5 мл»; null → "". */
export function doseLabel(value: string | null | undefined): string {
  const text = doseInput(value);
  return text ? `${text} мл` : "";
}

/** Размер, мм: целое 0–40; пусто → null. */
export function parseSizeMm(text: string): Parsed<number> {
  const raw = text.trim();
  if (!raw) return { value: null, error: null };
  if (!/^\d{1,2}$/.test(raw)) return { value: null, error: "Целое число мм" };
  const size = Number(raw);
  if (size > 40) return { value: null, error: "Не больше 40 мм" };
  return { value: size, error: null };
}

export function isStrongReaction(
  local: string | null | undefined,
  general: string | null | undefined,
): boolean {
  return local === "strong" || general === "strong";
}

/** «местная обычная, общая слабая»; ничего не отмечено → "". */
export function reactionSummary(
  local: LocalReaction | "" | null | undefined,
  general: GeneralReaction | "" | null | undefined,
): string {
  const parts: string[] = [];
  if (local) parts.push(`местная ${optionLabel(LOCAL_REACTION_OPTIONS, local).toLowerCase()}`);
  if (general) parts.push(`общая ${optionLabel(GENERAL_REACTION_OPTIONS, general).toLowerCase()}`);
  return parts.join(", ");
}

/**
 * Подсказка результата по размеру — тот же расчёт, что у бэка
 * (`vaccinations/tuberculin.py`), по порогам клиники. Пока порогов нет или
 * размер не введён — "": выбирает всё равно медсестра.
 */
export function suggestTuberculinResult(
  kind: TuberculinKind,
  sizeMm: number | null,
  thresholds: TuberculinThresholds | null | undefined,
): TuberculinResult | "" {
  if (sizeMm == null || !thresholds) return "";
  const own = thresholds[kind];
  if (own.hyperergicFrom != null && sizeMm >= own.hyperergicFrom) return "hyperergic";
  if (own.positiveFrom != null && sizeMm >= own.positiveFrom) return "positive";
  if (own.doubtfulFrom != null && sizeMm >= own.doubtfulFrom) return "doubtful";
  return "negative";
}

// ── Сроки осмотра в карточке вакцины ─────────────────────────────────────────

/** Строка редактора: дни строками, пока их вводят. */
export interface FollowupRow {
  key: string;
  label: string;
  fromDays: string;
  toDays: string;
}

export function toFollowupRows(checks: FollowupCheck[] | null | undefined): FollowupRow[] {
  return (checks ?? []).map((check) => ({
    key: check.key,
    label: check.label,
    fromDays: String(check.fromDays),
    toDays: String(check.toDays),
  }));
}

/**
 * Код нового срока: «k1», «k2»… — первый свободный. Код не меняется при правке:
 * по нему к сроку привязаны уже внесённые осмотры.
 */
export function nextFollowupKey(rows: { key: string }[]): string {
  const taken = new Set(rows.map((row) => row.key));
  let index = 1;
  while (taken.has(`k${index}`)) index += 1;
  return `k${index}`;
}

const MAX_FOLLOWUP_DAYS = 3650;

/** Первая ошибка в сроках (как проверяет бэк) или null. */
export function followupRowsError(rows: FollowupRow[]): string | null {
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) return "У каждого срока нужна подпись";
    if (label.length > 60) return "Подпись срока — до 60 знаков";
    if (!/^\d+$/.test(row.fromDays.trim()) || !/^\d+$/.test(row.toDays.trim())) {
      return "Дни срока — целые числа";
    }
    const from = Number(row.fromDays);
    const to = Number(row.toDays);
    if (to > MAX_FOLLOWUP_DAYS) return `Не дольше ${MAX_FOLLOWUP_DAYS} дней`;
    if (from > to) return `«${label}»: день «с» не позже дня «по»`;
  }
  return null;
}

export function fromFollowupRows(rows: FollowupRow[]): FollowupCheck[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label.trim(),
    fromDays: Number(row.fromDays),
    toDays: Number(row.toDays),
  }));
}
