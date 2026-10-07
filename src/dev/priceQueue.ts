/**
 * «Пакет правок»: цены и ограничения нескольких тарифов копятся и уходят
 * одним нажатием. Бэкенд (Channex) склеивает правки, пришедшие в окно
 * debounce, в один запрос, поэтому правки разных тарифов нужно записать
 * одновременно, а не по очереди с паузами между кликами. Без React —
 * проверяется тестами (priceQueue.test.ts).
 */
import { setDailyRatesBatch, type HotelDailyRateChange } from "../api/hotel";

export interface QueuedEdit {
  ratePlanId: number;
  ratePlanName: string;
  changes: HotelDailyRateChange[];
  /** Ночей, которые изменятся (для подписи в панели пакета). */
  nights: number;
}

/** Правки одного тарифа склеиваются в один вызов, порядок правок сохраняется. */
export function groupByPlan(queue: QueuedEdit[]): Map<number, HotelDailyRateChange[]> {
  const byPlan = new Map<number, HotelDailyRateChange[]>();
  for (const edit of queue) {
    byPlan.set(edit.ratePlanId, [...(byPlan.get(edit.ratePlanId) ?? []), ...edit.changes]);
  }
  return byPlan;
}

/** Все тарифы уходят одновременно; один отказ не отменяет записанное по другим тарифам. */
export async function sendQueue(
  queue: QueuedEdit[],
  send: typeof setDailyRatesBatch = setDailyRatesBatch,
): Promise<{ saved: number; failed: { ratePlanId: number; error: unknown }[] }> {
  const groups = [...groupByPlan(queue).entries()];
  const results = await Promise.allSettled(groups.map(([ratePlanId, changes]) => send(ratePlanId, { changes })));
  const failed: { ratePlanId: number; error: unknown }[] = [];
  let saved = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") saved += result.value.nights;
    else failed.push({ ratePlanId: groups[index][0], error: result.reason });
  });
  return { saved, failed };
}
