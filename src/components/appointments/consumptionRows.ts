import { parseRelatedQuantity } from "../../api/catalog";
import type { AppointmentConsumption } from "../../api/appointments";

/** Расходник строки услуги в форме приёма. */
export interface ConsumptionRow {
  /** id строки расхода приёма (НЕ товара); null — новая строка. */
  lineId: number | null;
  productId: number;
  name: string;
  unit: string;
  /** Как в поле ввода (decimal-строка). */
  quantity: string;
  autoWriteOff: boolean;
  /** Остаток склада филиала из ответа бэка; null — у филиала склада нет. */
  stockOnHand: string | null;
  source: AppointmentConsumption["source"];
}

/** Строка приёма → строка формы. */
export function toConsumptionRow(c: AppointmentConsumption): ConsumptionRow {
  return {
    lineId: c.id,
    productId: c.productId,
    name: c.name,
    unit: c.unit,
    quantity: String(c.quantity),
    autoWriteOff: c.autoWriteOff,
    stockOnHand: c.stockOnHand,
    source: c.source,
  };
}

/**
 * Есть ли строка с некорректным количеством — блокирует сохранение формы.
 *
 * Парсер общий с составом услуги в справочнике (`parseRelatedQuantity`): бэк
 * ждёт то же самое — > 0 и до 3 знаков после запятой.
 */
export function hasInvalidConsumptionQuantity(rows: ConsumptionRow[]): boolean {
  return rows.some((row) => parseRelatedQuantity(row.quantity) === null);
}
