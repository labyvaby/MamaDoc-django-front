/** «1 234» — число с пробелом-разделителем разрядов. */
export function formatCount(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** «3 600 сом» из строки-decimal бэка; копейки — только если они есть. */
export function formatMoney(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })} сом`;
}
