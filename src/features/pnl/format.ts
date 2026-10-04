/** Форматирование сумм ОПиУ: целые сомы, «16,5 млн», доли. Минус — типографский «−». */
const INT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

const sign = (value: number): string => (value < 0 ? "−" : "");

export function formatSom(value: number): string {
  const rounded = Math.round(value);
  return `${sign(rounded)}${INT.format(Math.abs(rounded))}`;
}

export function compactSom(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign(value)}${millions.toFixed(millions >= 10 ? 1 : 2).replace(".", ",")} млн`;
  }
  if (abs >= 1_000) return `${sign(value)}${Math.round(abs / 1_000)} тыс`;
  return `${sign(value)}${Math.round(abs)}`;
}

export function formatShare(pct: number): string {
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}
