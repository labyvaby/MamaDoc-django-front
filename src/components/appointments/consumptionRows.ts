import { parseRelatedQuantity, type ServiceRelatedProduct } from "../../api/catalog";
import { consumptionLineTotal, type AppointmentConsumption } from "../../api/appointments";
import { formatQuantity } from "../../utility/format";

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
  /** Оплачивается сверх цены услуги — сумма идёт в чек приёма. */
  billable: boolean;
  /**
   * Цена единицы (снапшот бэка или прайс товара для новой строки), сом. Ноль —
   * цена неизвестна: сумму тогда не показываем, её посчитает бэк.
   */
  unitPrice: number;
  /** Остаток склада филиала из ответа бэка; null — у филиала склада нет. */
  stockOnHand: string | null;
  source: AppointmentConsumption["source"];
}

/** Строка приёма → строка формы. */
export function toConsumptionRow(c: AppointmentConsumption): ConsumptionRow {
  const quantity = parseFloat(String(c.quantity)) || 0;
  const lineTotal = consumptionLineTotal(c);
  return {
    lineId: c.id,
    productId: c.productId,
    name: c.name,
    unit: c.unit,
    quantity: String(c.quantity),
    autoWriteOff: c.autoWriteOff,
    billable: c.billable === true,
    // Приоритет — явный unitPrice бэка; если его нет, восстанавливаем из
    // суммы строки, чтобы правка количества считалась по той же цене.
    unitPrice:
      parseFloat(String(c.unitPrice ?? "")) ||
      (quantity > 0 ? lineTotal / quantity : 0),
    stockOnHand: c.stockOnHand,
    source: c.source,
  };
}

/**
 * Состав услуги из справочника → строки формы приёма, который ещё не сохранён.
 *
 * Количество умножается на количество услуги в строке — так же, как это сделает
 * бэк, разворачивая состав в строки расхода. `lineId` нет: строк расхода в базе
 * ещё не существует. Остаток склада филиала знает только API приёма, в
 * справочнике он по всей организации — поэтому `stockOnHand: null` («неизвестен»)
 * вместо числа, которое после сохранения окажется другим.
 */
export function serviceTemplateRows(
  products: ServiceRelatedProduct[],
  serviceQuantity = 1,
): ConsumptionRow[] {
  const multiplier = serviceQuantity > 0 ? serviceQuantity : 1;
  return products.map((p) => ({
    lineId: null,
    productId: p.id,
    name: p.name,
    unit: p.unit,
    quantity: formatQuantity(p.quantity * multiplier),
    autoWriteOff: p.autoWriteOff,
    billable: p.billable,
    unitPrice: p.price,
    stockOnHand: null,
    source: "service_template",
  }));
}

/** Сколько платные расходники строки услуги добавляют к сумме приёма. */
export function billableRowsTotal(rows: ConsumptionRow[]): number {
  return rows.reduce((sum, row) => {
    if (!row.billable) return sum;
    const quantity = parseRelatedQuantity(row.quantity);
    return quantity === null ? sum : sum + row.unitPrice * quantity;
  }, 0);
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
