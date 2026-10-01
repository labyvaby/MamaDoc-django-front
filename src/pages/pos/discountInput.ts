/**
 * Ручная скидка на чек в панели оплаты: проценты или сумма в сомах.
 *
 * Значения хранятся строками. Если пересчитывать их через число на каждый
 * символ, точка в конце («12.») пропадает и дробную часть не дописать.
 */

/** Быстрые проценты — те же, что в скидке на позицию (`ReceiptRow`). */
export const QUICK_DISCOUNT_PERCENTS = [5, 10, 15, 20];

/** Оставляет цифры и одну точку, после неё — не более двух знаков. */
export const sanitizeDecimal = (value: string): string => {
  const [whole = "", ...fraction] = value
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "")
    .split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  if (!fraction.length) return integer;
  return `${integer || "0"}.${fraction.join("").slice(0, 2)}`;
};

/** Скидка суммой: пустой ввод — «0»; допустимый размер проверяет сервер. */
export const normalizeManualDiscount = (value: string): string =>
  sanitizeDecimal(value) || "0";

/** Скидка процентом: выше `max` не поднимается (лимит организации, не больше 100). */
export const normalizeManualPercent = (value: string, max = 100): string => {
  const cleaned = sanitizeDecimal(value);
  return Number(cleaned) > max ? String(max) : cleaned || "0";
};

/** Что уходит на сервер: «12.» и «012» превращаются в «12». */
export const decimalForRequest = (value: string): string =>
  String(Number(value) || 0);

/** Лимит ручной скидки процентом из правил кассы; нет числа — только потолок в 100. */
export const maxDiscountPercent = (
  rules: Record<string, boolean | number | string> | undefined
): number => {
  const limit = rules?.max_discount_percent;
  return typeof limit === "number" && limit >= 0 && limit < 100 ? limit : 100;
};
