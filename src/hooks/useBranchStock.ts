import * as React from "react";
import { getStock, getWarehouses } from "../api/warehouse";

/**
 * Остаток товара в разрезе складов конкретного филиала.
 *
 * Зачем: `GET /warehouse/products/` отдаёт `stock` **агрегатом по всей
 * организации** (параметр `branchId` эндпоинт игнорирует — проверено на проде
 * 03.08.2026), а при сохранении приёма бэк проверяет остаток на складе филиала
 * приёма и блокирует 400 «Недостаточно товара «X» на складе: нужно 1, в наличии
 * 0». Из-за этого пикер товаров показывает «в наличии: 175 шт» там, где списать
 * нельзя. Тикет — `MamaDoc/backend_ticket_product_stock_branch_scoping.md`.
 *
 * Хук нужен только чтобы **предупредить** пользователя до сохранения: жёстко
 * фильтровать пикер по этой цифре нельзя — пока бэк не подтвердил, учитываются
 * ли при списании подключённые склады чужих филиалов (`isLinked`), фронт может
 * оказаться строже бэка и скрыть товар, который реально списался бы.
 */

/** Склад вне филиала, на котором остаток товара есть. */
export type StockElsewhere = {
  warehouseName: string;
  quantity: number;
};

export type BranchStockInfo = {
  loading: boolean;
  /**
   * Данные загружены и филиал известен. Пока false — подсказки не показываем,
   * чтобы не сообщать пользователю «остатка нет» вместо «остаток неизвестен».
   */
  ready: boolean;
  /** Остаток по складам филиала; товар без строки остатка — 0. */
  quantityOf: (productId: number) => number;
  /** Где ещё лежит товар (склады других филиалов), по убыванию остатка. */
  elsewhereOf: (productId: number) => StockElsewhere[];
};

const EMPTY: StockElsewhere[] = [];

export function useBranchStock(
  enabled: boolean,
  branchId: number | null,
  /** Явный орг-контекст для суперпользователя/мультиорг (как в getProducts). */
  organizationId?: number,
): BranchStockInfo {
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [inBranch, setInBranch] = React.useState<Map<number, number>>(new Map());
  const [elsewhere, setElsewhere] = React.useState<Map<number, StockElsewhere[]>>(
    new Map(),
  );

  React.useEffect(() => {
    if (!enabled || branchId === null) {
      setReady(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([
      getWarehouses(ctrl.signal, organizationId),
      // Весь остаток организации одним запросом: на проде это ~50 строк
      // (03.08.2026), пагинации у эндпоинта нет.
      getStock(undefined, ctrl.signal, organizationId),
    ])
      .then(([warehouses, stock]) => {
        if (ctrl.signal.aborted) return;
        // Подключённые склады чужих филиалов сознательно не считаем «своими»:
        // `isLinked` относится к сессионному контексту, а филиал приёма может
        // быть другим. Их остаток попадёт в «где ещё лежит».
        const own = new Set(
          warehouses.filter((w) => w.branchId === branchId).map((w) => w.id),
        );
        const mine = new Map<number, number>();
        const other = new Map<number, StockElsewhere[]>();
        for (const row of stock) {
          if (own.has(row.warehouseId)) {
            mine.set(row.productId, (mine.get(row.productId) ?? 0) + row.quantity);
          } else if (row.quantity > 0) {
            const list = other.get(row.productId) ?? [];
            list.push({ warehouseName: row.warehouseName, quantity: row.quantity });
            other.set(row.productId, list);
          }
        }
        for (const list of other.values()) list.sort((a, b) => b.quantity - a.quantity);
        setInBranch(mine);
        setElsewhere(other);
        setReady(true);
      })
      .catch(() => {
        // Подсказка необязательна: без остатков просто не показываем её.
        if (!ctrl.signal.aborted) setReady(false);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [enabled, branchId, organizationId]);

  const quantityOf = React.useCallback(
    (productId: number) => inBranch.get(productId) ?? 0,
    [inBranch],
  );
  const elsewhereOf = React.useCallback(
    (productId: number) => elsewhere.get(productId) ?? EMPTY,
    [elsewhere],
  );

  return { loading, ready, quantityOf, elsewhereOf };
}
