import { tt } from "../i18n/t";

/**
 * Подпись способа оплаты из общего словаря (`common:paymentMethods`).
 *
 * У безнала (`card`) уточняется конкретным способом из справочника, если бэк
 * его отдал: «Карта · Бакай». Пока справочника нет (флаг
 * `CASHLESS_METHODS_ENABLED` выключен) поле не приходит и подпись прежняя.
 */
export function paymentMethodLabel(
  method: string,
  cashlessMethodName?: string | null,
): string {
  const base = tt(`common:paymentMethods.${method}`, { defaultValue: method });
  if (method === "card" && cashlessMethodName) return `${base} · ${cashlessMethodName}`;
  return base;
}

export default paymentMethodLabel;
