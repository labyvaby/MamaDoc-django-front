import type { Project, Unit } from "../../../api/realestate";
import { tt } from "../../../i18n/t";

export type BoardView = "detailed" | "compact";
export const boardViews = ["detailed", "compact"] as const satisfies readonly BoardView[];

/** Чем красить ячейки: статусом продажи или ценой за м² (тепловая карта). */
export type BoardPaint = "status" | "price";
export const boardPaints = ["status", "price"] as const satisfies readonly BoardPaint[];

export const PRICE_STEPS = 5;

export interface PriceScale {
  /** Ступень 0…PRICE_STEPS-1: 0 — самые дешёвые за м². */
  stepOf: (pricePerSqm: number) => number;
  /** Границы ступеней, сом/м²: [от, до] для легенды. */
  ranges: (readonly [number, number])[];
}

/**
 * Шкала тепловой карты по квантилям, а не по равным отрезкам: при перекосе
 * (пара дорогих пентхаусов) линейная шкала красила бы почти всё в одну ступень.
 */
export function priceScale(units: Unit[]): PriceScale {
  const values = units.map((u) => u.pricePerSqm).filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return { stepOf: () => 0, ranges: [] };
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!;
  const cuts = Array.from({ length: PRICE_STEPS - 1 }, (_, i) => at((i + 1) / PRICE_STEPS));
  const stepOf = (v: number) => {
    let step = 0;
    while (step < cuts.length && v >= cuts[step]!) step++;
    return step;
  };
  const edges = [values[0]!, ...cuts, values[values.length - 1]!];
  const ranges = edges.slice(0, -1).map((lo, i) => [lo, edges[i + 1]!] as const);
  return { stepOf, ranges };
}

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
 * Квартира находит свою секцию ЖК по `sectionId`, а не по совпадению строк:
 * так шахматка не опустеет, если названия у ЖК и у квартир разойдутся.
 */
export function withProjectSections(project: Project, units: Unit[]): Unit[] {
  const names = new Map((project.sectionRefs ?? []).map((ref) => [ref.id, ref.name]));
  if (!names.size) return units;
  return units.map((unit) => {
    const name = unit.sectionId ? names.get(unit.sectionId) : undefined;
    return name && name !== unit.section ? { ...unit, section: name } : unit;
  });
}

/** Срок сдачи секции квартиры; у ЖК без секций — общий срок ЖК. */
export function completionOf(project: Project, unit: Pick<Unit, "section" | "sectionId">): string {
  const ref = project.sectionRefs?.find((s) => (unit.sectionId ? s.id === unit.sectionId : s.name === unit.section));
  return ref?.completionLabel || project.completionLabel;
}

/** «А» → «Секция А»; полное название от бэка («Корпус А») — как есть. */
export const sectionLabel = (name: string) => (/\s/.test(name.trim()) ? name : tt("realestate:section.short", { name }));

/**
 * Досчитывает по квартирам то, чего бэк не отдаёт в ЖК: секции (в порядке
 * осей слева направо) и первый жилой этаж (`startFloor` бэка = 1, хотя
 * квартиры начинаются выше).
 *
 * Секциям ЖК верим, только если в них попадает каждая квартира: на test2
 * 29.09.2026 у ЖК «Корпус А», а у квартир `section: "А"` — без проверки
 * шахматка пустая, хотя квартиры есть.
 */
export function withUnitLayout(project: Project, units: Unit[]): Project {
  if (!units.length) return project;
  const firstAxis = new Map<string, number>();
  for (const unit of units) {
    firstAxis.set(unit.section, Math.min(firstAxis.get(unit.section) ?? Infinity, unit.axis));
  }
  const coversUnits = [...firstAxis.keys()].every((name) => project.sections.includes(name));
  const sections = coversUnits
    ? project.sections
    : [...firstAxis.keys()].sort((a, b) => (firstAxis.get(a) ?? 0) - (firstAxis.get(b) ?? 0));
  const lowestFloor = Math.min(...units.map((u) => u.floor));
  return {
    ...project,
    sections,
    firstResidentialFloor: Math.max(project.firstResidentialFloor, lowestFloor),
  };
}

/**
 * Этажи и секции без квартир в шахматку не попадают: у ЖК на test2 (30.09.2026)
 * 5 этажей, а квартиры только на первом — иначе рисуются четыре пустые строки.
 */
export function buildBoard(project: Project, units: Unit[]): BoardModel {
  const occupied = new Set(units.map((u) => u.floor));
  const floors: number[] = [];
  for (let f = project.floorsCount; f >= project.firstResidentialFloor; f--) if (occupied.has(f)) floors.push(f);

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
  }).filter((section) => section.columns > 0);

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

/** Правило бэка (`realty/selectors.floor_type`), во множественном числе для шахматки. */
export function floorType(project: Project, floor: number) {
  if (floor === project.floorsCount) return tt("realestate:floorType.penthouses");
  if (floor >= project.floorsCount - 2) return tt("realestate:floorType.club");
  return tt("realestate:floorType.typical");
}

export interface ProjectFacts {
  sections: number;
  /** Нижний и верхний жилой этаж, где есть квартиры. */
  floors: NumberPair;
  /** Сроки сдачи без повторов, в порядке секций. */
  completion: string[];
  /** Цена за м², сом: от и до. */
  pricePerSqm: NumberPair;
}

type NumberPair = readonly [number, number];

/** Факты о ЖК для шапки шахматки — то, чего не видно в самой сетке. */
export function projectFacts(project: Project, board: BoardModel, units: Unit[]): ProjectFacts {
  const refs = project.sectionRefs ?? [];
  const shown = new Set(board.sections.map((s) => s.name));
  const labels = refs.length
    ? refs.filter((ref) => shown.has(ref.name)).map((ref) => ref.completionLabel || project.completionLabel)
    : [project.completionLabel];
  const prices = units.map((u) => u.pricePerSqm).filter((v) => v > 0);
  return {
    sections: board.sections.length,
    floors: [board.floors[board.floors.length - 1] ?? 0, board.floors[0] ?? 0],
    completion: [...new Set(labels.filter(Boolean))],
    pricePerSqm: prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0],
  };
}

const thousands = (v: number) => `${Math.round(v / 1000)}`;

/** «2 корпуса · этажи 2–14 · сдача I квартал 2027 · 102–118 тыс. сом/м²». */
export function factsLine(facts: ProjectFacts, sectionNames: string[]): string {
  // «Корпус» — по названию секций от бэка (данные), а не по тексту интерфейса.
  const isBuilding = sectionNames.length > 0 && sectionNames.every((name) => /^корпус/i.test(name.trim()));
  const count = facts.sections;
  const parts = [
    tt(isBuilding ? "realestate:facts.buildings" : "realestate:facts.sections", { count }),
    facts.floors[0] === facts.floors[1]
      ? tt("realestate:facts.floor", { floor: facts.floors[0] })
      : tt("realestate:facts.floors", { from: facts.floors[0], to: facts.floors[1] }),
  ];
  if (facts.completion.length) parts.push(tt("realestate:facts.completion", { value: facts.completion.join(" / ") }));
  const [lo, hi] = facts.pricePerSqm;
  if (hi > 0) parts.push(tt("realestate:facts.perSqm", { value: lo === hi ? thousands(lo) : `${thousands(lo)}–${thousands(hi)}` }));
  return parts.join(" · ");
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
