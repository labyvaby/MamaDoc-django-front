import { compactSum } from "../realty-finance/format";

export { compactSum };

/** «+14%» / «−5%» / «0%» — знак всегда, минус типографский. */
export function signed(value: number, suffix = ""): string {
  const abs = Math.abs(value).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${abs}${suffix}`;
}

/** Доля от максимума ряда, % — для горизонтальных полос. */
export const shareOf = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0);
