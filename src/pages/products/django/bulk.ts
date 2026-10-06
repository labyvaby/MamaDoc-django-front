/**
 * Массовые действия над товарами: чистая логика без React.
 *
 * Своего bulk-эндпоинта у товаров нет — каждая позиция идёт отдельным
 * PATCH/DELETE v1 с ограниченным параллелизмом. Так каждая правка проходит
 * те же проверки, что и форма (история цен, зеркала категории), а сбой одной
 * позиции не откатывает остальные — их список возвращается вызывающему.
 */

export type BulkFailure = { id: number; message: string };
export type BulkResult = { done: number[]; failed: BulkFailure[] };

const BULK_CONCURRENCY = 4;

export async function runBulk(
  ids: readonly number[],
  action: (id: number) => Promise<unknown>,
  opts: { concurrency?: number; onProgress?: (finished: number) => void } = {},
): Promise<BulkResult> {
  const done: number[] = [];
  const failed: BulkFailure[] = [];
  let cursor = 0;
  let finished = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor];
      cursor += 1;
      try {
        await action(id);
        done.push(id);
      } catch (e) {
        failed.push({ id, message: e instanceof Error && e.message ? e.message : "Ошибка" });
      }
      finished += 1;
      opts.onProgress?.(finished);
    }
  };
  const size = Math.max(1, Math.min(opts.concurrency ?? BULK_CONCURRENCY, ids.length));
  await Promise.all(Array.from({ length: size }, worker));
  // Порядок результата — как во входном списке, а не как завершились запросы.
  const order = new Map(ids.map((id, i) => [id, i]));
  done.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  failed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { done, failed };
}

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

/**
 * Выбор с Shift: всё между якорем и текущей строкой в порядке видимого списка
 * получает состояние текущей строки. Без якоря (или якорь отфильтрован) —
 * обычное переключение одной строки.
 */
export function toggleSelection(
  selected: ReadonlySet<number>,
  visibleIds: readonly number[],
  id: number,
  anchorId: number | null,
  shift: boolean,
): Set<number> {
  const next = new Set(selected);
  const select = !selected.has(id);
  const from = anchorId == null ? -1 : visibleIds.indexOf(anchorId);
  const to = visibleIds.indexOf(id);
  if (!shift || from < 0 || to < 0) {
    if (select) next.add(id);
    else next.delete(id);
    return next;
  }
  const [lo, hi] = from < to ? [from, to] : [to, from];
  for (const rowId of visibleIds.slice(lo, hi + 1)) {
    if (select) next.add(rowId);
    else next.delete(rowId);
  }
  return next;
}

/** Короткая сводка ошибок для уведомления: первые три позиции по имени. */
export function describeFailures(
  failed: readonly BulkFailure[],
  nameOf: (id: number) => string,
): string {
  const head = failed
    .slice(0, 3)
    .map((f) => `«${nameOf(f.id)}»: ${f.message}`)
    .join("; ");
  return failed.length > 3 ? `${head} и ещё ${failed.length - 3}` : head;
}
