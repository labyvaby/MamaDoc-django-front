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
  const normalizedLocal = local.replace(/[^0-9]/g, "");
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
