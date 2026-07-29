import { parseRelatedQuantity } from "../../api/catalog";
import type { DjangoProduct } from "../../api/warehouse";

/** Строка состава услуги в форме: товар, введённое количество и автосписание. */
export interface RelatedProductRow {
  product: DjangoProduct;
  /** Как в поле ввода — валидируется через parseRelatedQuantity. */
  quantity: string;
  autoWriteOff: boolean;
  /** Оплачивается сверх цены услуги (см. ServiceRelatedProduct.billable). */
  billable: boolean;
}

/** Есть ли в составе строка с некорректным количеством (блокирует сохранение). */
export function hasInvalidQuantity(rows: RelatedProductRow[]): boolean {
  return rows.some((row) => parseRelatedQuantity(row.quantity) === null);
}

/**
 * Сколько платные позиции состава добавят к цене услуги в приёме.
 *
 * Цена берётся из прайса товара (`product.price`) — как её и снапшотит бэк при
 * создании приёма. Строки с невалидным количеством в сумму не идут: форма их
 * всё равно не даст сохранить, а «0 сом» врал бы меньше, чем NaN.
 */
export function billableTotal(rows: RelatedProductRow[]): number {
  return rows.reduce((sum, row) => {
    if (!row.billable) return sum;
    const quantity = parseRelatedQuantity(row.quantity);
    return quantity === null ? sum : sum + row.product.price * quantity;
  }, 0);
}
