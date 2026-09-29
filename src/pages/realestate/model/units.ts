import type { Unit, UnitStatus } from "../../../api/realestate";

/** Подписи статусов квартиры: полная — в карточке, короткая — в легенде и ячейке. */
export const unitStatusMeta: Record<UnitStatus, { label: string; short: string }> = {
  free: { label: "Свободна", short: "Свободно" },
  reserved: { label: "Забронирована", short: "Бронь" },
  sold: { label: "Продана", short: "Продано" },
};

export type StatusFilter = "all" | UnitStatus;
/** 'all' | '0'…'3' | '4' (4 и больше) */
export type RoomsFilter = "all" | "0" | "1" | "2" | "3" | "4";
export type FeatureFilter = "all" | "terrace" | "balcony" | "south" | "panoramic";

/** Включительный диапазон [от, до]. */
export type NumberRange = readonly [number, number];

export interface UnitFilters {
  status: StatusFilter;
  rooms: RoomsFilter;
  feature: FeatureFilter;
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
  price: null,
  area: null,
  floor: null,
};

export const statusOptions = ["all", "free", "reserved", "sold"] as const satisfies readonly StatusFilter[];

export const roomsOptions = [
  ["all", "Все"],
  ["0", "Студии"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4+"],
] as const satisfies readonly (readonly [RoomsFilter, string])[];

export const featureOptions = [
  ["all", "Все"],
  ["terrace", "Терраса"],
  ["balcony", "Балкон / лоджия"],
  ["south", "Вид на юг"],
  ["panoramic", "Панорамные окна"],
] as const satisfies readonly (readonly [FeatureFilter, string])[];

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

const inRange = (value: number, range: NumberRange | null) =>
  !range || (value >= range[0] && value <= range[1]);

export const matchesUnitFilters = (unit: Unit, filters: UnitFilters) =>
  (filters.status === "all" || unit.status === filters.status) &&
  matchesRooms(unit, filters.rooms) &&
  matchesFeature(unit, filters.feature) &&
  inRange(unit.price, filters.price) &&
  inRange(unit.totalArea, filters.area) &&
  inRange(unit.floor, filters.floor);

/** Активен ли хоть один фильтр, кроме статуса (статус переключается легендой). */
export const hasActiveFilters = (filters: UnitFilters) =>
  filters.rooms !== "all" ||
  filters.feature !== "all" ||
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
export const formatMoney = (value: number) => `${numberFormat.format(value)} сом`;

export const formatArea = (value: number) => `${areaFormat.format(value)} м²`;

export const formatRooms = (rooms: number) => (rooms === 0 ? "Студия" : `${rooms}-комн.`);

/** Числа в ячейках и карточке — с точкой, как в прототипе: «16.3 млн», «115.9 м²». */
export const num = (n: number) => String(n);

export const millions = (price: number) => `${(price / 1_000_000).toFixed(1)} млн`;

export const outdoorLabel = { balcony: "Балкон", loggia: "Лоджия", terrace: "Терраса" } as const;
