/**
 * Телефонные номера: справочник стран, разбор, нормализация и форматирование.
 *
 * Один модуль на весь продукт — и на формы CRM (пациенты, сотрудники), и на
 * публичную витрину записи. Раньше их было два: здесь поддерживались только
 * `+996` и `+7`, а витрине нужны иностранные номера, и она завела свой
 * справочник. Логика trunk-префиксов и длин от этого дублировалась.
 */

/**
 * Страна: ISO-код, код набора, название и длина национального номера
 * (null — длина не фиксирована, проверяем только разумный диапазон).
 *
 * Сверху страны, откуда пациенты приезжают чаще всего; дальше — остальные
 * направления. Список дополняется одной строкой.
 */
export interface PhoneCountryInfo {
  code: string;
  dialCode: string;
  name: string;
  digits: number | null;
}

const TABLE: ReadonlyArray<readonly [string, string, string, number | null]> = [
  ["KG", "+996", "Кыргызстан", 9],
  ["RU", "+7", "Россия", 10],
  ["KZ", "+7", "Казахстан", 10],
  ["UZ", "+998", "Узбекистан", 9],
  ["TJ", "+992", "Таджикистан", 9],
  ["TM", "+993", "Туркменистан", 8],
  ["AZ", "+994", "Азербайджан", 9],
  ["AM", "+374", "Армения", 8],
  ["GE", "+995", "Грузия", 9],
  ["BY", "+375", "Беларусь", 9],
  ["UA", "+380", "Украина", 9],
  ["MD", "+373", "Молдова", 8],
  ["TR", "+90", "Турция", 10],
  ["CN", "+86", "Китай", 11],
  ["IN", "+91", "Индия", 10],
  ["PK", "+92", "Пакистан", 10],
  ["AF", "+93", "Афганистан", 9],
  ["IR", "+98", "Иран", 10],
  ["MN", "+976", "Монголия", 8],
  ["KR", "+82", "Южная Корея", null],
  ["JP", "+81", "Япония", null],
  ["AE", "+971", "ОАЭ", 9],
  ["SA", "+966", "Саудовская Аравия", 9],
  ["QA", "+974", "Катар", 8],
  ["KW", "+965", "Кувейт", 8],
  ["IL", "+972", "Израиль", 9],
  ["EG", "+20", "Египет", 10],
  ["DE", "+49", "Германия", null],
  ["PL", "+48", "Польша", 9],
  ["CZ", "+420", "Чехия", 9],
  ["IT", "+39", "Италия", null],
  ["ES", "+34", "Испания", 9],
  ["FR", "+33", "Франция", 9],
  ["GB", "+44", "Великобритания", 10],
  ["NL", "+31", "Нидерланды", 9],
  ["SE", "+46", "Швеция", null],
  ["FI", "+358", "Финляндия", null],
  ["LT", "+370", "Литва", 8],
  ["LV", "+371", "Латвия", 8],
  ["EE", "+372", "Эстония", null],
  ["US", "+1", "США", 10],
  ["CA", "+1", "Канада", 10],
  ["TH", "+66", "Таиланд", 9],
  ["VN", "+84", "Вьетнам", 9],
  ["MY", "+60", "Малайзия", null],
  ["ID", "+62", "Индонезия", null],
  ["AU", "+61", "Австралия", 9],
];

/** Все страны справочника. */
export const PHONE_COUNTRIES: PhoneCountryInfo[] = TABLE.map(([code, dialCode, name, digits]) => ({
  code,
  dialCode,
  name,
  digits,
}));

/** Сколько стран показывать сразу; остальные — за пунктом «Другие страны». */
export const PRIMARY_PHONE_COUNTRY_COUNT = 3;

/**
 * Код набора. Раньше здесь был закрытый союз `"+996" | "+7"`; теперь это любой
 * код из справочника, но два прежних значения остаются валидными, поэтому
 * существующие формы продолжают работать без правок.
 */
export type PhoneCountryCode = string;

export const PHONE_COUNTRY_CODES = PHONE_COUNTRIES.map((c) => c.dialCode);

export const DEFAULT_PHONE_COUNTRY_CODE: PhoneCountryCode = "+996";

/** Допустимое общее количество цифр международного номера по E.164. */
const E164_TOTAL_RANGE = { min: 8, max: 15 };

export interface ParsedPhone {
  countryCode: PhoneCountryCode;
  local: string;
}

/**
 * Страна по коду набора. У «+7» два владельца (Россия и Казахстан) — берём
 * первого: для длины номера и формата они не различаются.
 */
export function findPhoneCountry(dialCode: string): PhoneCountryInfo | undefined {
  return PHONE_COUNTRIES.find((c) => c.dialCode === dialCode);
}

/**
 * Максимальная длина локальной части номера для кода страны.
 * Для незнакомого кода — верхняя граница E.164, чтобы не мешать вводу.
 */
export function getPhoneLocalMaxLength(countryCode: PhoneCountryCode): number {
  const exact = findPhoneCountry(countryCode)?.digits;
  if (exact != null) return exact;
  const countryDigits = countryCode.replace(/\D/g, "").length;
  return Math.max(1, E164_TOTAL_RANGE.max - countryDigits);
}

/** Минимальная длина локальной части, согласованная с E.164-валидацией API. */
export function getPhoneLocalMinLength(countryCode: PhoneCountryCode): number {
  const exact = findPhoneCountry(countryCode)?.digits;
  if (exact != null) return exact;
  const countryDigits = countryCode.replace(/\D/g, "").length;
  return Math.max(1, E164_TOTAL_RANGE.min - countryDigits);
}

/** Точная длина номера страны; null — длина не фиксирована. */
export function getPhoneExactLength(countryCode: PhoneCountryCode): number | null {
  return findPhoneCountry(countryCode)?.digits ?? null;
}

/**
 * Нормализует локальную часть номера под выбранный код страны:
 * убирает нецифровые символы, отбрасывает национальный trunk-префикс
 * (который добавляет автозаполнение формата tel-national или ручной ввод)
 * и обрезает до максимальной длины.
 *
 * Примеры:
 *  +996 «0709789228» → «709789228» (ведущий 0 — trunk-префикс, не часть локальной)
 *  +7   «8 900 123 45 67» → «9001234567» (8 — российский trunk-префикс)
 */
export function normalizePhoneLocal(countryCode: PhoneCountryCode, raw: string): string {
  let digits = String(raw ?? "").replace(/[^0-9]/g, "");

  // Вставили номер вместе со своим кодом страны («996700123456», «+996 700…»)
  // — код здесь лишний, иначе он попал бы в локальную часть и номер уехал бы
  // как «+996996700123456».
  const bare = countryCode.replace("+", "");
  const exact = getPhoneExactLength(countryCode);
  if (bare && digits.startsWith(bare) && (exact == null || digits.length > exact)) {
    digits = digits.slice(bare.length);
  }

  if (countryCode === "+996") {
    digits = digits.replace(/^0+/, ""); // локальная часть KG не начинается с нуля
  } else if (countryCode === "+7") {
    if (digits.startsWith("8")) digits = digits.slice(1); // 8 — trunk-префикс РФ
  }

  return digits.slice(0, getPhoneLocalMaxLength(countryCode));
}

/**
 * Разбор вставленного номера: если в нём есть код страны — узнаём страну и
 * отделяем её код, иначе трактуем как локальную часть текущей страны.
 *
 * Нужно для вставки из буфера: люди копируют номер в любом виде — «+996 700…»,
 * «996700123456», «0700123456».
 */
export function parsePastedPhone(currentCode: PhoneCountryCode, raw: string): ParsedPhone {
  const trimmed = String(raw ?? "").trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return { countryCode: currentCode, local: "" };

  const currentBare = currentCode.replace("+", "");
  const currentExact = getPhoneExactLength(currentCode);
  const looksLikeFull =
    trimmed.startsWith("+") ||
    (currentExact != null && digits.length > currentExact) ||
    digits.startsWith(currentBare);

  if (looksLikeFull) {
    const parsed = parsePhone(digits);
    // Разбор удался, только если после кода что-то осталось; иначе это просто
    // местный номер, начинающийся с тех же цифр.
    if (parsed.local) {
      return { countryCode: parsed.countryCode, local: normalizePhoneLocal(parsed.countryCode, parsed.local) };
    }
  }
  return { countryCode: currentCode, local: normalizePhoneLocal(currentCode, digits) };
}

/**
 * Разбирает значение при обычном наборе в локальном поле.
 *
 * Помимо полной вставки распознаёт выбранный код страны, набранный без плюса.
 * Например, при выбранном `+996` ввод `996` очищает локальную часть: код уже
 * показан слева, а последующие цифры набираются как национальный номер.
 *
 * Чужой код без `+` по первым трём цифрам не перехватываем. Кыргызский местный
 * номер вполне может начинаться на `992`–`998`, поэтому раннее переключение
 * страны сделало бы такие номера невозможными. Чужая страна распознаётся по
 * явному `+` либо когда введён полный номер длиннее локального лимита.
 */
export function parsePhoneInput(currentCode: PhoneCountryCode, raw: string): ParsedPhone {
  const trimmed = String(raw ?? "").trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return { countryCode: currentCode, local: "" };

  const typedDial = [...new Set(PHONE_COUNTRY_CODES)]
    .sort((a, b) => b.length - a.length)
    .find((dial) => {
      const bare = dial.slice(1);
      return digits === bare && (trimmed.startsWith("+") || dial === currentCode);
    });

  if (typedDial) return { countryCode: typedDial, local: "" };
  return parsePastedPhone(currentCode, raw);
}

/** Минимум от события вставки — чтобы не тянуть в утилиту типы React. */
export interface PhonePasteEvent {
  preventDefault: () => void;
  clipboardData: { getData: (format: string) => string } | null;
}

/**
 * Обработчик вставки для телефонного поля.
 *
 * `preventDefault` здесь обязателен: у полей стоит `maxLength` под локальную
 * часть, и браузер обрежет «996700123456» до девяти цифр раньше, чем мы успеем
 * отделить код страны. Поэтому вставку перехватываем и раскладываем сами.
 */
export function handlePhonePaste(
  e: PhonePasteEvent,
  currentCode: PhoneCountryCode,
  apply: (countryCode: PhoneCountryCode, local: string) => void,
): void {
  const raw = e.clipboardData?.getData("text") ?? "";
  if (!raw.trim()) return;
  e.preventDefault();
  const parsed = parsePastedPhone(currentCode, raw);
  apply(parsed.countryCode, parsed.local);
}

/** Номер набран полностью для своей страны? */
export function isPhoneLocalComplete(countryCode: PhoneCountryCode, local: string): boolean {
  const digits = String(local ?? "").replace(/[^0-9]/g, "");
  const exact = getPhoneExactLength(countryCode);
  if (exact != null) return digits.length === exact;
  return (
    digits.length >= getPhoneLocalMinLength(countryCode) &&
    digits.length <= getPhoneLocalMaxLength(countryCode)
  );
}

/** Подсказка в поле под нужную длину: «000 000 000», «000 000 00 00». */
export function phonePlaceholder(countryCode: PhoneCountryCode): string {
  const digits = getPhoneExactLength(countryCode);
  if (!digits) return "000 000 000";
  if (digits === 10) return "000 000 00 00";
  return "".padEnd(digits, "0").replace(/(.{3})(?=.)/g, "$1 ");
}

/**
 * Форматирует локальную часть номера для отображения (группировка пробелами):
 *  +996 «709789228» → «709 789 228» (3-3-3)
 *  +7   «9001234567» → «900 123 45 67» (3-3-2-2)
 * Хранимое значение остаётся строкой из цифр — форматирование только для UI.
 */
export function formatPhoneLocalDisplay(countryCode: PhoneCountryCode, local: string): string {
  const d = String(local ?? "")
    .replace(/[^0-9]/g, "")
    .slice(0, getPhoneLocalMaxLength(countryCode));

  const groups =
    getPhoneExactLength(countryCode) === 10
      ? [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)]
      : [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)];

  return groups.filter(Boolean).join(" ");
}

/**
 * Форматирует полный номер для показа в UI: «+996702122762» → «+996 702 122 762».
 * Нераспознанный номер возвращается как есть (лучше сырой, чем пустой).
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const { countryCode, local } = parsePhone(raw);
  const grouped = formatPhoneLocalDisplay(countryCode, local);
  return grouped ? `${countryCode} ${grouped}` : String(raw);
}

/**
 * Парсит полный номер в формате E.164 в структуру `{ countryCode, local }`.
 * Коды проверяем от длинных к коротким, иначе «+996…» распознался бы как «+9».
 */
export function parsePhone(raw: string | null | undefined): ParsedPhone {
  if (!raw) return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, local: "" };

  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, local: "" };

  const byLength = [...new Set(PHONE_COUNTRY_CODES)].sort((a, b) => b.length - a.length);
  for (const dial of byLength) {
    const bare = dial.slice(1); // без «+»
    if (digits.startsWith(bare)) {
      return { countryCode: dial, local: digits.slice(bare.length) };
    }
  }

  // Фоллбек: оставляем все цифры как локальную часть с дефолтным кодом
  return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, local: digits };
}

/**
 * Собирает полный номер телефона в формате E.164 (+кодСтраны + локальная часть)
 * из кода страны и локальной части. Если локальная часть пуста, возвращает null.
 */
export function composePhone(countryCode: PhoneCountryCode, local: string): string | null {
  // Защита: убираем trunk-префикс и на этом шаге, даже если он просочился
  // из внешнего источника, чтобы не собрать номер вида +9960709789228.
  const normalizedLocal = normalizePhoneLocal(countryCode, local);
  if (!normalizedLocal) return null;
  return `${countryCode}${normalizedLocal}`;
}
