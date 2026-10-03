/**
 * Время заезда и выезда брони. У объекта — правило («заезд с 14:00, выезд
 * до 12:00», Настройки → Объект), у брони — своё время, если договорились
 * иначе: ранний заезд, поздний выезд или время со слов гостя
 * (expectedArrivalTime / expectedDepartureTime, "HH:MM" по часам объекта;
 * null — как в правилах).
 */
import { formatHotelTime } from "./hotelDisplay";

export type StayTimeKind = "arrival" | "departure";

/** "14:30:00" / "14:30" → "14:30"; пусто — null. */
export const hhmm = (value: string | null | undefined): string | null => (value ? formatHotelTime(value) : null);

export interface StayTimeView {
  /** Что показать: своё время брони или правило объекта; null — ни того, ни другого. */
  time: string | null;
  /** true — время самой брони, false — по правилам объекта. */
  own: boolean;
  /** «ранний заезд» / «поздний выезд» — своё время раньше / позже правила. */
  note: string | null;
}

export function stayTimeView(kind: StayTimeKind, own: string | null | undefined, rule: string | null | undefined): StayTimeView {
  const mine = hhmm(own);
  const base = hhmm(rule);
  if (!mine) return { time: base, own: false, note: null };
  const shifted = base != null && (kind === "arrival" ? mine < base : mine > base);
  return { time: mine, own: true, note: shifted ? (kind === "arrival" ? "ранний заезд" : "поздний выезд") : null };
}

/** Время заезда брони или правило объекта — для списков, отчётов и документов. */
export const arrivalTimeOf = (reservation: { expectedArrivalTime?: string | null }, ruleCheckIn: string | null | undefined): string | null =>
  hhmm(reservation.expectedArrivalTime) ?? hhmm(ruleCheckIn);

/** Время выезда брони или правило объекта. */
export const departureTimeOf = (reservation: { expectedDepartureTime?: string | null }, ruleCheckOut: string | null | undefined): string | null =>
  hhmm(reservation.expectedDepartureTime) ?? hhmm(ruleCheckOut);
