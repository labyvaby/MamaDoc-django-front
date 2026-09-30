import type { Project, Unit, UnitOffer } from "../../../api/realestate";
import { tt } from "../../../i18n/t";
import { formatMoney, formatRooms, num, outdoorLabel } from "./units";

/** То же правило, что у бэка (`realty/selectors.floor_type`, поле `floorType` в `/projects/<id>/floors/`). */
export function floorTypeLabel(project: Project, floor: number) {
  if (floor === project.floorsCount) return tt("realestate:floorType.penthouse");
  if (floor >= project.floorsCount - 2) return tt("realestate:floorType.club");
  return tt("realestate:floorType.typical");
}

export const outdoorKind = (unit: Unit) =>
  unit.outdoor && unit.outdoor.type !== "terrace" ? outdoorLabel(unit.outdoor.type) : null;

/** «Балкон 4.6 м²» / «Лоджия 3.8 м²» или null. */
export const balconyLabel = (unit: Unit) => {
  const kind = outdoorKind(unit);
  return kind && unit.outdoor ? tt("realestate:fmt.outdoorArea", { kind, area: num(unit.outdoor.area) }) : null;
};

/** «Терраса 24.8 м²» или null. */
export const terraceLabel = (unit: Unit) =>
  unit.outdoor?.type === "terrace"
    ? tt("realestate:fmt.outdoorArea", { kind: outdoorLabel("terrace"), area: num(unit.outdoor.area) })
    : null;

/** «1 санузел» / «2 санузла» — плюрализация i18next. */
export const bathroomsLabel = (unit: Unit) => tt("realestate:fmt.bathrooms", { count: unit.bathrooms });

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
  offer.discount ? `− ${formatMoney(offer.discount)}` : tt("realestate:offer.noOverpay");

const RENDERS = "/realestate/renders";

/** Общие примеры интерьера; подписи — `realestate:renders.<key>.label/note`. */
export const apartmentRenders = [
  { key: "living", src: `${RENDERS}/living-room.jpg` },
  { key: "bedroom", src: `${RENDERS}/bedroom.jpg` },
  { key: "kids", src: `${RENDERS}/kids-room.jpg` },
  { key: "bathroom", src: `${RENDERS}/bathroom.jpg` },
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
