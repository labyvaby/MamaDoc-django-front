import { tt } from "../../i18n/t";
import { formatQuantity } from "../../utility/format";
import type { StockElsewhereInfo } from "../../hooks/useStockElsewhere";

/**
 * Подсказки про остаток товара на складе **филиала приёма** — общие для дроверов
 * создания и редактирования приёма.
 *
 * Источник цифры — `product.branchStock` из `GET /warehouse/products/?branchId=…`:
 * это остаток склада, с которого бэк спишет товар и по которому он валидирует
 * сохранение (контракт 03.08.2026). `null` — филиал в запрос не передавался,
 * остаток филиала неизвестен: тогда молчим, а не пугаем «остатка нет».
 *
 * Товар не скрываем и сохранение не блокируем здесь — это дело формы; тут только
 * текст. Через `tt()`, а не `useT()`: строки неглоссарные, зато обе формы
 * (подпись опции и предупреждение строки) нужны в двух дроверах без дублирования.
 */

export type ProductStockShort = {
  id: number;
  unit: string;
  /** Остаток склада списания филиала; null — неизвестен. */
  branchStock: number | null;
};

/**
 * Подпись под названием товара в списке пикера: где взять товар, которого нет на
 * складе филиала. null — подсказывать нечего (остаток есть или неизвестен).
 */
export function branchStockCaption(
  info: StockElsewhereInfo,
  product: ProductStockShort,
): string | null {
  // Остаток филиала уже показан основной строкой опции — дублировать не нужно.
  if (product.branchStock === null || product.branchStock > 0) return null;
  const parts = [tt("appointments:addDrawer.branchStockNone")];
  const elsewhere = info.ready ? info.elsewhereOf(product.id)[0] : undefined;
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
  info: StockElsewhereInfo,
  product: ProductStockShort,
  requestedQty: number,
): string | null {
  const qty = product.branchStock;
  if (qty === null || requestedQty <= 0 || qty >= requestedQty) return null;
  const hint = tt("appointments:addDrawer.branchStockTransferHint");
  if (qty > 0) {
    return `${tt("appointments:addDrawer.branchStockLowWarning", {
      stock: formatQuantity(qty),
      unit: product.unit,
    })}. ${hint}`;
  }
  const elsewhere = info.ready ? info.elsewhereOf(product.id)[0] : undefined;
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
