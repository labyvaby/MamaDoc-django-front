import dayjs from "dayjs";

import type { EffectiveProgramModule, ProgramModuleRecord } from "../../../api/programs";
import { ageMonths, assess, bmi, type GrowthAssessment, type GrowthIndicator, type GrowthSex } from "./growthNorms";

/**
 * Замеры раздела «Рост и развитие» — общие записи модуля конструктора
 * (`heightCm`, `weightKg`, `headCircumferenceCm`; новое — `chestCircumferenceCm`).
 */

export function isGrowthModule(module: Pick<EffectiveProgramModule, "code" | "moduleType">): boolean {
  const key = `${module.code} ${module.moduleType}`.toLowerCase();
  return ["growth", "measure", "anthrop"].some((part) => key.includes(part));
}

export function growthSex(gender: string | null | undefined): GrowthSex | null {
  return gender === "male" || gender === "female" ? gender : null;
}

export interface Measurement {
  record: ProgramModuleRecord;
  at: string;
  /** Возраст на дату замера, месяцы с долями. */
  months: number | null;
  heightCm: number | null;
  weightKg: number | null;
  headCm: number | null;
  chestCm: number | null;
  bmi: number | null;
}

export type MeasureKey = "heightCm" | "weightKg" | "headCm" | "bmi";

export const INDICATOR_OF: Record<MeasureKey, GrowthIndicator> = {
  heightCm: "height",
  weightKg: "weight",
  headCm: "head",
  bmi: "bmi",
};

/** Положительное число из записи: число или строка «123,5»; иначе null. */
function positive(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readMeasurement(record: ProgramModuleRecord, birthDate: string | null): Measurement {
  const heightCm = positive(record.data.heightCm);
  const weightKg = positive(record.data.weightKg);
  return {
    record,
    at: record.occurredAt,
    months: ageMonths(birthDate, record.occurredAt),
    heightCm,
    weightKg,
    headCm: positive(record.data.headCircumferenceCm),
    chestCm: positive(record.data.chestCircumferenceCm),
    bmi: bmi(weightKg, heightCm),
  };
}

/** Замеры от новых к старым; запланированные записи — не замеры. */
export function readMeasurements(records: ReadonlyArray<ProgramModuleRecord>, birthDate: string | null): Measurement[] {
  return records
    .filter((record) => record.status !== "planned")
    .map((record) => readMeasurement(record, birthDate))
    .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf());
}

export function assessMeasurement(item: Measurement, key: MeasureKey, sex: GrowthSex | null): GrowthAssessment | null {
  return assess(INDICATOR_OF[key], sex, item.months, item[key]);
}

/** Ближайший более ранний замер, где показатель есть. */
export function previousWith(list: ReadonlyArray<Measurement>, item: Measurement, key: MeasureKey): Measurement | null {
  const index = list.indexOf(item);
  return list.slice(index + 1).find((other) => other[key] != null) ?? null;
}

/** «+5 см за 6 мес.», «−0,2 кг за 6 мес.», «+0,5 кг за 3 нед.». */
export function deltaLabel(current: number, previous: number, unit: string, fromIso: string, toIso: string, digits: number): string {
  const diff = Math.round((current - previous) * 10 ** digits) / 10 ** digits;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const amount = Math.abs(diff).toFixed(digits).replace(".", ",").replace(/,0+$/, "");
  const days = dayjs(toIso).startOf("day").diff(dayjs(fromIso).startOf("day"), "day");
  const span =
    days < 45
      ? `${Math.max(1, Math.round(days / 7))} нед.`
      : days < 730
        ? `${Math.round(days / 30.4375)} мес.`
        : `${(days / 365.25).toFixed(1).replace(".", ",")} г.`;
  return `${sign}${amount} ${unit} за ${span}`;
}

export interface GrowthForm {
  heightCm: string;
  weightKg: string;
  headCm: string;
  chestCm: string;
  notes: string;
}

export function emptyGrowthForm(): GrowthForm {
  return { heightCm: "", weightKg: "", headCm: "", chestCm: "", notes: "" };
}

const text = (value: number | null): string => (value == null ? "" : String(value));

export function growthToForm(item: Measurement): GrowthForm {
  return {
    heightCm: text(item.heightCm),
    weightKg: text(item.weightKg),
    headCm: text(item.headCm),
    chestCm: text(item.chestCm),
    notes: item.record.notes,
  };
}

/** «123,5» → 123.5; пусто и не больше нуля → null. */
export function parseMeasure(raw: string): number | null {
  return positive(raw);
}

const MEASURE_KEYS: ReadonlySet<string> = new Set(["heightCm", "weightKg", "headCircumferenceCm", "chestCircumferenceCm"]);

/**
 * Данные записи: замеры — только заполненные, числами; прочие поля раздела
 * (клиника могла добавить их в конструкторе) при правке не теряются.
 */
export function buildGrowthData(form: GrowthForm, previous: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(previous).filter(([key]) => !MEASURE_KEYS.has(key)));
  const put = (key: string, raw: string) => {
    const value = parseMeasure(raw);
    if (value != null) data[key] = value;
  };
  put("heightCm", form.heightCm);
  put("weightKg", form.weightKg);
  put("headCircumferenceCm", form.headCm);
  put("chestCircumferenceCm", form.chestCm);
  return data;
}

/** Рост и вес обязательны — так в схеме конструктора. */
export function growthFormValid(form: GrowthForm): boolean {
  return parseMeasure(form.heightCm) != null && parseMeasure(form.weightKg) != null;
}

/** Кнопки ±: шаг от текущего значения, не меньше нуля. */
export function stepValue(raw: string, delta: number, digits: number): string {
  const current = positive(raw) ?? 0;
  const next = Math.max(0, Math.round((current + delta) * 10 ** digits) / 10 ** digits);
  return String(next);
}
