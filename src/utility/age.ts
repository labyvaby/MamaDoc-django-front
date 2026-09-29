import dayjs from "dayjs";

/** Русское склонение числительного: [1, 2-4, 5+] — «год/года/лет». */
function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

const YEAR_FORMS: [string, string, string] = ["год", "года", "лет"];
const MONTH_FORMS: [string, string, string] = ["месяц", "месяца", "месяцев"];
const WEEK_FORMS: [string, string, string] = ["неделя", "недели", "недель"];
const DAY_FORMS: [string, string, string] = ["день", "дня", "дней"];

/**
 * Возраст ребёнка по дате рождения, для детской клиники:
 * - до месяца: «N дней»
 * - до года: «N недель (M месяцев)» (месяцы в скобках, если есть хотя бы 1)
 * - от года: «N лет M месяцев» (месяцы — остаток сверх полных лет, если есть)
 *
 * Возвращает пустую строку, если дата не задана/некорректна/в будущем.
 */
export function formatPatientAge(birthDate: string | null | undefined): string {
  if (!birthDate) return "";
  const b = dayjs(birthDate);
  if (!b.isValid()) return "";
  const now = dayjs();
  if (b.isAfter(now)) return "";

  const years = now.diff(b, "year");

  if (years >= 1) {
    const months = now.diff(b.add(years, "year"), "month");
    const yearStr = `${years} ${plural(years, YEAR_FORMS)}`;
    return months >= 1 ? `${yearStr} ${months} ${plural(months, MONTH_FORMS)}` : yearStr;
  }

  const weeks = now.diff(b, "week");
  if (weeks < 1) {
    const days = now.diff(b, "day");
    return `${days} ${plural(days, DAY_FORMS)}`;
  }

  const months = now.diff(b, "month");
  const weekStr = `${weeks} ${plural(weeks, WEEK_FORMS)}`;
  return months >= 1 ? `${weekStr} (${months} ${plural(months, MONTH_FORMS)})` : weekStr;
}

/**
 * Возраст взрослого — только полные годы («30 лет»), как в карточке пациента.
 * До года — детская запись из `formatPatientAge` («3 недели»).
 */
export function formatAgeYears(birthDate: string | null | undefined): string {
  if (!birthDate) return "";
  const b = dayjs(birthDate);
  if (!b.isValid() || b.isAfter(dayjs())) return "";
  const years = dayjs().diff(b, "year");
  return years >= 1 ? `${years} ${plural(years, YEAR_FORMS)}` : formatPatientAge(birthDate);
}

/**
 * Сколько дней до ближайшего дня рождения: 0 — сегодня. `null` — даты нет.
 * 29 февраля в невисокосный год dayjs переносит на 1 марта.
 */
export function daysUntilBirthday(birthDate: string | null | undefined, now = dayjs()): number | null {
  if (!birthDate) return null;
  const b = dayjs(birthDate);
  if (!b.isValid()) return null;
  const today = now.startOf("day");
  let next = b.year(today.year()).startOf("day");
  if (next.isBefore(today)) next = b.year(today.year() + 1).startOf("day");
  return next.diff(today, "day");
}

/** «через 3 дня» / «завтра» / «сегодня» — подпись к ближайшему дню рождения. */
export function birthdayCountdownLabel(days: number): string {
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} ${plural(days, DAY_FORMS)}`;
}
