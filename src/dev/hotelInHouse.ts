/**
 * Кто сейчас в отеле — одно правило для шапки шахматки, ресепшена, кухни и
 * отчётов, чтобы на вопрос «сколько людей в здании» везде был один ответ.
 *
 * Проживает тот, кто заселён и ещё не выехал. Гость, который не заехал, не
 * проживает, не должен денег и не ест: пока бронь не отмечена «Незаезд», она
 * только «ожидает заезда», а после даты заезда — «не заехал» (см. ресепшен,
 * «Закрыть день»). Без React — проверяется тестами (hotelInHouse.test.ts).
 */
import type { HotelReservation, HotelReservationItem } from "../api/hotel";

type Item = Pick<HotelReservationItem, "checkIn" | "checkOut" | "stayStatus" | "isActive" | "adults" | "children">;

const active = (i: Item) => i.isActive !== false;
const covers = (i: Item, date: string) => i.checkIn <= date && date < i.checkOut;

/**
 * Номер занят гостем в ночь \`date\`: сегодня — заселён; в прошлом — заселён
 * или уже выехал; в будущем — заселён (живёт дальше) или ждёт заезда, который
 * ещё не прошёл. Незаезд (ждёт, а дата заезда позади) — никогда.
 */
export function isStayingOn(item: Item, date: string, today: string): boolean {
  if (!active(item) || !covers(item, date)) return false;
  if (date < today) return item.stayStatus === "checked_in" || item.stayStatus === "checked_out";
  if (date === today) return item.stayStatus === "checked_in";
  return item.stayStatus === "checked_in" || (item.stayStatus === "expected" && item.checkIn >= today);
}

/** Не заехал: ждёт заезда, а дата заезда уже прошла. */
export const isMissedArrival = (item: Item, today: string): boolean =>
  active(item) && item.stayStatus === "expected" && item.checkIn < today;

export interface InHouseCounts {
  /** Номера, где живут в ночь даты. */
  rooms: number;
  /** Взрослые + дети в этих номерах. */
  guests: number;
  /** Брони с проживающими — для списков ресепшена. */
  reservations: number;
  /** Не заехали, но бронь всё ещё держит номер на эту дату. */
  missedRooms: number;
  missedGuests: number;
}

export function inHouseCounts(reservations: HotelReservation[], date: string, today: string): InHouseCounts {
  const counts: InHouseCounts = { rooms: 0, guests: 0, reservations: 0, missedRooms: 0, missedGuests: 0 };
  for (const r of reservations) {
    if (r.status !== "confirmed") continue;
    let staying = false;
    for (const item of r.items) {
      if (isStayingOn(item, date, today)) {
        staying = true;
        counts.rooms += 1;
        counts.guests += item.adults + item.children;
      } else if (covers(item, date) && isMissedArrival(item, today)) {
        counts.missedRooms += 1;
        counts.missedGuests += item.adults + item.children;
      }
    }
    if (staying) counts.reservations += 1;
  }
  return counts;
}

/**
 * Бронь, где гость так и не заехал: подтверждена, все действующие номера ждут
 * заезда, а первый заезд уже прошёл. Кандидат для «Закрыть день → Незаезд».
 */
export function isNoShowCandidate(r: HotelReservation, today: string): boolean {
  if (r.status !== "confirmed") return false;
  const items = r.items.filter(active);
  return items.length > 0 && items.every((i) => i.stayStatus === "expected") && items.some((i) => i.checkIn < today);
}

/** Долг гостя — только у того, кто заехал или уже выехал: незаезд — не должник. */
export function isGuestDebt(r: HotelReservation): boolean {
  return (
    r.status === "confirmed" &&
    Number(r.balanceDue) > 0 &&
    r.items.some((i) => active(i) && (i.stayStatus === "checked_in" || i.stayStatus === "checked_out"))
  );
}
