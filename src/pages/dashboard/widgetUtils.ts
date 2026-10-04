/** Деньги приходят строками-decimal: складывать их как строки нельзя. */
export const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/**
 * Сравнение считаем только когда база загрузилась. Пока предыдущий период
 * едет, чип не рисуем: мигнувшая и сменившаяся дельта хуже её отсутствия.
 */
export const delta = (
  current: number,
  previous: number | undefined,
  baselineLabel: string,
  invert = false,
) => (previous === undefined ? undefined : { current, previous, invert, baselineLabel });

/** Сумма, не вошедшая в показанные строки, и её доля от знаменателя. */
export function othersOf(
  total: string | undefined,
  shown: { amount: string }[],
): { amount: number; share: number } | null {
  if (total == null) return null;
  const all = Number(total);
  const rest = all - shown.reduce((acc, r) => acc + Number(r.amount), 0);
  return all > 0 && rest > 0.005 ? { amount: rest, share: (rest / all) * 100 } : null;
}
