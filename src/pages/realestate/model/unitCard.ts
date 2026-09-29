import type { Project, Unit, UnitOffer } from "../../../api/realestate";
import { formatMoney, formatRooms, num } from "./units";

export function floorTypeLabel(project: Project, floor: number) {
  if (floor === project.floorsCount) return "Пентхаус";
  if (floor >= project.floorsCount - 2) return "Клубный этаж";
  return "Типовой этаж";
}

export const outdoorKind = (unit: Unit) =>
  unit.outdoor?.type === "loggia" ? "Лоджия" : unit.outdoor?.type === "balcony" ? "Балкон" : null;

/** «Балкон 4.6 м²» / «Лоджия 3.8 м²» или null. */
export const balconyLabel = (unit: Unit) => {
  const kind = outdoorKind(unit);
  return kind && unit.outdoor ? `${kind} ${num(unit.outdoor.area)} м²` : null;
};

/** «Терраса 24.8 м²» или null. */
export const terraceLabel = (unit: Unit) =>
  unit.outdoor?.type === "terrace" ? `Терраса ${num(unit.outdoor.area)} м²` : null;

export const bathroomsLabel = (unit: Unit) =>
  `${unit.bathrooms} сануз${unit.bathrooms > 1 ? "ла" : "ел"}`;

export const unitType = (unit: Unit) => formatRooms(unit.rooms);

export type RoomKind = "wet" | "hall" | "main-room" | "bedroom";

export const roomKind = (name: string): RoomKind =>
  /санузел|ванная/i.test(name)
    ? "wet"
    : /прихожая/i.test(name)
      ? "hall"
      : /кухня/i.test(name)
        ? "main-room"
        : "bedroom";

/** Акция по умолчанию — «Скидка за площадь». */
export const DEFAULT_OFFER = "meter";

export const pickOffer = (offers: UnitOffer[], id: string) =>
  offers.find((o) => o.id === id) ?? offers[0]!;

export const priceWithOffer = (unit: Unit, offer: UnitOffer) =>
  Math.max(0, unit.price - offer.discount);

export const offerDiscountLabel = (offer: UnitOffer) =>
  offer.discount ? `− ${formatMoney(offer.discount)}` : "0% переплаты";

const RENDERS = "/realestate/renders";

export const apartmentRenders = [
  {
    src: `${RENDERS}/living-room.jpg`,
    label: "Кухня-гостиная",
    note: "Светлая кухня-гостиная с панорамными окнами",
  },
  { src: `${RENDERS}/bedroom.jpg`, label: "Спальня", note: "Мастер-спальня со встроенными шкафами" },
  {
    src: `${RENDERS}/kids-room.jpg`,
    label: "Детская",
    note: "Комната с рабочей зоной и местами хранения",
  },
  { src: `${RENDERS}/bathroom.jpg`, label: "Ванная", note: "Ванная с душевой и тёплой подсветкой" },
] as const;

/** Первый взнос 30% и рассрочка на 24 месяца — умолчания бэка для договора (`sell`: downPayment 30%, term 24). */
export function paymentPlan(price: number) {
  const down = Math.round((price * 0.3) / 1000) * 1000;
  return { down, monthly: Math.round((price - down) / 24 / 1000) * 1000 };
}

/** Как в прототипе: на другом этаже открываем первую свободную квартиру, иначе первую. */
export function pickFloorUnit(units: Unit[], floor: number) {
  return units
    .filter((u) => u.floor === floor)
    .sort((a, b) => Number(a.status !== "free") - Number(b.status !== "free") || a.axis - b.axis)[0];
}
