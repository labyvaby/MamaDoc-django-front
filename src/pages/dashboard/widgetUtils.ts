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
