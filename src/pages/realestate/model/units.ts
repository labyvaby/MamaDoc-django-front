import type { OutdoorSpaceType, Unit, UnitStatus } from "../../../api/realestate";
import { tt } from "../../../i18n/t";

const statusMeta = (status: UnitStatus) => ({
  label: tt(`realestate:status.${status}`),
  short: tt(`realestate:statusShort.${status}`),
});

/**
 * Подписи статусов квартиры: полная — в карточке, короткая — в легенде и ячейке.
 * Геттеры, а не значения: словарь читается при обращении, а не при импорте.
 */
export const unitStatusMeta: Record<UnitStatus, { label: string; short: string }> = {
  get free() {
    return statusMeta("free");
  },
  get reserved() {
    return statusMeta("reserved");
  },
  get sold() {
    return statusMeta("sold");
  },
};

export type StatusFilter = "all" | UnitStatus;
/** 'all' | '0'…'3' | '4' (4 и больше) */
export type RoomsFilter = "all" | "0" | "1" | "2" | "3" | "4";
export type FeatureFilter = "all" | "terrace" | "balcony" | "south" | "panoramic";
/** Быстрые фильтры менеджера по броням. */
export type HoldFilter = "all" | "today" | "unpaid";

/** Включительный диапазон [от, до]. */
export type NumberRange = readonly [number, number];

export interface UnitFilters {
  status: StatusFilter;
  rooms: RoomsFilter;
  feature: FeatureFilter;
  hold: HoldFilter;
  /** Цена, сом; null — без ограничения. */
  price: NumberRange | null;
  /** Общая площадь, м². */
  area: NumberRange | null;
  floor: NumberRange | null;
}

export const defaultUnitFilters: UnitFilters = {
  status: "all",
  rooms: "all",
  feature: "all",
  hold: "all",
  price: null,
  area: null,
  floor: null,
};

export const statusOptions = ["all", "free", "reserved", "sold"] as const satisfies readonly StatusFilter[];

/** Подписи — `realestate:filters.rooms.<значение>`. */
export const roomsOptions = ["all", "0", "1", "2", "3", "4"] as const satisfies readonly RoomsFilter[];

/** Подписи — `realestate:filters.feature.<значение>`. */
export const featureOptions = ["all", "terrace", "balcony", "south", "panoramic"] as const satisfies readonly FeatureFilter[];

const matchesRooms = (unit: Unit, rooms: RoomsFilter) =>
  rooms === "all" || (rooms === "4" ? unit.rooms >= 4 : unit.rooms === Number(rooms));

function matchesFeature(unit: Unit, feature: FeatureFilter) {
  switch (feature) {
    case "all":
      return true;
    case "terrace":
      return unit.outdoor?.type === "terrace";
    case "balcony":
      return unit.outdoor?.type === "balcony" || unit.outdoor?.type === "loggia";
    case "south":
      return unit.orientation.startsWith("Юг");
    case "panoramic":
      return unit.hasPanoramicWindows;
  }
}

export const holdOptions = ["all", "today", "unpaid"] as const satisfies readonly HoldFilter[];

/** Конец сегодняшнего дня по местному времени. */
const endOfDay = (now: number) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/**
 * «Истекают сегодня» — бронь с концом срока до полуночи, включая уже истёкшие:
 * по ним тоже нужно действие (продлить или снять). «Ждут предоплату» — предоплата не внесена.
 */
export function matchesHold(unit: Unit, hold: HoldFilter, now: number): boolean {
  if (hold === "all") return true;
  if (unit.status !== "reserved" || !unit.hold) return false;
  if (hold === "unpaid") return unit.hold.awaitingPayment;
  const end = unit.hold.endsAt ? Date.parse(unit.hold.endsAt) : NaN;
  return !Number.isNaN(end) && end <= endOfDay(now);
}

export function countHolds(units: Unit[], now: number): Record<Exclude<HoldFilter, "all">, number> {
  return {
    today: units.filter((u) => matchesHold(u, "today", now)).length,
    unpaid: units.filter((u) => matchesHold(u, "unpaid", now)).length,
  };
}

const inRange = (value: number, range: NumberRange | null) =>
  !range || (value >= range[0] && value <= range[1]);

export const matchesUnitFilters = (unit: Unit, filters: UnitFilters, now = Date.now()) =>
  (filters.status === "all" || unit.status === filters.status) &&
  matchesHold(unit, filters.hold, now) &&
  matchesRooms(unit, filters.rooms) &&
  matchesFeature(unit, filters.feature) &&
  inRange(unit.price, filters.price) &&
  inRange(unit.totalArea, filters.area) &&
  inRange(unit.floor, filters.floor);

/** Активен ли хоть один фильтр, кроме статуса (статус переключается легендой). */
export const hasActiveFilters = (filters: UnitFilters) =>
  filters.rooms !== "all" ||
  filters.feature !== "all" ||
  filters.hold !== "all" ||
  filters.price !== null ||
  filters.area !== null ||
  filters.floor !== null;

export function countByStatus(units: Unit[]): Record<StatusFilter, number> {
  const counts = { all: units.length, free: 0, reserved: 0, sold: 0 };
  for (const unit of units) counts[unit.status]++;
  return counts;
}

// ─── Форматирование ────────────────────────────────────────────────────────

const numberFormat = new Intl.NumberFormat("ru-RU");
const areaFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/**
 * Деньги модуля — целые сомы, как в прототипе: «13 155 000 сом».
 * formatKGS из utility/format не подходит: он пишет «с» и копейки.
 */
export const formatMoney = (value: number) => tt("realestate:fmt.money", { value: numberFormat.format(value) });

export const formatArea = (value: number) => tt("realestate:fmt.area", { value: areaFormat.format(value) });

export const formatRooms = (rooms: number) => (rooms === 0 ? tt("realestate:fmt.studio") : tt("realestate:fmt.rooms", { rooms }));

/** Числа в ячейках и карточке — с точкой, как в прототипе: «16.3 млн», «115.9 м²». */
export const num = (n: number) => String(n);

export const millions = (price: number) => tt("realestate:fmt.millions", { value: (price / 1_000_000).toFixed(1) });

/** Меньше этого срока бронь «горит» — менеджеру пора звонить покупателю. */
export const HOLD_URGENT_MS = 2 * 3_600_000;

export interface HoldLeft {
  /** «5 ч», «40 мин», «истекла». */
  label: string;
  urgent: boolean;
  expired: boolean;
}

/** Сколько осталось до конца брони; null — срок неизвестен. */
export function holdLeft(endsAt: string | null | undefined, now: number): HoldLeft | null {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return { label: tt("realestate:hold.expired"), urgent: true, expired: true };
  const minutes = Math.ceil(ms / 60_000);
  const label =
    minutes < 60
      ? tt("realestate:hold.minutes", { count: minutes })
      : minutes < 48 * 60
        ? tt("realestate:hold.hours", { count: Math.floor(minutes / 60) })
        : tt("realestate:hold.days", { count: Math.floor(minutes / 1440) });
  return { label, urgent: ms < HOLD_URGENT_MS, expired: false };
}

/** Цена за м² в ячейке: «184 тыс./м²». */
export const perSqmShort = (pricePerSqm: number) => tt("realestate:fmt.perSqmShort", { value: Math.round(pricePerSqm / 1000) });

/** «Балкон» / «Лоджия» / «Терраса». */
export const outdoorLabel = (type: OutdoorSpaceType) => tt(`realestate:outdoor.${type}`);
