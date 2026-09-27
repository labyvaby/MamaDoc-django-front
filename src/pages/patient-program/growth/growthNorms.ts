import dayjs, { type Dayjs } from "dayjs";

import { WHO_LMS, type GrowthIndicator, type GrowthSex, type LmsRow } from "./whoGrowthData";

export type { GrowthIndicator, GrowthSex, LmsRow };
export type GrowthStatus = "ok" | "borderline" | "attention" | "unknown";

/** Средняя длина месяца у ВОЗ: 365,25 / 12. */
const DAYS_PER_MONTH = 30.4375;
const Z15 = 1.0364334;
const Z3 = 1.8807936;

/** Линии центилей графика: z для 3, 15, 50, 85 и 97 центилей. */
export const CENTILE_LINES: ReadonlyArray<{ key: "p3" | "p15" | "p50" | "p85" | "p97"; z: number }> = [
  { key: "p3", z: -Z3 },
  { key: "p15", z: -Z15 },
  { key: "p50", z: 0 },
  { key: "p85", z: Z15 },
  { key: "p97", z: Z3 },
];

/** Возраст в месяцах с долями на дату замера; null — нет даты рождения или она позже. */
export function ageMonths(birthDate: string | null | undefined, at: string | Dayjs): number | null {
  if (!birthDate) return null;
  const born = dayjs(birthDate).startOf("day");
  const when = dayjs(at).startOf("day");
  if (!born.isValid() || !when.isValid() || when.isBefore(born)) return null;
  return when.diff(born, "day") / DAYS_PER_MONTH;
}

/** L, M, S на возраст: линейно между соседними месяцами; вне таблицы — null. */
export function lmsAt(indicator: GrowthIndicator, sex: GrowthSex, months: number): LmsRow | null {
  const rows = WHO_LMS[indicator][sex];
  if (months < 0 || months > rows.length - 1) return null;
  const low = Math.floor(months);
  const high = Math.min(low + 1, rows.length - 1);
  const t = months - low;
  const a = rows[low];
  const b = rows[high];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Значение показателя при данном z — линии центилей. */
export function valueAtZ(lms: LmsRow, z: number): number {
  const [l, m, s] = lms;
  return Math.abs(l) < 1e-9 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

const ADJUSTED: ReadonlySet<GrowthIndicator> = new Set<GrowthIndicator>(["weight", "bmi"]);

/** z-оценка ВОЗ; для веса и ИМТ за пределами ±3 — поправка ВОЗ по шагу между 2 и 3 SD. */
export function zScore(indicator: GrowthIndicator, lms: LmsRow, value: number): number | null {
  if (!(value > 0)) return null;
  const [l, m, s] = lms;
  const z = Math.abs(l) < 1e-9 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
  if (!ADJUSTED.has(indicator) || Math.abs(z) <= 3) return z;
  if (z > 3) {
    const sd3 = valueAtZ(lms, 3);
    return 3 + (value - sd3) / (sd3 - valueAtZ(lms, 2));
  }
  const sd3 = valueAtZ(lms, -3);
  return -3 + (value - sd3) / (valueAtZ(lms, -2) - sd3);
}

/** Φ(z) через erf (Абрамовиц — Стиган 7.1.26, погрешность < 1,5·10⁻⁷). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function centile(z: number): number {
  return normalCdf(z) * 100;
}

/** 15–85 центиль — норма, 3–15 и 85–97 — погранично, за 3 и 97 — внимание. */
export function growthStatus(z: number | null): GrowthStatus {
  if (z == null) return "unknown";
  const abs = Math.abs(z);
  if (abs <= Z15) return "ok";
  if (abs <= Z3) return "borderline";
  return "attention";
}

export function centileLabel(value: number): string {
  if (value < 1) return "< 1-го центиля";
  if (value > 99) return "> 99-го центиля";
  return `${Math.round(value)}-й центиль`;
}

export interface GrowthAssessment {
  z: number;
  centile: number;
  status: GrowthStatus;
}

/** Оценка по ВОЗ; нет пола, возраста, значения или таблицы для возраста — null. */
export function assess(
  indicator: GrowthIndicator,
  sex: GrowthSex | null,
  months: number | null,
  value: number | null,
): GrowthAssessment | null {
  if (sex == null || months == null || value == null) return null;
  const lms = lmsAt(indicator, sex, months);
  if (!lms) return null;
  const z = zScore(indicator, lms, value);
  if (z == null || !Number.isFinite(z)) return null;
  return { z, centile: centile(z), status: growthStatus(z) };
}

/** Индекс массы тела: вес / рост² (м). */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

/** ИМТ словами по ВОЗ: до 5 лет и с 5 лет пороги разные. */
export function bmiVerdict(z: number | null, months: number | null): string {
  if (z == null || months == null) return "";
  if (z < -3) return "выраженный дефицит массы";
  if (z < -2) return "дефицит массы";
  if (months < 60) {
    if (z > 3) return "ожирение";
    if (z > 2) return "избыточный вес";
    if (z > 1) return "риск избыточного веса";
  } else {
    if (z > 2) return "ожирение";
    if (z > 1) return "избыточный вес";
  }
  return "норма для возраста";
}
