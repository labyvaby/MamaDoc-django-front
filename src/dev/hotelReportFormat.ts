/** Форматирование сумм и долей в отчётах отеля (отдельно от компонентов — ради fast refresh). */

const CURRENCY_SIGNS: Record<string, string> = { KGS: "сом", USD: "$", EUR: "€", RUB: "₽", KZT: "₸", CNY: "¥", UZS: "сум" };

export const currencySign = (currency: string | null | undefined): string => (currency && CURRENCY_SIGNS[currency]) || currency || "";

/** 1234567.5 → «1 234 568 сом»; в отчётах копейки только мешают. */
export function fmtMoney(value: number | string | null | undefined, currency?: string | null, digits = 0): string {
  const n = Number(value);
  const text = (Number.isFinite(n) ? n : 0).toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const sign = currencySign(currency);
  return sign ? `${text} ${sign}` : text;
}

export const fmtInt = (value: number) => value.toLocaleString("ru-RU");

export const fmtPercent = (value: number | string, digits = 1) =>
  `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;

/** Палитра для разбивок без своего цвета (категории, способы оплаты, расходы). */
export const REPORT_PALETTE = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04", "#475569"];
