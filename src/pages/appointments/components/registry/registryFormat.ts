/**
 * Числа журнала. `formatKGS` («1 200 сом») остаётся форматом деталей и итогов,
 * но в плотных местах — колонка суммы в ленте, подписи столбиков, значения
 * плиток — валюта повторяется в каждой строке и только шумит: там печатаем
 * само число, а «сом» выносим в подпись колонки или плитки.
 */
const AMOUNT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** «48 200». Дробную часть чек не несёт — округляем. */
export const formatAmount = (value: number): string => AMOUNT.format(Math.round(value));

/** «1 600 сом» — деньги журнала подписываем по-русски (formatKGS даёт «KGS»). */
export const formatSom = (value: number): string => `${formatAmount(value)} сом`;

/** «48,2 тыс» — для узких плиток, где полное число не помещается. */
export const formatCompactAmount = (value: number): string => {
  const abs = Math.abs(value);
  if (abs < 100_000) return AMOUNT.format(Math.round(value));
  if (abs < 1_000_000) return `${(value / 1000).toFixed(0)} тыс`;
  return `${(value / 1_000_000).toFixed(1).replace(".", ",")} млн`;
};
