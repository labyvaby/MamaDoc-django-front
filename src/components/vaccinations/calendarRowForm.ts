import type { CalendarSex, CalendarTemplateRow } from "../../api/vaccinations";

/**
 * Возраст в окне строки календаря: «лет + мес.» или точно в днях
 * (для доз вроде «4,5 месяца» = 135 дней). Поля — строки ввода.
 */
export type AgeValue =
  | { mode: "ym"; years: string; months: string }
  | { mode: "days"; days: string };

export const EMPTY_AGE: AgeValue = { mode: "ym", years: "", months: "" };

export function toNumber(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Месяцы → «лет + мес.» для полей ввода. */
function monthsToAge(total: number): AgeValue {
  const years = Math.floor(total / 12);
  const months = total % 12;
  return { mode: "ym", years: years ? String(years) : "", months: months || !years ? String(months) : "" };
}

/** Возраст строки → поле. Дни — если на бэке задан точный возраст в днях. */
export function ageFromRow(row: Pick<CalendarTemplateRow, "ageMonths" | "ageDays"> | null): AgeValue {
  if (!row) return EMPTY_AGE;
  if (row.ageDays != null) return { mode: "days", days: String(row.ageDays) };
  return monthsToAge(row.ageMonths);
}

/** Сколько всего месяцев в «лет + мес.»; null — ничего не введено или ошибка. */
function totalMonths(age: Extract<AgeValue, { mode: "ym" }>): number | null {
  if (age.years.trim() === "" && age.months.trim() === "") return null;
  const y = age.years.trim() === "" ? 0 : toNumber(age.years);
  const m = age.months.trim() === "" ? 0 : toNumber(age.months);
  if (y == null || m == null) return null;
  return y * 12 + m;
}

/** Поле возраста → поля API: дни идут в ageDays, «лет + мес.» — в ageMonths. */
export function ageToPayload(age: AgeValue): { ageMonths: number; ageDays: number | null } | null {
  if (age.mode === "days") {
    const d = toNumber(age.days);
    return d == null ? null : { ageMonths: Math.floor(d / 30.4375), ageDays: d };
  }
  const m = totalMonths(age);
  return m == null ? null : { ageMonths: m, ageDays: null };
}

/** «Не назначать старше»: пусто — без ограничения. */
export function maxAgeFromRow(row: Pick<CalendarTemplateRow, "maxAgeMonths"> | null): AgeValue {
  return row?.maxAgeMonths == null ? EMPTY_AGE : monthsToAge(row.maxAgeMonths);
}

export function maxAgeToPayload(age: AgeValue): number | null {
  return age.mode === "ym" ? totalMonths(age) : null;
}

/** Месяцы человеческим языком: «2 мес.», «1 год 6 мес.», «11 лет». */
export function formatMonths(total: number, short = true): string {
  const y = Math.floor(total / 12);
  const m = total % 12;
  const yText = y ? `${y} ${plural(y, "год", "года", "лет")}` : "";
  const mText = m || !y ? (short ? `${m} мес.` : `${m} ${plural(m, "месяц", "месяца", "месяцев")}`) : "";
  return [yText, mText].filter(Boolean).join(" ");
}

/** Дни: «135 дн.» / «135 дней». */
export function formatDays(days: number, short = true): string {
  return short ? `${days} дн.` : `${days} ${plural(days, "день", "дня", "дней")}`;
}

/** Возраст строки календаря для таблицы: «При рождении», «105 дн.», «11 лет 6 мес.». */
export function formatRowAge(row: Pick<CalendarTemplateRow, "ageMonths" | "ageDays">): string {
  if (row.ageDays != null) return row.ageDays === 0 ? "При рождении" : formatDays(row.ageDays);
  return row.ageMonths === 0 ? "При рождении" : formatMonths(row.ageMonths);
}

/** Возраст из поля — полным текстом, null если не введён. */
export function ageText(age: AgeValue): string | null {
  if (age.mode === "days") {
    const d = toNumber(age.days);
    return d == null ? null : formatDays(d, false);
  }
  const m = totalMonths(age);
  return m == null ? null : formatMonths(m, false);
}

function isBirth(age: AgeValue): boolean {
  const p = ageToPayload(age);
  return p != null && (p.ageDays ?? p.ageMonths) === 0;
}

/** Подпись возрастной группы по умолчанию: «При рождении», «3 месяца». */
export function defaultGroupLabel(age: AgeValue): string {
  return isBirth(age) ? "При рождении" : (ageText(age) ?? "");
}

/**
 * Конец окна «в срок» тем же языком, что и начало: 2 мес. + 30 дней →
 * «3 месяцев»; 11 лет 6 мес. + 365 дней → «12 лет 6 месяцев». Окно, не кратное
 * месяцу, показывается днями: «до 2 месяцев + 10 дней».
 */
function windowEndText(age: AgeValue, windowDays: number): string | null {
  const p = ageToPayload(age);
  if (p == null) return null;
  if (age.mode === "days" || (windowDays % 30 !== 0 && windowDays % 365 !== 0)) {
    if (isBirth(age)) return `${windowDays} ${plural(windowDays, "дня", "дней", "дней")} жизни`;
    return `${ageText(age)} + ${windowDays} ${plural(windowDays, "день", "дня", "дней")}`;
  }
  const add = windowDays % 365 === 0 ? (windowDays / 365) * 12 : windowDays / 30;
  return formatMonthsGenitive(p.ageMonths + add);
}

/** «3 месяцев», «1 года 6 месяцев», «12 лет» — после предлога «до». */
function formatMonthsGenitive(total: number): string {
  const y = Math.floor(total / 12);
  const m = total % 12;
  const yText = y ? `${y} ${plural(y, "года", "лет", "лет")}` : "";
  const mText = m ? `${m} ${plural(m, "месяца", "месяцев", "месяцев")}` : "";
  return [yText, mText].filter(Boolean).join(" ");
}

const SEX_TEXT: Record<CalendarSex, string> = {
  any: "Всем детям.",
  female: "Только девочкам.",
  male: "Только мальчикам.",
};

/**
 * Сводка строки простыми словами — как она сработает в календаре ребёнка.
 */
export function rowSummary(opts: {
  vaccineName: string | null;
  doseNumber: string;
  age: AgeValue;
  windowDays: string;
  maxAge: AgeValue;
  sex: CalendarSex;
}): string[] {
  const lines: string[] = [];
  const dose = toNumber(opts.doseNumber);
  const start = isBirth(opts.age) ? "при рождении" : ageText(opts.age) ? `в ${ageText(opts.age)}` : null;
  if (opts.vaccineName && dose != null && start) {
    lines.push(`${opts.vaccineName}, ${dose}-я доза — ${start}.`);
  }
  const window = toNumber(opts.windowDays);
  if (window != null && start) {
    const end = windowEndText(opts.age, window);
    const from = isBirth(opts.age) ? "с рождения" : `с ${ageText(opts.age)}`;
    lines.push(`В срок — ${from} до ${end}; позже — просрочена.`);
  }
  const max = ageText(opts.maxAge);
  if (max) lines.push(`Старше ${max} не назначается.`);
  lines.push(SEX_TEXT[opts.sex]);
  return lines;
}
