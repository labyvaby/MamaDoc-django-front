import type { AppointmentConsumptionWarning } from "../../api/appointments";
import { formatQuantity } from "../../utility/format";

/**
 * Человеческий текст предупреждения автосписания расходников (гайд §4a).
 *
 * Матчим по машинному `code`, не по тексту. Нехватка — не ошибка: приём
 * завершается, остаток уходит в минус, поэтому формулировка «списано …, остаток
 * стал …», а не «не удалось списать».
 */
export function formatConsumptionWarning(w: AppointmentConsumptionWarning): string {
  if (w.code === "warehouse_not_found") {
    return "У филиала нет склада — расходники не списаны";
  }
  const name = w.name || "Расходник";
  const parts = [`${name}: списано ${formatQuantity(w.required)}`];
  if (w.resultingStock !== null && w.resultingStock !== undefined) {
    parts.push(`остаток ${formatQuantity(w.resultingStock)}`);
  }
  return parts.join(", ");
}

/**
 * Одна строка на тост: несколько предупреждений склеиваем через «; ».
 * Пустой массив → null, чтобы вызывающий просто не показывал тост.
 */
export function formatConsumptionWarnings(
  warnings: AppointmentConsumptionWarning[] | undefined,
): string | null {
  if (!warnings || warnings.length === 0) return null;
  return warnings.map(formatConsumptionWarning).join("; ");
}
