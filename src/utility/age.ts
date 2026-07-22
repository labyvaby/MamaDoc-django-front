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
