/** Массовое перемещение и списание остатков: чистая логика без React. */

export type BulkQuantityMode = "all" | "each";

/**
 * Сколько уйдёт с позиции: весь остаток или по N, но не больше, чем лежит.
 * 0 — позицию пропускаем (нечего двигать или N не задано).
 */
export function bulkQuantity(stock: number, mode: BulkQuantityMode, each: number): number {
  if (!(stock > 0)) return 0;
  if (mode === "all") return stock;
  if (!Number.isFinite(each) || each <= 0) return 0;
  return Math.min(stock, each);
}

/** План массовой операции: что и сколько уйдёт, сколько позиций пропущено. */
export function planBulkQuantities<T extends { productId: number; quantity: number }>(
  items: readonly T[],
  mode: BulkQuantityMode,
  each: number,
): { moves: Map<number, number>; skipped: number; total: number } {
  const moves = new Map<number, number>();
  let total = 0;
  for (const item of items) {
    const qty = bulkQuantity(item.quantity, mode, each);
    if (qty > 0) {
      moves.set(item.productId, qty);
      total += qty;
    }
  }
  return { moves, skipped: items.length - moves.size, total };
}
