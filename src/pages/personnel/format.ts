import type { Tone } from "../construction/format";

export { compactSum, isoDate, parseNumber } from "../construction/format";

/** Цвет кадрового статуса (как `statusMeta` макета): уволенный — нейтральный. */
export const employeeTone = (status: string): Tone =>
  status === "active" || status === "working" ? "success" : status === "probation" ? "warning" : status === "vacation" || status === "trip" ? "info" : status === "sick" ? "error" : null;

/** Цвет кадрового события по типу (как `hr.js:34`). */
export const eventTone = (type: string): Tone =>
  type === "hire" ? "success" : type === "fire" ? "error" : type === "raise" || type === "transfer" ? "primary" : type === "vacation" || type === "sick" || type === "trip" ? "info" : type === "bonus" ? "warning" : null;

/** Отметка табеля → цвет ячейки. */
export const markTone = (mark: string | undefined): Tone =>
  mark === "Я" ? "success" : mark === "О" ? "info" : mark === "Б" ? "warning" : mark === "К" ? "primary" : mark === "Н" ? "error" : null;

/** «октябрь 2026» из «2026-10» (именительный падеж — для заголовков). */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const text = new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  // ru-RU даёт родительный («октября 2026») только с днём; без дня — именительный.
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «2026-10» ± n месяцев. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const currentMonth = (today = new Date()) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

/** Тон бэка у вакансии (`gray` / `amber` / `blue` / `green` …) → цвет пилюли. */
export const vacancyTone = (tone: string): Tone =>
  tone === "amber" ? "warning" : tone === "blue" ? "info" : tone === "green" ? "success" : tone === "red" ? "error" : tone === "violet" ? "primary" : null;
