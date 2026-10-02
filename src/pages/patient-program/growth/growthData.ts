import dayjs from "dayjs";

import type { GrowthData, GrowthMeasurement, MeasurementInput, MeasurementPosition } from "../../../api/health";
import { ageMonths, assess, bmi, type GrowthAssessment, type GrowthIndicator, type GrowthSex } from "./growthNorms";

/**
 * Замеры «Роста и питания» — из медпрофиля пациента (этап 2б): ручные,
 * из заключений приёмов и из архива. Оценки ВОЗ считаются здесь, в браузере.
 */

const DAYS_PER_MONTH = 30.4375;
/** До двух лет недоношенным считают скорректированный возраст. */
const CORRECTION_LIMIT_DAYS = 730;

export function growthSex(gender: string | null | undefined): GrowthSex | null {
  return gender === "male" || gender === "female" ? gender : null;
}

/** Срок гестации из профиля (для скорректированного возраста). */
export interface Gestation {
  weeks: number | null;
  days: number | null;
}

/**
 * Возраст для норм ВОЗ: родившимся раньше 37 недель до двух лет —
 * скорректированный (минус недоношенные дни). Раньше срока доношенности —
 * оценок нет (`months: null`).
 */
export function normsAge(
  birthDate: string | null | undefined,
  at: string,
  gestation?: Gestation | null,
): { months: number | null; corrected: boolean } {
  const months = ageMonths(birthDate, at);
  const weeks = gestation?.weeks ?? null;
  if (months == null || weeks == null || weeks >= 37) return { months, corrected: false };
  const days = Math.round(months * DAYS_PER_MONTH);
  if (days >= CORRECTION_LIMIT_DAYS) return { months, corrected: false };
  const premature = 280 - (weeks * 7 + (gestation?.days ?? 0));
  const corrected = days - premature;
  return { months: corrected < 0 ? null : corrected / DAYS_PER_MONTH, corrected: true };
}

/** Длина лёжа до двух лет, рост стоя после: другой способ — поправка 0,7 см (ВОЗ). */
export function heightForNorms(heightCm: number | null, position: MeasurementPosition, months: number | null): number | null {
  if (heightCm == null || months == null) return heightCm;
  if (months < 24 && position === "standing") return Math.round((heightCm + 0.7) * 10) / 10;
  if (months >= 24 && position === "recumbent") return Math.round((heightCm - 0.7) * 10) / 10;
  return heightCm;
}

/** Как мерить по возрасту: до двух лет — лёжа. */
export function defaultPosition(months: number | null): MeasurementPosition {
  return months == null || months < 24 ? "recumbent" : "standing";
}

export interface Measurement {
  key: string;
  /** Номер замера на сервере; у точки рождения — null. */
  id: number | null;
  at: string;
  /** Возраст для норм (скорректированный у недоношенных), месяцы с долями. */
  months: number | null;
  corrected: boolean;
  heightCm: number | null;
  /** Рост для сравнения с ВОЗ (с поправкой лёжа/стоя). */
  heightNormsCm: number | null;
  position: MeasurementPosition;
  weightKg: number | null;
  headCm: number | null;
  chestCm: number | null;
  bmi: number | null;
  author: string;
  /** Ручной замер: правится в разделе. Из заключения — в заключении. */
  editable: boolean;
  sourceLabel: string;
  appointmentId: number | null;
  notes: string;
}

export type MeasureKey = "heightCm" | "weightKg" | "headCm" | "bmi";

export const INDICATOR_OF: Record<MeasureKey, GrowthIndicator> = {
  heightCm: "height",
  weightKg: "weight",
  headCm: "head",
  bmi: "bmi",
};

const SOURCE_LABELS: Record<GrowthMeasurement["source"], string> = {
  manual: "",
  conclusion: "из заключения приёма",
  import: "из архива заключений",
};

export function fromApiMeasurement(
  row: GrowthMeasurement,
  birthDate: string | null,
  gestation?: Gestation | null,
): Measurement {
  const { months, corrected } = normsAge(birthDate, row.measuredOn, gestation);
  return {
    key: `m-${row.id}`,
    id: row.id,
    at: row.measuredOn,
    months,
    corrected,
    heightCm: row.lengthHeightCm,
    heightNormsCm: heightForNorms(row.lengthHeightCm, row.position, months),
    position: row.position,
    weightKg: row.weightKg,
    headCm: row.headCircumferenceCm,
    chestCm: row.chestCircumferenceCm,
    bmi: bmi(row.weightKg, row.lengthHeightCm),
    author: row.createdBy?.fullName ?? "",
    editable: row.source === "manual",
    sourceLabel: SOURCE_LABELS[row.source],
    appointmentId: row.appointmentId,
    notes: row.notes,
  };
}

/** Замеры от новых к старым и точка рождения из профиля последней. */
export function readGrowth(data: GrowthData): Measurement[] {
  const gestation = { weeks: data.gestationalAgeWeeks, days: data.gestationalAgeDays };
  const list = data.measurements
    .map((row) => fromApiMeasurement(row, data.birthDate, gestation))
    .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf() || (b.id ?? 0) - (a.id ?? 0));
  if (data.birth && data.birthDate) {
    const { months, corrected } = normsAge(data.birthDate, data.birthDate, gestation);
    list.push({
      key: "birth",
      id: null,
      at: data.birthDate,
      months,
      corrected,
      heightCm: data.birth.lengthCm,
      heightNormsCm: data.birth.lengthCm,
      position: "recumbent",
      weightKg: data.birth.weightKg,
      headCm: data.birth.headCircumferenceCm,
      chestCm: null,
      bmi: bmi(data.birth.weightKg, data.birth.lengthCm),
      author: "",
      editable: false,
      sourceLabel: "при рождении",
      appointmentId: null,
      notes: "",
    });
  }
  return list;
}

export function assessMeasurement(item: Measurement, key: MeasureKey, sex: GrowthSex | null): GrowthAssessment | null {
  const value = key === "heightCm" ? item.heightNormsCm : item[key];
  return assess(INDICATOR_OF[key], sex, item.months, value);
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
        ? `${Math.round(days / DAYS_PER_MONTH)} мес.`
        : `${(days / 365.25).toFixed(1).replace(".", ",")} г.`;
  return `${sign}${amount} ${unit} за ${span}`;
}

export interface GrowthForm {
  measuredOn: string;
  position: MeasurementPosition;
  heightCm: string;
  weightKg: string;
  headCm: string;
  chestCm: string;
  notes: string;
}

export function emptyGrowthForm(measuredOn: string, position: MeasurementPosition): GrowthForm {
  return { measuredOn, position, heightCm: "", weightKg: "", headCm: "", chestCm: "", notes: "" };
}

const text = (value: number | null): string => (value == null ? "" : String(value));

export function growthToForm(item: Measurement): GrowthForm {
  return {
    measuredOn: item.at,
    position: item.position,
    heightCm: text(item.heightCm),
    weightKg: text(item.weightKg),
    headCm: text(item.headCm),
    chestCm: text(item.chestCm),
    notes: item.notes,
  };
}

/** Положительное число: «123,5» → 123.5; пусто и не больше нуля → null. */
export function parseMeasure(raw: string): number | null {
  const parsed = Number(raw.trim().replace(",", "."));
  return raw.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Нужна дата и хотя бы одно значение. */
export function growthFormValid(form: GrowthForm): boolean {
  const values = [form.heightCm, form.weightKg, form.headCm, form.chestCm].map(parseMeasure);
  return Boolean(form.measuredOn) && values.some((value) => value != null);
}

/** Тело запроса замера: числа, длина или рост — с положением. */
export function buildMeasurementInput(form: GrowthForm): MeasurementInput {
  const height = parseMeasure(form.heightCm);
  return {
    measuredOn: form.measuredOn,
    weightKg: parseMeasure(form.weightKg),
    lengthHeightCm: height,
    position: height == null ? "" : form.position,
    headCircumferenceCm: parseMeasure(form.headCm),
    chestCircumferenceCm: parseMeasure(form.chestCm),
    notes: form.notes.trim(),
  };
}

/** Кнопки ±: шаг от текущего значения, не меньше нуля. */
export function stepValue(raw: string, delta: number, digits: number): string {
  const current = parseMeasure(raw) ?? 0;
  const next = Math.max(0, Math.round((current + delta) * 10 ** digits) / 10 ** digits);
  return String(next);
}
