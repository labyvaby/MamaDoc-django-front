export const PHONE_COUNTRY_CODES = ["+996", "+7"] as const;

export type PhoneCountryCode = (typeof PHONE_COUNTRY_CODES)[number];

export const DEFAULT_PHONE_COUNTRY_CODE: PhoneCountryCode = "+996";

export interface ParsedPhone {
  countryCode: PhoneCountryCode;
  local: string;
}

/**
 * Возвращает максимальную длину локальной части номера 
 * в зависимости от кода страны. (Например, для +7 это 10 цифр)
 */
export function getPhoneLocalMaxLength(countryCode: PhoneCountryCode): number {
  if (countryCode === "+7") return 10;
  return 9; // По умолчанию для +996
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

  if (countryCode === "+996") {
    digits = digits.replace(/^0+/, ""); // локальная часть KG не начинается с нуля
  } else if (countryCode === "+7") {
    if (digits.startsWith("8")) digits = digits.slice(1); // 8 — trunk-префикс РФ
  }

  return digits.slice(0, getPhoneLocalMaxLength(countryCode));
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
    countryCode === "+7"
      ? [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)]
      : [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)];

  return groups.filter(Boolean).join(" ");
}

/**
 * Парсит полный номер телефона в формате E.164 (+кодСтраны + локальная часть)
 * в структуру { countryCode, local }.
 * Поддерживает коды +996 и +7. Для остальных вариантов
 * пытается разумно восстановить локальную часть.
 */
export function parsePhone(raw: string | null | undefined): ParsedPhone {
  if (!raw) {
    return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, local: "" };
  }

  const digits = String(raw).replace(/[^0-9]/g, "");

  if (!digits) {
    return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, local: "" };
  }

  // +996XXXXXXXXX или 996XXXXXXXXX
  if (digits.startsWith("996")) {
    return {
      countryCode: "+996",
      local: digits.slice(3),
    };
  }

  // +7XXXXXXXXXX или 7XXXXXXXXXX
  if (digits.startsWith("7")) {
    return {
      countryCode: "+7",
      local: digits.slice(1),
    };
  }

  // Фоллбек: оставляем все цифры как локальную часть с дефолтным кодом
  return {
    countryCode: DEFAULT_PHONE_COUNTRY_CODE,
    local: digits,
  };
}

/**
 * Собирает полный номер телефона в формате E.164 (+кодСтраны + локальная часть)
 * из кода страны и локальной части (только цифры или с разделителями).
 * Если локальная часть пуста, возвращает null.
 */
export function composePhone(countryCode: PhoneCountryCode, local: string): string | null {
  // Защита: убираем trunk-префикс и на этом шаге, даже если он просочился
  // из внешнего источника, чтобы не собрать номер вида +9960709789228.
  const normalizedLocal = normalizePhoneLocal(countryCode, local);
  if (!normalizedLocal) return null;

  if (countryCode === "+996") {
    return `+996${normalizedLocal}`;
  }

  if (countryCode === "+7") {
    return `+7${normalizedLocal}`;
  }

  // На случай расширения списка кодов в будущем
  return `${countryCode}${normalizedLocal}`;
}
