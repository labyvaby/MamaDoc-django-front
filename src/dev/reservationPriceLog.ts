/**
 * Строки истории брони о правке цен (action "price_changed"). Сервер кладёт в
 * oldValue/newValue JSON: field "pricing" — изменённые ночи и скидка номера
 * ({ itemId, discountPercent, nights: { "2026-10-01": { price, discount, isManual } } }),
 * field "total_amount" — расчётная и своя сумма номера. Показываем это
 * человеческим языком, а не сырым JSON.
 */
import { formatHotelDate } from "./mockDemoData";

interface NightState {
  price?: string;
  discount?: string;
  isManual?: boolean;
}

interface PricingState {
  discountPercent?: string | null;
  nights?: Record<string, NightState>;
}

const parse = (raw: string): PricingState | null => {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as PricingState) : null;
  } catch {
    return null;
  }
};

const num = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const percent = (v: string | null | undefined) => (v != null && v !== "" && Number(v) > 0 ? `${num(v)}%` : "нет");

export function describePriceChange(log: { field: string; oldValue: string; newValue: string }): string {
  if (log.field === "total_amount") return `Своя сумма номера: ${num(log.oldValue)} → ${num(log.newValue)}`;
  const before = parse(log.oldValue);
  const after = parse(log.newValue);
  if (!after) return "Цены изменены";
  const parts: string[] = [];
  for (const [date, night] of Object.entries(after.nights ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const old = before?.nights?.[date];
    const was = old?.price != null ? num(old.price) : "—";
    const now = night.price != null ? num(night.price) : "—";
    parts.push(`${formatHotelDate(date)}: ${was} → ${now}${night.isManual === false ? " (по тарифу)" : ""}`);
  }
  const discountBefore = before?.discountPercent ?? null;
  const discountAfter = after.discountPercent ?? null;
  if ("discountPercent" in after && Number(discountBefore ?? 0) !== Number(discountAfter ?? 0)) {
    parts.push(`скидка номера: ${percent(discountBefore)} → ${percent(discountAfter)}`);
  }
  return parts.length ? `Цены: ${parts.join("; ")}` : "Цены изменены";
}
