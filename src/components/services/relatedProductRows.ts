import { parseRelatedQuantity } from "../../api/catalog";
import type { DjangoProduct } from "../../api/warehouse";

/** Строка состава услуги в форме: товар, введённое количество и автосписание. */
export interface RelatedProductRow {
  product: DjangoProduct;
  /** Как в поле ввода — валидируется через parseRelatedQuantity. */
  quantity: string;
  autoWriteOff: boolean;
}

/** Есть ли в составе строка с некорректным количеством (блокирует сохранение). */
export function hasInvalidQuantity(rows: RelatedProductRow[]): boolean {
  return rows.some((row) => parseRelatedQuantity(row.quantity) === null);
}
