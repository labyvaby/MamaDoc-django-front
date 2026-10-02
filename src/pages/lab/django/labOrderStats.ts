/**
 * Счётчики для плиток над лентой заказов.
 *
 * Отдельный модуль, а не расчёт внутри страницы, потому что рендер-тестов в
 * проекте нет — только так эти цифры вообще можно проверить. Тот же приём
 * применён в `src/pages/appointments/components/registry/registryStats.ts`.
 */

import type { LabOrder } from "../../../api/lab";

export interface LabOrderStats {
  total: number;
  pending: number;
  amount: number;
}

/** Сумма округляется до копеек: иначе плитка показала бы хвост float. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function labOrderStats(orders: LabOrder[]): LabOrderStats {
  const raw = orders.reduce<LabOrderStats>(
    (acc, item) => ({
      total: acc.total + 1,
      pending: acc.pending + (item.isDispatched ? 0 : 1),
      amount: acc.amount + item.totalAmount,
    }),
    { total: 0, pending: 0, amount: 0 },
  );
  return { ...raw, amount: round2(raw.amount) };
}

/**
 * Заказы, которые лента показывает под выбранной плиткой.
 *
 * «Не отправлены» проверяется тем же флагом `isDispatched`, что и
 * `labOrderStats` — иначе счётчик на плитке и список под ней могли бы
 * разойтись, если бы кто-то однажды сузил фильтр по сырой строке `status`.
 */
export function filterLabOrders(
  orders: LabOrder[],
  filter: "all" | "pending",
): LabOrder[] {
  if (filter === "all") return orders;
  return orders.filter((item) => !item.isDispatched);
}
