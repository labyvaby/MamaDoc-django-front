import { PHONE_COUNTRIES, getPhoneExactLength, type PhoneCountryInfo } from "../../../utility/phone";
import { BOOKING_PRIMARY, BORDER } from "../theme";

/**
 * Оформление полей ввода на витрине: рамка светлеет в фокусе, шрифт наследуется
 * от страницы. Общее для гостевой записи и входа в кабинет — формы стоят рядом
 * и должны выглядеть одинаково.
 */

export const FIELD_SX = {
  width: "100%",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px",
  p: 1.5,
  transition: "border-color .2s",
  "&:focus-within": { borderColor: BOOKING_PRIMARY },
} as const;

export const INPUT_SX = {
  width: "100%",
  border: 0,
  outline: "none",
  fontFamily: "inherit",
  fontSize: 16,
  color: "text.primary",
  bgcolor: "transparent",
  "&::placeholder": { color: "#D0D5DD" },
} as const;

/** Страна по умолчанию — Кыргызстан, основной рынок клиники. */
export function defaultPhoneCountry(): PhoneCountryInfo {
  return PHONE_COUNTRIES.find((c) => c.dialCode === "+996") ?? PHONE_COUNTRIES[0];
}

/** Текст ошибки под полем телефона: точная длина, если она известна для страны. */
export function phoneErrorText(
  dialCode: string,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const exact = getPhoneExactLength(dialCode);
  return exact != null ? t("phoneDigitsRequired", { count: exact }) : t("phoneRequired");
}
