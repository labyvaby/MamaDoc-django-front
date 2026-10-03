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

/**
 * Ровные деления оси от нуля: шаг 1 / 2 / 2,5 / 5 × 10ⁿ, не больше count
 * интервалов. Recharts сам делил 2 500 на «0, 650, 1300, 1950, 2600».
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw - 1e-9) ?? 10 * pow;
  const top = Math.ceil(max / step - 1e-9) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

/** Подпись деления оси денег: 1 500 → «1,5 тыс.», 2 000 000 → «2 млн». Раньше 1 500 округлялось до «2k». */
export function axisMoney(v: number): string {
  const abs = Math.abs(v);
  const short = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${short(v / 1_000_000)} млн`;
  if (abs >= 1000) return `${short(v / 1000)} тыс.`;
  return short(v);
}
