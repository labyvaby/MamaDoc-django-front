import type { AppointmentConsumptionWarning } from "../../api/appointments";
import { formatQuantity } from "../../utility/format";

/**
 * Бэк присылает предупреждение в двух наборах имён (см.
 * AppointmentConsumptionWarning) — читаем первый непустой.
 */
const pick = (...values: (string | null | undefined)[]): string | null => {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v) !== "") return String(v);
  }
  return null;
};

/** Нет склада у филиала — про товар говорить нечего, все поля пустые. */
const isWarehouseMissing = (code: string): boolean =>
  code.toLowerCase() === "warehouse_not_found";

/**
 * Человеческий текст предупреждения автосписания расходников.
 *
 * Матчим по машинному `code`, не по тексту. Нехватка — не ошибка: приём
 * оплачивается/завершается, остаток уходит в минус, поэтому формулировка
 * «списано …, остаток стал …», а не «не удалось списать».
 */
export function formatConsumptionWarning(w: AppointmentConsumptionWarning): string {
  if (isWarehouseMissing(String(w.code ?? ""))) {
    return "У филиала нет склада — расходники не списаны";
  }
  const name = pick(w.name, w.productName) ?? "Расходник";
  const written = pick(w.required, w.requested);
  const parts = [
    written !== null ? `${name}: списано ${formatQuantity(written)}` : name,
  ];
  // Остаток после списания бэк присылает только в старом формате; в новом
  // считаем его сами из «было на складе − списали», иначе не сказать главного —
  // что остаток ушёл в минус.
  const resulting = pick(w.resultingStock);
  const available = pick(w.stockOnHand, w.available);
  if (resulting !== null) {
    parts.push(`остаток ${formatQuantity(resulting)}`);
  } else if (available !== null && written !== null) {
    const left = parseFloat(available) - parseFloat(written);
    if (Number.isFinite(left)) parts.push(`остаток ${formatQuantity(String(left))}`);
  } else if (available !== null) {
    parts.push(`остаток ${formatQuantity(available)}`);
  }
  const warehouse = pick(w.warehouseName);
  if (warehouse !== null) parts.push(`склад «${warehouse}»`);
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
