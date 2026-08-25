import { tt } from "../../i18n/t";
import { formatQuantity } from "../../utility/format";
import type { AppointmentStockShortage } from "../../api/appointments";

/**
 * Тексты блокирующей нехватки остатка при сохранении приёма
 * (`parseInsufficientStock`): общий алерт формы и короткая строка под товаром.
 *
 * Читаем только машинные поля ответа; русский `msg` бэка — фолбэк на случай,
 * когда склад в ответе не назван. Через `tt()`: нужны в двух дроверах.
 */

/** decimal-строка бэка → «1», «0», «2,5»; мусор показываем как пришёл. */
const qty = (value: string | null): string => {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatQuantity(n) : value;
};

/** Общий алерт формы: что не хватило, где и сколько. */
export function stockShortageMessage(
  shortage: AppointmentStockShortage,
  /** Название товара из формы; в новом конверте бэк называет его и сам. */
  productName: string | null,
): string {
  const product = productName ?? shortage.productName ?? tt("appointments:addDrawer.product");
  const params = {
    product,
    warehouse: shortage.warehouseName ?? "",
    required: qty(shortage.required),
    available: qty(shortage.available),
  };
  return shortage.warehouseName
    ? tt("appointments:addDrawer.shortageAlert", params)
    : // Без названия склада собственный текст беднее ответа бэка — берём его.
      (shortage.msg ?? tt("appointments:addDrawer.shortageAlertNoWarehouse", params));
}

/** Подпись под строкой товара, которому не хватило остатка. */
export function stockShortageRowText(
  shortage: AppointmentStockShortage,
): string | null {
  if (!shortage.warehouseName) return shortage.msg;
  return tt("appointments:addDrawer.shortageRow", {
    warehouse: shortage.warehouseName,
    required: qty(shortage.required),
    available: qty(shortage.available),
  });
}
