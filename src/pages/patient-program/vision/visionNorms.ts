import dayjs, { type Dayjs } from "dayjs";

/**
 * Нижняя граница нормы остроты зрения (десятичная, без коррекции) по полным
 * годам ребёнка; до года по таблице не оценивают. Таблицу подтверждает врач
 * клиники (ТЗ «Зрение» §3.1) — она только здесь.
 */
export const ACUITY_NORMS: ReadonlyArray<{ fromYears: number; min: number }> = [
  { fromYears: 7, min: 1.0 },
  { fromYears: 6, min: 0.9 },
  { fromYears: 5, min: 0.8 },
  { fromYears: 4, min: 0.7 },
  { fromYears: 3, min: 0.6 },
  { fromYears: 2, min: 0.4 },
  { fromYears: 1, min: 0.3 },
];

/** Насколько ниже нормы ещё «жёлтая» зона. */
export const BORDERLINE_GAP = 0.2;
const EPSILON = 1e-9;

export type EyeStatus = "ok" | "borderline" | "low" | "unknown";

/** Полных месяцев на дату осмотра; null — нет даты рождения или она позже. */
export function ageInMonths(birthDate: string | null | undefined, at: string | Dayjs): number | null {
  if (!birthDate) return null;
  const born = dayjs(birthDate);
  const when = dayjs(at);
  if (!born.isValid() || !when.isValid() || when.isBefore(born, "day")) return null;
  return when.diff(born, "month");
}

function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (count % 10 === 1) return one;
  if (count % 10 >= 2 && count % 10 <= 4) return few;
  return many;
}

/** «5 лет 4 мес.», «8 мес.», «2 года». */
export function ageLabel(months: number | null): string {
  if (months == null) return "";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} мес.`;
  const yearsText = `${years} ${plural(years, "год", "года", "лет")}`;
  return rest ? `${yearsText} ${rest} мес.` : yearsText;
}

/** Норма для возраста; null — младше года или возраст неизвестен. */
export function acuityNorm(months: number | null): number | null {
  if (months == null) return null;
  const years = Math.floor(months / 12);
  return ACUITY_NORMS.find((row) => years >= row.fromYears)?.min ?? null;
}

/** «0,8», «0.8», «1» → число 0,01–3,0; «н/о», пусто и мусор («123») → null. */
export function parseAcuity(raw: unknown): number | null {
  if (typeof raw === "number") return raw >= 0.01 && raw <= 3 ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return value >= 0.01 && value <= 3 ? value : null;
}

export function acuityStatus(value: number | null, norm: number | null): EyeStatus {
  if (value == null || norm == null) return "unknown";
  if (value >= norm - EPSILON) return "ok";
  if (value >= norm - BORDERLINE_GAP - EPSILON) return "borderline";
  return "low";
}

/** 0.8 → «0,8», 1 → «1,0», 0.05 → «0,05». */
export function formatAcuity(value: number): string {
  return value.toFixed(value < 0.1 ? 2 : 1).replace(".", ",");
}

/** Число — «0,8»; «н/о» и прочее — как записано. */
export function displayAcuity(raw: string): string {
  const value = parseAcuity(raw);
  return value == null ? raw.trim() : formatAcuity(value);
}
