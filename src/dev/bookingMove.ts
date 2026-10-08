/**
 * Перенос брони перетаскиванием в шахматке (заказчик: «как в Exely — зажал
 * фамилию и перетащил на нужную дату или номер»). Здесь — без React: занято ли
 * место под «призраком» и какими запросами сервера перенос делается.
 *
 * Сервер (services.update_item / assign_room / move_room):
 * - новые даты — PATCH позиции; номер остаётся, если свободен на новые даты,
 *   новые ночи — по текущим ценам, совпадающие сохраняют цену;
 * - другой номер той же категории до заезда — assign-room;
 * - другая категория — PATCH с roomTypeId (номер снимается, цена
 *   пересчитывается), затем assign-room;
 * - заселённый гость — только переселение (move-room, с причиной); дату заезда
 *   ему менять нельзя.
 * Если меняются и даты, и номер, старый номер сначала снимается: на новые даты
 * он может быть занят, и PATCH отказал бы, хотя гость едет в другой.
 */
import dayjs from "dayjs";

export const shiftDate = (date: string, days: number) => dayjs(date).add(days, "day").format("YYYY-MM-DD");

interface Span {
  checkIn: string;
  checkOut: string;
}

const overlaps = (a: Span, b: Span) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;

/** Место занято: другая бронь этого номера или снятие с продажи пересекают новые даты. */
export function moveConflict(
  target: Span,
  roomItems: (Span & { itemId: number })[],
  roomBlocks: { dateFrom: string; dateTo: string }[],
  itemId: number,
): "booking" | "block" | null {
  if (roomItems.some((o) => o.itemId !== itemId && overlaps(o, target))) return "booking";
  if (roomBlocks.some((b) => overlaps({ checkIn: b.dateFrom, checkOut: b.dateTo }, target))) return "block";
  return null;
}

export type MoveStep =
  | { kind: "unassign" }
  | { kind: "update"; checkIn?: string; checkOut?: string; roomTypeId?: number }
  | { kind: "assign"; roomId: number }
  | { kind: "move"; roomId: number };

export interface MoveInput {
  stayStatus: string;
  fromRoomId: number | null;
  fromRoomTypeId: number;
  toRoom: { id: number; roomTypeId: number };
  checkIn: string;
  checkOut: string;
  newCheckIn: string;
  newCheckOut: string;
}

/** Запросы переноса по порядку; строка — почему так нельзя. Пустой массив — переносить нечего. */
export function planMove(p: MoveInput): MoveStep[] | string {
  if (p.stayStatus === "checked_out") return "Гость уже выехал — бронь не переносится.";
  const datesChanged = p.newCheckIn !== p.checkIn || p.newCheckOut !== p.checkOut;
  const roomChanged = p.toRoom.id !== p.fromRoomId;
  const typeChanged = p.toRoom.roomTypeId !== p.fromRoomTypeId;
  if (p.stayStatus === "checked_in") {
    if (datesChanged) return "Гость заселён — дату заезда менять нельзя. Перенесите его в другой номер на те же даты.";
    return roomChanged ? [{ kind: "move", roomId: p.toRoom.id }] : [];
  }
  const steps: MoveStep[] = [];
  if (datesChanged || typeChanged) {
    // Другая категория снимет номер сама (на сервере), той же — снимаем, чтобы старый номер не мешал новым датам.
    if (datesChanged && roomChanged && !typeChanged && p.fromRoomId != null) steps.push({ kind: "unassign" });
    steps.push({
      kind: "update",
      ...(datesChanged ? { checkIn: p.newCheckIn, checkOut: p.newCheckOut } : {}),
      ...(typeChanged ? { roomTypeId: p.toRoom.roomTypeId } : {}),
    });
  }
  if (roomChanged) steps.push({ kind: "assign", roomId: p.toRoom.id });
  return steps;
}
