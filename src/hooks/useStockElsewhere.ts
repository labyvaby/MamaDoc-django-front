import * as React from "react";
import { getStock } from "../api/warehouse";

/**
 * «Где ещё лежит товар» — склады организации с положительным остатком.
 *
 * Сам остаток филиала фронт больше не считает: `GET /warehouse/products/
 * ?branchId=…` отдаёт `branchStock` — остаток именно того склада, с которого
 * бэк спишет товар в приёме (контракт 03.08.2026). Этот хук нужен только для
 * подсказки «на складе филиала нет, но есть на складе X»: она показывается
 * ровно тогда, когда `branchStock` равен нулю, а значит склад списания в
 * выдачу с `quantity > 0` не попадёт и фильтровать его отдельно не нужно.
 *
 * Подсказка необязательна: при ошибке загрузки просто не показываем её
 * (`ready: false`), чтобы не выдать «нигде нет» вместо «неизвестно».
 */

/** Склад, на котором остаток товара есть. */
export type StockElsewhere = {
  warehouseName: string;
  quantity: number;
};

export type StockElsewhereInfo = {
  loading: boolean;
  /** Данные загружены — до этого подсказки не показываем. */
  ready: boolean;
  /** Склады с остатком, по убыванию количества. */
  elsewhereOf: (productId: number) => StockElsewhere[];
};

const EMPTY: StockElsewhere[] = [];

export function useStockElsewhere(
  enabled: boolean,
  /** Явный орг-контекст для суперпользователя/мультиорг (как в getProducts). */
  organizationId?: number,
): StockElsewhereInfo {
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [byProduct, setByProduct] = React.useState<Map<number, StockElsewhere[]>>(
    new Map(),
  );

  React.useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    // Весь остаток организации одним запросом: на проде это ~50 строк
    // (03.08.2026), пагинации у эндпоинта нет.
    getStock(undefined, ctrl.signal, organizationId)
      .then((stock) => {
        if (ctrl.signal.aborted) return;
        const map = new Map<number, StockElsewhere[]>();
        for (const row of stock) {
          if (row.quantity <= 0) continue;
          const list = map.get(row.productId) ?? [];
          list.push({ warehouseName: row.warehouseName, quantity: row.quantity });
          map.set(row.productId, list);
        }
        for (const list of map.values()) list.sort((a, b) => b.quantity - a.quantity);
        setByProduct(map);
        setReady(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setReady(false);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [enabled, organizationId]);

  const elsewhereOf = React.useCallback(
    (productId: number) => byProduct.get(productId) ?? EMPTY,
    [byProduct],
  );

  return { loading, ready, elsewhereOf };
}
