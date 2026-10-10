import dayjs from "dayjs";

import { ageLabel } from "../vision/visionNorms";

/**
 * Нормы раздела «Опорно-двигательная система» (ТЗ §3.1–3.3). Возраст — на
 * дату осмотра. Пороги — из справки docs/research/2026-10-04-book-orthopedics.md;
 * где единого стандарта нет, значение помечено «врачу подтвердить» и живёт
 * только здесь, чтобы клиника могла поменять его в одном месте.
 */

export type OrthoStatus = "ok" | "warn" | "bad" | "unknown";

const RANK: Record<OrthoStatus, number> = { unknown: 0, ok: 1, warn: 2, bad: 3 };

/** Худший из статусов; «нет оценки» уступает любой оценке. */
export function worst(...statuses: ReadonlyArray<OrthoStatus | null | undefined>): OrthoStatus {
  let result: OrthoStatus = "unknown";
  for (const status of statuses) {
    if (status && RANK[status] > RANK[result]) result = status;
  }
  return result;
}

/** Полных месяцев на дату; без даты рождения или до рождения — null. */
export function ageMonths(birthDate: string | null | undefined, on: string | dayjs.Dayjs): number | null {
  if (!birthDate) return null;
  const months = dayjs(on).diff(dayjs(birthDate), "month", true);
  return months < 0 ? null : months;
}

/** Полных недель на дату — для типа по Графу. */
export function ageWeeks(birthDate: string | null | undefined, on: string | dayjs.Dayjs): number | null {
  if (!birthDate) return null;
  const weeks = dayjs(on).diff(dayjs(birthDate), "week", true);
  return weeks < 0 ? null : weeks;
}

// ── Тазобедренные суставы ────────────────────────────────────────────────────

export interface GrafSuggestion {
  /** Тип, если его можно назвать по углам и возрасту; иначе пусто. */
  type: string;
  /** Подпись для людей: «IIa», «IIa или IIb», «III или IV». */
  label: string;
  status: OrthoStatus;
}

/** Подсказка типа по Графу (ТЗ §3.2): окончательно тип ставит врач. */
export function grafSuggest(alpha: number | null, beta: number | null, weeks: number | null): GrafSuggestion | null {
  if (alpha == null) return null;
  if (alpha >= 60) {
    if (beta == null) return { type: "", label: "I", status: "ok" };
    return beta <= 55 ? { type: "Ia", label: "Ia", status: "ok" } : { type: "Ib", label: "Ib", status: "ok" };
  }
  if (alpha >= 50) {
    if (weeks == null) return { type: "", label: "IIa или IIb", status: "warn" };
    if (weeks >= 12) return { type: "IIb", label: "IIb", status: "bad" };
    if (weeks >= 6) {
      return alpha >= 55 ? { type: "IIa+", label: "IIa(+)", status: "warn" } : { type: "IIa-", label: "IIa(−)", status: "bad" };
    }
    return { type: "IIa", label: "IIa", status: "warn" };
  }
  if (alpha >= 43) {
    if (beta == null) return { type: "", label: "IIc или D", status: "bad" };
    return beta <= 77 ? { type: "IIc", label: "IIc", status: "bad" } : { type: "D", label: "D", status: "bad" };
  }
  return { type: "", label: "III или IV", status: "bad" };
}

/** Цвет типа, который поставил врач. IIa — по возрасту, как в подсказке. */
export function grafTypeStatus(type: string, weeks: number | null): OrthoStatus {
  if (type === "Ia" || type === "Ib") return "ok";
  if (type === "IIa+") return "warn";
  if (type === "IIa") return weeks != null && weeks >= 12 ? "bad" : "warn";
  if (!type) return "unknown";
  return "bad";
}

// ── Шея: кривошея по APTA 2018 ───────────────────────────────────────────────

/** Степень 1–8 (ТЗ §3.3). `rotationDiff` — разница поворота головы, °. */
export function aptaGrade(months: number | null, rotationDiff: number | null, mass: boolean): number | null {
  if (months == null) return null;
  const diff = rotationDiff ?? 0;
  if (months > 12) return 8;
  if (months <= 6) {
    if (mass || diff > 30) return 3;
    return diff >= 15 ? 2 : 1;
  }
  if (months <= 9) {
    if (mass) return 7;
    return diff > 15 ? 6 : 4;
  }
  if (mass || diff > 30) return 7;
  return diff >= 15 ? 6 : 5;
}

export function aptaStatus(grade: number | null): OrthoStatus {
  if (grade == null) return "unknown";
  return [3, 6, 7, 8].includes(grade) ? "bad" : "warn";
}

// ── Стопы ────────────────────────────────────────────────────────────────────

/**
 * Угол пятки: плюс — вальгус, минус — варус. До 7 лет вальгус до 10° — норма,
 * с 7 лет — до 5°; до 15° — пограничное; больше — отклонение. Варус больше 5° —
 * отклонение (врачу подтвердить).
 */
export function heelStatus(deg: number | null, months: number | null): OrthoStatus {
  if (deg == null) return "unknown";
  if (deg < 0) return deg >= -5 ? "warn" : "bad";
  const okLimit = months != null && months >= 84 ? 5 : 10;
  if (deg <= okLimit) return "ok";
  return deg <= 15 ? "warn" : "bad";
}

/**
 * Плоскостопие (КР РФ 2025): мобильное без жалоб — вариант нормы; с жалобами
 * или после 10 лет (возраст — врачу подтвердить) — пограничное; ригидное —
 * отклонение. Нормальный и высокий свод без жалоб — норма.
 */
export function flatfootStatus(
  arch: ReadonlyArray<string | null>,
  mobility: "mobile" | "rigid" | null,
  complaints: boolean,
  months: number | null,
): OrthoStatus {
  if (mobility === "rigid") return "bad";
  const flat = arch.some((value) => value === "flat" || value === "flattened");
  const known = arch.some((value) => value != null);
  if (!flat) return known ? (complaints ? "warn" : "ok") : complaints ? "warn" : "unknown";
  if (complaints) return "warn";
  if (months != null && months >= 120) return "warn";
  return "ok";
}

/** Плоскостопие без жалоб у ребёнка до 10 лет — «физиологично». */
export function flatfootPhysiological(
  arch: ReadonlyArray<string | null>,
  mobility: "mobile" | "rigid" | null,
  complaints: boolean,
  months: number | null,
): boolean {
  const flat = arch.some((value) => value === "flat" || value === "flattened");
  return flat && mobility !== "rigid" && !complaints && (months == null || months < 120);
}

export function fpiStatus(value: number | null): OrthoStatus {
  if (value == null) return "unknown";
  if (value >= 0 && value <= 6) return "ok";
  if ((value >= 7 && value <= 9) || (value <= -1 && value >= -4)) return "warn";
  return "bad";
}

/** Индекс Чижина — справочно; до 7 лет не оцениваем. */
export function chizhinStatus(value: number | null, months: number | null): OrthoStatus {
  if (value == null || (months != null && months < 84)) return "unknown";
  if (value <= 1) return "ok";
  return value <= 2 ? "warn" : "bad";
}

// ── Ноги ─────────────────────────────────────────────────────────────────────

/**
 * Ось ног по возрасту. Варус (межмыщелковое расстояние): до 2 лет ≤ 5 см —
 * норма; 2–3 года или больше 5 см до 2 лет — пограничное; старше 3 лет и
 * больше 5 см — отклонение. Вальгус (межлодыжечное): до 8 лет ≤ 7 см — норма;
 * 7–8 см или с 8 лет — пограничное; больше 8 см — отклонение. Асимметрия —
 * отклонение.
 */
export function legAxisStatus(
  axis: "neutral" | "varus" | "valgus" | null,
  distanceCm: number | null,
  symmetric: boolean,
  months: number | null,
): OrthoStatus {
  if (axis == null) return "unknown";
  if (!symmetric && axis !== "neutral") return "bad";
  if (axis === "neutral") return "ok";
  if (axis === "varus") {
    if (months == null) return distanceCm != null && distanceCm > 5 ? "warn" : "unknown";
    if (months < 24) return distanceCm != null && distanceCm > 5 ? "warn" : "ok";
    if (months < 36) return "warn";
    return distanceCm != null && distanceCm > 5 ? "bad" : "warn";
  }
  if (distanceCm != null && distanceCm > 8) return "bad";
  if (distanceCm != null && distanceCm > 7) return "warn";
  if (months != null && months >= 96) return "warn";
  return months == null && distanceCm == null ? "unknown" : "ok";
}

export function lengthDiffStatus(cm: number | null): OrthoStatus {
  if (cm == null) return "unknown";
  if (cm < 1) return "ok";
  return cm < 2 ? "warn" : "bad";
}

// ── Позвоночник ──────────────────────────────────────────────────────────────

/** Ротация туловища по сколиометру (Bunnell): 0–3° / 4–6° / от 7°. */
export function atrStatus(deg: number | null): OrthoStatus {
  if (deg == null) return "unknown";
  if (deg <= 3) return "ok";
  return deg <= 6 ? "warn" : "bad";
}

/** Угол Кобба: меньше 10° — не сколиоз; 10–19° — пограничное; от 20° — отклонение. */
export function cobbStatus(deg: number | null): OrthoStatus {
  if (deg == null) return "unknown";
  if (deg < 10) return "ok";
  return deg < 20 ? "warn" : "bad";
}

/** От 40° — показание к хирургу (подпись «нужен хирург»). */
export const COBB_SURGICAL = 40;

export function kyphosisStatus(deg: number | null): OrthoStatus {
  if (deg == null) return "unknown";
  if (deg >= 10 && deg <= 40) return "ok";
  return deg > 50 ? "bad" : "warn";
}

const CARD_WARN = new Set([3, 5, 6, 7]);

/** Карта осанки: «да» на 1, 2, 4, 8, 9, 10 — к ортопеду; только 3, 5, 6, 7 — пограничное. */
export function postureCardStatus(answeredYes: ReadonlyArray<number> | null): OrthoStatus {
  if (answeredYes == null) return "unknown";
  if (answeredYes.length === 0) return "ok";
  return answeredYes.every((item) => CARD_WARN.has(item)) ? "warn" : "bad";
}

export function postureTypeStatus(type: string | null): OrthoStatus {
  if (!type) return "unknown";
  return type === "normal" ? "ok" : "warn";
}

// ── Прочее ───────────────────────────────────────────────────────────────────

/** Бейтон: порог 6 из 9 до 12 лет, 5 — с 12 лет (возраст — врачу подтвердить). */
export function beightonStatus(score: number | null, months: number | null): OrthoStatus {
  if (score == null) return "unknown";
  const limit = months != null && months >= 144 ? 5 : 6;
  return score >= limit ? "warn" : "ok";
}

export function chestStatus(shape: string | null): OrthoStatus {
  if (!shape) return "unknown";
  return shape === "normal" ? "ok" : "warn";
}

/** Возраст словами: до 2 мес. — неделями («4 нед.»), дальше как в «Зрении». */
export function ageText(months: number | null): string {
  if (months == null) return "";
  if (months < 2) return `${Math.max(0, Math.round(months * 4.345))} нед.`;
  return ageLabel(Math.floor(months));
}
