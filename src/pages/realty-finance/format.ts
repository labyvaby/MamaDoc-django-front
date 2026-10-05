import dayjs from "dayjs";
import "dayjs/locale/ru";

import { formatKGS } from "../../utility/format";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** «1,5 млрд», «38,4 млн», иначе полная сумма в сомах. */
export function compactSum(value: number, t: T): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return t("common.billions", { value: (value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) });
  if (abs >= 1_000_000) return t("common.millions", { value: (value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) });
  return formatKGS(value);
}

/** «+5 529 000 сом» / «−5 529 000 сом» по типу операции. */
export const signedSum = (type: string, amount: number) => `${type === "in" ? "+" : "−"}${formatKGS(Math.abs(amount))}`;

/** Сумма со знаком минуса для отрицательных (типографский «−»). */
export const sum = (value: number) => (value < 0 ? `−${formatKGS(-value)}` : formatKGS(value));

export const pct = (value: number | null | undefined, digits = 1) => (value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`);

export const shortDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM") : "—");
export const fullDate = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "—");

/** «октябрь 2026» из «2026-10». */
export const monthTitle = (month: string) => {
  const text = dayjs(`${month}-01`).locale("ru").format("MMMM YYYY");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** «5 000 000», «5,2» → строка-decimal для тела; пусто, ноль и мусор — null. */
export function positiveAmount(value: string): string | null {
  const text = value.replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? String(number) : null;
}

/** То же, но допускает ноль (план строки бюджета можно обнулить). */
export function nonNegativeAmount(value: string): string | null {
  const text = value.replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? String(number) : null;
}

/** Число в поле формы: 1470000000 → «1470000000» (без пробелов — поле правится руками). */
export const amountInput = (value: number) => (value ? String(value) : "");

/**
 * Период акта сверки: с первого дня месяца трёхмесячной давности по сегодня
 * («01.07.2026 – 05.10.2026», как в примере гайда §5). ⚠ Правило выведено из
 * примера — бэк диапазон не фиксировал.
 */
export function reconPeriod(today = dayjs()): string {
  return `${today.subtract(3, "month").startOf("month").format("DD.MM.YYYY")} – ${today.format("DD.MM.YYYY")}`;
}
