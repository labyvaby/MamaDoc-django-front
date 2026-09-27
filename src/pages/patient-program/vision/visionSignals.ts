import dayjs, { type Dayjs } from "dayjs";

import type { RefractionEye, VisionExam } from "./visionData";
import { acuityNorm, ageInMonths, parseAcuity } from "./visionNorms";

/** Пороги сигналов (ТЗ «Зрение» §3.2). */
export const ASYMMETRY_THRESHOLD = 0.2;
export const ANISOMETROPIA_THRESHOLD = 1.0;
export const PROGRESSION_THRESHOLD = 0.5;
const MIN_PROGRESSION_DAYS = 90;
const EPSILON = 1e-9;

export type VisionSignal =
  | { kind: "asymmetry"; value: number }
  | { kind: "anisometropia"; value: number }
  | { kind: "myopia-progression"; eye: "OD" | "OS"; value: number };

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Сфероэквивалент: сфера + цилиндр/2. */
export function sphericalEquivalent(eye: RefractionEye | null | undefined): number | null {
  if (!eye || eye.sph == null) return null;
  return eye.sph + (eye.cyl ?? 0) / 2;
}

/**
 * На сколько диоптрий в год усилилась миопия глаза между двумя последними
 * осмотрами с рефракцией, не ближе 90 дней друг к другу; осмотры — от новых.
 */
export function myopiaRate(exams: ReadonlyArray<VisionExam>, side: "right" | "left"): number | null {
  const measured = exams
    .map((exam) => ({ at: dayjs(exam.record.occurredAt), se: sphericalEquivalent(exam.refraction?.[side]) }))
    .filter((item): item is { at: Dayjs; se: number } => item.se != null);
  const [newest, ...older] = measured;
  if (!newest) return null;
  const base = older.find((item) => newest.at.diff(item.at, "day") >= MIN_PROGRESSION_DAYS);
  if (!base) return null;
  const years = newest.at.diff(base.at, "day") / 365.25;
  const drop = base.se - newest.se;
  return drop > 0 ? drop / years : 0;
}

/** Сигналы по последнему осмотру и истории; осмотры — от новых к старым. */
export function visionSignals(exams: ReadonlyArray<VisionExam>): VisionSignal[] {
  const [latest] = exams;
  if (!latest) return [];
  const signals: VisionSignal[] = [];
  const right = parseAcuity(latest.acuityRight);
  const left = parseAcuity(latest.acuityLeft);
  if (right != null && left != null && Math.abs(right - left) >= ASYMMETRY_THRESHOLD - EPSILON) {
    signals.push({ kind: "asymmetry", value: round2(Math.abs(right - left)) });
  }
  const seRight = sphericalEquivalent(latest.refraction?.right);
  const seLeft = sphericalEquivalent(latest.refraction?.left);
  if (seRight != null && seLeft != null && Math.abs(seRight - seLeft) >= ANISOMETROPIA_THRESHOLD - EPSILON) {
    signals.push({ kind: "anisometropia", value: round2(Math.abs(seRight - seLeft)) });
  }
  for (const side of ["right", "left"] as const) {
    const rate = myopiaRate(exams, side);
    if (rate != null && rate >= PROGRESSION_THRESHOLD - EPSILON) {
      signals.push({ kind: "myopia-progression", eye: side === "right" ? "OD" : "OS", value: round2(rate) });
    }
  }
  return signals;
}

export function acuityTrend(current: number | null, previous: number | null): "up" | "down" | "same" | null {
  if (current == null || previous == null) return null;
  if (Math.abs(current - previous) < EPSILON) return "same";
  return current > previous ? "up" : "down";
}

export interface TrendPoint {
  label: string;
  od: number | null;
  os: number | null;
  /** Норма по возрасту на дату осмотра. */
  norm: number | null;
}

/** Точки графика от старых к новым; осмотры без остроты пропускаются. */
export function trendPoints(exams: ReadonlyArray<VisionExam>, birthDate: string | null): TrendPoint[] {
  return [...exams]
    .reverse()
    .map((exam) => ({
      label: dayjs(exam.record.occurredAt).format("MM.YYYY"),
      od: parseAcuity(exam.acuityRight),
      os: parseAcuity(exam.acuityLeft),
      norm: acuityNorm(ageInMonths(birthDate, exam.record.occurredAt)),
    }))
    .filter((point) => point.od != null || point.os != null);
}
