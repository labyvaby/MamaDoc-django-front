import type { Project, Unit } from "../../../api/realestate";

export type BoardView = "detailed" | "compact";
export const boardViews = ["detailed", "compact"] as const satisfies readonly BoardView[];

export interface BoardSection {
  name: string;
  /** Сколько позиций на самом «широком» этаже секции. */
  columns: number;
  freeCount: number;
  /** unitAt(floor, position) — квартира или undefined, если ячейки нет. */
  unitAt: (floor: number, position: number) => Unit | undefined;
  /** Квартиры секции на этаже слева направо (без пустых позиций). */
  unitsOnFloor: (floor: number) => Unit[];
}

export interface BoardModel {
  /** Этажи сверху вниз. */
  floors: number[];
  sections: BoardSection[];
  /** Все квартиры этажа по порядку секций — строка подробной шахматки. */
  unitsOnFloor: (floor: number) => Unit[];
  /** Сколько квартир на этаже и в каком статусе. */
  floorStats: (floor: number) => FloorStats;
}

export interface FloorStats {
  total: number;
  free: number;
  reserved: number;
  sold: number;
}

export function statsOf(units: Unit[]): FloorStats {
  const stats = { total: units.length, free: 0, reserved: 0, sold: 0 };
  for (const unit of units) stats[unit.status]++;
  return stats;
}

/**
 * Досчитывает по квартирам то, чего бэк не отдаёт в ЖК: секции (в порядке
 * осей слева направо) и первый жилой этаж (`startFloor` бэка = 1, хотя
 * квартиры начинаются выше).
 */
export function withUnitLayout(project: Project, units: Unit[]): Project {
  if (!units.length) return project;
  const firstAxis = new Map<string, number>();
  for (const unit of units) {
    firstAxis.set(unit.section, Math.min(firstAxis.get(unit.section) ?? Infinity, unit.axis));
  }
  const sections = project.sections.length
    ? project.sections
    : [...firstAxis.keys()].sort((a, b) => (firstAxis.get(a) ?? 0) - (firstAxis.get(b) ?? 0));
  const lowestFloor = Math.min(...units.map((u) => u.floor));
  return {
    ...project,
    sections,
    firstResidentialFloor: Math.max(project.firstResidentialFloor, lowestFloor),
  };
}

export function buildBoard(project: Project, units: Unit[]): BoardModel {
  const floors: number[] = [];
  for (let f = project.floorsCount; f >= project.firstResidentialFloor; f--) floors.push(f);

  const sections = project.sections.map((name): BoardSection => {
    const sectionUnits = units.filter((u) => u.section === name);
    const byCell = new Map(sectionUnits.map((u) => [`${u.floor}:${u.position}`, u]));
    return {
      name,
      columns: Math.max(0, ...sectionUnits.map((u) => u.position)),
      freeCount: sectionUnits.filter((u) => u.status === "free").length,
      unitAt: (floor, position) => byCell.get(`${floor}:${position}`),
      unitsOnFloor: (floor) =>
        sectionUnits.filter((u) => u.floor === floor).sort((a, b) => a.position - b.position),
    };
  });

  return {
    floors,
    sections,
    unitsOnFloor: (floor) => sections.flatMap((s) => s.unitsOnFloor(floor)),
    floorStats: (floor) => statsOf(units.filter((u) => u.floor === floor)),
  };
}

/** Выше этого числа колонок подробные ячейки не помещаются на обычный экран. */
const DETAILED_MAX_COLUMNS = 10;

export const autoBoardView = (board: BoardModel): BoardView =>
  board.sections.reduce((sum, s) => sum + s.columns, 0) > DETAILED_MAX_COLUMNS
    ? "compact"
    : "detailed";

export function floorType(project: Project, floor: number) {
  if (floor === project.floorsCount) return "Пентхаусы";
  if (floor >= project.floorsCount - 2) return "Клубный этаж";
  return "Типовой этаж";
}

export interface RangeBounds {
  price: readonly [number, number];
  area: readonly [number, number];
  floor: readonly [number, number];
}

/** Границы ползунков по корпусу: цена — с шагом 0.1 млн, площадь — целые м². */
export function boundsOf(project: Project, units: Unit[]): RangeBounds {
  const prices = units.map((u) => u.price);
  const areas = units.map((u) => u.totalArea);
  return {
    price: [
      Math.floor(Math.min(...prices) / 100_000) * 100_000,
      Math.ceil(Math.max(...prices) / 100_000) * 100_000,
    ],
    area: [Math.floor(Math.min(...areas)), Math.ceil(Math.max(...areas))],
    floor: [project.firstResidentialFloor, project.floorsCount],
  };
}
