/** Массовая правка цены товаров: чистая логика без React. */

export type PriceChangeMode = "set" | "percent" | "amount";

/**
 * Новая цена товара по правилу массовой правки. Округляем до целого сома —
 * так цены вводятся и в форме товара; отрицательной цена не бывает.
 * null — правило неприменимо (пустое/неверное значение).
 */
export function computeNewPrice(
  current: number,
  mode: PriceChangeMode,
  value: number,
): number | null {
  if (!Number.isFinite(value)) return null;
  let next: number;
  if (mode === "set") {
    if (value < 0) return null;
    next = value;
  } else if (mode === "percent") {
    next = current * (1 + value / 100);
  } else {
    next = current + value;
  }
  return Math.max(0, Math.round(next));
}
