import dayjs from "dayjs";

/**
 * Русский язык абзаца «Анамнез жизни» (ТЗ §3.7): род по полу ребёнка,
 * порядковые, множественное число, месяцы, возраст. Только строки, без React.
 */

export type ChildSex = "male" | "female" | "";

/** 1 год, 2 года, 5 лет. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «2-й» — от 2-й беременности, на 1-й минуте. */
export const ordinalFem = (n: number): string => `${n}-й`;

/** «2-х» — 2-х родов, до 7-х суток. */
export const ordinalGenPlural = (n: number): string => `${n}-х`;

/** «на N-е сутки», но «-и», если число кончается на 3 и это не 13: 1-е, 3-и, 13-е, 23-и. */
export function ordinalDays(n: number): string {
  return n % 10 === 3 && n % 100 !== 13 ? `${n}-и` : `${n}-е`;
}

/** До десятых через запятую, без «,0»: 50 → «50», 50,25 → «50,3». */
export function decimal(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace(".", ",");
}

/** Ровно две цифры после запятой: 3/7 → «0,43». */
export const hundredths = (value: number): string => value.toFixed(2).replace(".", ",");

/** Девочка / Мальчик / Ребёнок. */
export function childNoun(sex: ChildSex): string {
  if (sex === "female") return "Девочка";
  if (sex === "male") return "Мальчик";
  return "Ребёнок";
}

/** Род по полу: пол не указан — мужской. */
export const byGender = (sex: ChildSex, masculine: string, feminine: string): string =>
  sex === "female" ? feminine : masculine;

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Первая буква строчная, но аббревиатуры («ОРВИ», «ИБС») не трогаем. */
export function lowerFirst(text: string): string {
  if (text.length < 2) return text.toLowerCase();
  const second = text.charAt(1);
  if (second !== second.toLowerCase()) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** «а, б и в». */
export function joinAnd(items: ReadonlyArray<string>, last = " и "): string {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")}${last}${list[list.length - 1]}`;
}

/** Точка в конце, если её нет. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** «39 нед», «39 нед 2 дн». */
export function gestationText(weeks: number | null, days: number | null): string {
  if (weeks == null) return "";
  return days ? `${weeks} нед ${days} дн` : `${weeks} нед`;
}

const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/** «декабрь 2025». */
export function monthYear(date: string): string {
  const value = dayjs(date);
  return `${MONTHS[value.month()]} ${value.year()}`;
}

/** «26.06.2025»; пусто — пусто. */
export function dateText(date: string | null | undefined): string {
  return date ? dayjs(date).format("DD.MM.YYYY") : "";
}

/** «12.2025» — для коротких меток. */
export function monthDot(date: string): string {
  return dayjs(date).format("MM.YYYY");
}

export interface AgeParts {
  years: number;
  months: number;
  days: number;
  /** Полных месяцев всего. */
  totalMonths: number;
  /** Дней всего. */
  totalDays: number;
}

/** Полный возраст на дату; дата раньше рождения — null. */
export function ageParts(birthDate: string | null | undefined, on: string | null | undefined): AgeParts | null {
  if (!birthDate || !on) return null;
  const birth = dayjs(birthDate).startOf("day");
  const at = dayjs(on).startOf("day");
  const totalDays = at.diff(birth, "day");
  if (totalDays < 0) return null;
  const totalMonths = at.diff(birth, "month");
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: at.diff(birth.add(totalMonths, "month"), "day"),
    totalMonths,
    totalDays,
  };
}

/** Полных лет на дату. */
export function fullYears(birthDate: string | null | undefined, on: string | null | undefined): number | null {
  const age = ageParts(birthDate, on);
  return age ? age.years : null;
}

/** «1 год 6 мес», «6 мес», «2 года», «12 дн» — именительный и винительный («в 1 год», «(4 года)»). */
export function ageNominative(age: AgeParts): string {
  if (age.totalMonths === 0) return `${age.totalDays} дн`;
  const years = age.years ? `${age.years} ${plural(age.years, "год", "года", "лет")}` : "";
  const months = age.months ? `${age.months} мес` : "";
  return [years, months].filter(Boolean).join(" ");
}

/** «1 года 2 мес», «2 лет», «6 мес» — родительный («с 1 года», «до 1 года 2 мес»). */
export function ageGenitive(age: AgeParts): string {
  if (age.totalMonths === 0) return `${age.totalDays} дн`;
  const years = age.years ? `${age.years} ${age.years % 10 === 1 && age.years % 100 !== 11 ? "года" : "лет"}` : "";
  const months = age.months ? `${age.months} мес` : "";
  return [years, months].filter(Boolean).join(" ");
}

/** «3 раза». */
export const timesText = (n: number): string => `${n} ${plural(n, "раз", "раза", "раз")}`;
