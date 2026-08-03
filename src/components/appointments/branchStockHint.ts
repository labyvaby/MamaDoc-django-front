import { tt } from "../../i18n/t";
import { formatQuantity } from "../../utility/format";
import type { BranchStockInfo } from "../../hooks/useBranchStock";

/**
 * Подсказки про остаток товара на складе **филиала приёма** — общие для дроверов
 * создания и редактирования приёма.
 *
 * Пикер товаров показывает `product.stock`, который бэк считает по всей
 * организации, а сохранение проверяет склад филиала (см. `useBranchStock` и
 * `MamaDoc/backend_ticket_product_stock_branch_scoping.md`). Здесь только текст
 * предупреждения: товар не скрываем и сохранение не блокируем — фронт не знает
 * наверняка, с какого склада бэк спишет.
 *
 * Тексты через `tt()`, а не `useT()`: строки неглоссарные, зато обе формы
 * (подпись опции и предупреждение строки) нужны в двух дроверах без дублирования.
 */

export type ProductStockShort = {
  id: number;
  unit: string;
};

/** Подпись под названием товара в списке пикера; null — данных нет. */
export function branchStockCaption(
  info: BranchStockInfo,
  product: ProductStockShort,
): string | null {
  if (!info.ready) return null;
  const qty = info.quantityOf(product.id);
  if (qty > 0) {
    return tt("appointments:addDrawer.branchStockValue", {
      stock: formatQuantity(qty),
      unit: product.unit,
    });
  }
  const parts = [tt("appointments:addDrawer.branchStockNone")];
  const elsewhere = info.elsewhereOf(product.id)[0];
  if (elsewhere) {
    parts.push(
      tt("appointments:addDrawer.branchStockElsewhere", {
        warehouse: elsewhere.warehouseName,
        stock: formatQuantity(elsewhere.quantity),
      }),
    );
  }
  return parts.join(" · ");
}

/**
 * Предупреждение под строкой товара: остатка на складе филиала не хватает на
 * запрошенное количество. null — предупреждать не о чем (или нечем).
 */
export function branchStockWarning(
  info: BranchStockInfo,
  product: ProductStockShort,
  requestedQty: number,
): string | null {
  if (!info.ready || requestedQty <= 0) return null;
  const qty = info.quantityOf(product.id);
  if (qty >= requestedQty) return null;
  const hint = tt("appointments:addDrawer.branchStockTransferHint");
  if (qty > 0) {
    return `${tt("appointments:addDrawer.branchStockLowWarning", {
      stock: formatQuantity(qty),
      unit: product.unit,
    })}. ${hint}`;
  }
  const elsewhere = info.elsewhereOf(product.id)[0];
  const head = elsewhere
    ? tt("appointments:addDrawer.branchStockWarning", {
        where: capitalize(
          tt("appointments:addDrawer.branchStockElsewhere", {
            warehouse: elsewhere.warehouseName,
            stock: formatQuantity(elsewhere.quantity),
          }),
        ),
      })
    : `${tt("appointments:addDrawer.branchStockWarningShort")}.`;
  return `${head} ${hint}`;
}

const capitalize = (s: string): string =>
  s.length === 0 ? s : `${s[0].toUpperCase()}${s.slice(1)}`;
