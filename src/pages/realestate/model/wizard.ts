import { sectionKey, type NewProjectInput, type NewUnitInput, type Project, type Unit } from "../../../api/realestate";

/**
 * Мастер «Новый ЖК»: ЖК → корпуса → этажи и квартиры → нумерация и цены →
 * предпросмотр → создание. Здесь — только чистая логика: состояние мастера,
 * проверки по шагам, раскладка квартир и тела запросов к бэку.
 *
 * Контракт — ответ бэка на тикет `MamaDoc/backend_ticket_realty_objects_crud.md`
 * (сверено с кодом test2 01.10.2026):
 * - `POST /projects/` с `sections[]` (`name`, `startFloor`, `floors` — число
 *   этажей секции, `deadline`), без `branchId` — активный филиал сессии;
 * - `POST /units/bulk/` `{projectId, units}` — всё или ничего; номер квартиры
 *   уникален в ЖК, пара «этаж + slot» — тоже в пределах ЖК, номера и цену
 *   считает фронт;
 * - `unit.section` на бэке — `CharField(max_length=16)`, отсюда предел названия корпуса.
 */

export interface WizardUnitType {
  /** 0 — студия. */
  rooms: number;
  /** Общая площадь, м², шаг 0.1. */
  area: number;
}

/** Диапазон этажей с одинаковой раскладкой: «2–10 по 6 квартир». */
export interface WizardFloorRange {
  id: string;
  from: number;
  to: number;
  /** Квартиры этажа слева направо. */
  units: WizardUnitType[];
}

export interface WizardSection {
  id: string;
  name: string;
  /** YYYY-MM-DD; null — срок ЖК. */
  deadline: string | null;
  ranges: WizardFloorRange[];
}

/**
 * - `bySection` — по корпусам: корпус 1 снизу вверх, затем корпус 2 продолжает счёт;
 * - `byFloor` — этаж × 100 + позиция на этаже по всему ЖК: 201, 202…
 */
export type WizardNumbering = "bySection" | "byFloor";

export interface WizardState {
  name: string;
  address: string;
  /** YYYY-MM-DD; null — не задан. */
  deadline: string | null;
  sections: WizardSection[];
  /** Базовая цена за м² (нижний жилой этаж), сом. */
  pricePerSqm: number;
  /** Надбавка за каждый этаж выше нижнего, сом/м². */
  floorStep: number;
  numbering: WizardNumbering;
}

export const WIZARD_STEPS = ["project", "sections", "floors", "prices", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_LIMITS = {
  nameMax: 255,
  sectionNameMax: 16,
  sectionsMax: 20,
  floorMin: 1,
  floorMax: 200,
  unitsPerFloorMax: 20,
  roomsMax: 10,
  areaMin: 10,
  areaMax: 1000,
  totalUnitsMax: 3000,
  /** У нумерации «этаж × 100» позиция на этаже — две цифры. */
  byFloorSlotsMax: 99,
} as const;

let seq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DEFAULT_FLOOR: readonly WizardUnitType[] = [
  { rooms: 1, area: 42 },
  { rooms: 2, area: 64 },
  { rooms: 2, area: 64 },
  { rooms: 3, area: 88 },
];

export function newRange(from: number, to: number, units: readonly WizardUnitType[] = DEFAULT_FLOOR): WizardFloorRange {
  return { id: nextId("r"), from, to, units: units.map((u) => ({ ...u })) };
}

export function newSection(name: string, ranges?: WizardFloorRange[]): WizardSection {
  return { id: nextId("s"), name, deadline: null, ranges: ranges ?? [newRange(2, 9)] };
}

export function initialWizardState(sectionName: string): WizardState {
  return {
    name: "",
    address: "",
    deadline: null,
    sections: [newSection(sectionName)],
    pricePerSqm: 0,
    floorStep: 0,
    numbering: "bySection",
  };
}

/** Новый корпус — копия раскладки последнего: корпуса одного ЖК обычно одинаковые. */
export function cloneSection(source: WizardSection, name: string): WizardSection {
  return newSection(
    name,
    source.ranges.map((r) => newRange(r.from, r.to, r.units)),
  );
}

/** Следующий диапазон — сразу над последним, с той же раскладкой. */
export function nextRange(section: WizardSection): WizardFloorRange {
  const last = section.ranges[section.ranges.length - 1];
  if (!last) return newRange(2, 9);
  const from = Math.min(last.to + 1, WIZARD_LIMITS.floorMax);
  return newRange(from, from, last.units);
}

/** Меняет число квартир на этаже: новые повторяют последнюю, лишние срезаются справа. */
export function resizeFloor(units: WizardUnitType[], count: number): WizardUnitType[] {
  const n = Math.max(1, Math.min(WIZARD_LIMITS.unitsPerFloorMax, Math.round(count) || 1));
  if (n <= units.length) return units.slice(0, n);
  const tail = units[units.length - 1] ?? DEFAULT_FLOOR[0]!;
  return [...units, ...Array.from({ length: n - units.length }, () => ({ ...tail }))];
}

/** Этажи секции: от нижнего до верхнего диапазона (пропуски внутри — этажи без квартир). */
export function sectionFloors(section: WizardSection): { startFloor: number; floors: number } | null {
  if (!section.ranges.length) return null;
  const lo = Math.min(...section.ranges.map((r) => r.from));
  const hi = Math.max(...section.ranges.map((r) => r.to));
  return { startFloor: lo, floors: hi - lo + 1 };
}

export function floorsOfProject(state: WizardState): { lowest: number; highest: number } | null {
  const ranges = state.sections.flatMap((s) => s.ranges);
  if (!ranges.length) return null;
  return { lowest: Math.min(...ranges.map((r) => r.from)), highest: Math.max(...ranges.map((r) => r.to)) };
}

/** Раскладка этажа секции: диапазон, в который попадает этаж; undefined — этаж без квартир. */
function unitsOnFloor(section: WizardSection, floor: number): WizardUnitType[] | undefined {
  return section.ranges.find((r) => floor >= r.from && floor <= r.to)?.units;
}

export const roundArea = (area: number) => Math.round(area * 10) / 10;

/** Цена за м² на этаже: базовая + надбавка за каждый этаж выше нижнего жилого. */
export function pricePerSqmAt(state: WizardState, floor: number, lowestFloor: number): number {
  return Math.round(state.pricePerSqm + state.floorStep * Math.max(0, floor - lowestFloor));
}

export interface PlannedUnit {
  sectionIndex: number;
  sectionName: string;
  floor: number;
  /** Позиция внутри секции на этаже, с 1. */
  position: number;
  /** Сквозная позиция на этаже по всему ЖК, с 1 — `slot` бэка. */
  slot: number;
  number: number;
  rooms: number;
  area: number;
  pricePerSqm: number;
  /** Целые сомы. */
  price: number;
}

/**
 * Все квартиры ЖК по введённым диапазонам. `slot` — сквозной по этажу слева
 * направо через все корпуса: бэк проверяет уникальность «этаж + slot» в пределах ЖК.
 */
export function planUnits(state: WizardState): PlannedUnit[] {
  const bounds = floorsOfProject(state);
  if (!bounds) return [];
  const planned: PlannedUnit[] = [];
  for (let floor = bounds.lowest; floor <= bounds.highest; floor++) {
    let slot = 0;
    state.sections.forEach((section, sectionIndex) => {
      const layout = unitsOnFloor(section, floor);
      if (!layout) return;
      const perSqm = pricePerSqmAt(state, floor, bounds.lowest);
      layout.forEach((type, i) => {
        slot += 1;
        const area = roundArea(type.area);
        planned.push({
          sectionIndex,
          sectionName: section.name.trim(),
          floor,
          position: i + 1,
          slot,
          number: 0,
          rooms: type.rooms,
          area,
          pricePerSqm: perSqm,
          price: Math.round(area * perSqm),
        });
      });
    });
  }
  return numberUnits(planned, state.numbering);
}

function numberUnits(units: PlannedUnit[], numbering: WizardNumbering): PlannedUnit[] {
  if (numbering === "byFloor") return units.map((u) => ({ ...u, number: u.floor * 100 + u.slot }));
  const order = [...units].sort((a, b) => a.sectionIndex - b.sectionIndex || a.floor - b.floor || a.position - b.position);
  const numberOf = new Map(order.map((u, i) => [u, i + 1]));
  return units.map((u) => ({ ...u, number: numberOf.get(u)! }));
}

export interface WizardTotals {
  units: number;
  area: number;
  price: number;
  byRooms: { rooms: number; count: number }[];
}

export function wizardTotals(units: PlannedUnit[]): WizardTotals {
  const rooms = new Map<number, number>();
  for (const u of units) rooms.set(u.rooms, (rooms.get(u.rooms) ?? 0) + 1);
  return {
    units: units.length,
    area: roundArea(units.reduce((sum, u) => sum + u.area, 0)),
    price: units.reduce((sum, u) => sum + u.price, 0),
    byRooms: [...rooms.entries()].sort(([a], [b]) => a - b).map(([r, count]) => ({ rooms: r, count })),
  };
}

// ─── Проверки ──────────────────────────────────────────────────────────────

/** Ошибка шага: код — ключ `realestate:wizard.errors.<code>`, params — подстановки. */
export interface WizardIssue {
  code: string;
  params?: Record<string, string | number>;
}

const normalize = sectionKey;

export function validateStep(state: WizardState, step: WizardStep): WizardIssue[] {
  const L = WIZARD_LIMITS;
  const issues: WizardIssue[] = [];
  if (step === "project") {
    if (!state.name.trim()) issues.push({ code: "nameRequired" });
    if (state.name.trim().length > L.nameMax) issues.push({ code: "nameTooLong", params: { max: L.nameMax } });
    if (state.address.trim().length > L.nameMax) issues.push({ code: "addressTooLong", params: { max: L.nameMax } });
  }
  if (step === "sections") {
    if (!state.sections.length) issues.push({ code: "sectionsRequired" });
    if (state.sections.length > L.sectionsMax) issues.push({ code: "sectionsTooMany", params: { max: L.sectionsMax } });
    const seen = new Set<string>();
    for (const section of state.sections) {
      const name = section.name.trim();
      if (!name) issues.push({ code: "sectionNameRequired" });
      else if (name.length > L.sectionNameMax) issues.push({ code: "sectionNameTooLong", params: { name, max: L.sectionNameMax } });
      else if (seen.has(normalize(name))) issues.push({ code: "sectionNameDuplicate", params: { name } });
      seen.add(normalize(name));
    }
  }
  if (step === "floors") {
    for (const section of state.sections) {
      const name = section.name.trim();
      if (!section.ranges.length) issues.push({ code: "rangesRequired", params: { name } });
      const sorted = [...section.ranges].sort((a, b) => a.from - b.from);
      sorted.forEach((range, i) => {
        if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < L.floorMin || range.to > L.floorMax) {
          issues.push({ code: "floorOutOfBounds", params: { name, min: L.floorMin, max: L.floorMax } });
        } else if (range.from > range.to) {
          issues.push({ code: "floorRangeInverted", params: { name, from: range.from, to: range.to } });
        }
        const prev = sorted[i - 1];
        if (prev && range.from <= prev.to) issues.push({ code: "floorRangesOverlap", params: { name, floor: range.from } });
        if (!range.units.length || range.units.length > L.unitsPerFloorMax) {
          issues.push({ code: "unitsPerFloor", params: { name, max: L.unitsPerFloorMax } });
        }
        for (const unit of range.units) {
          if (!Number.isInteger(unit.rooms) || unit.rooms < 0 || unit.rooms > L.roomsMax) {
            issues.push({ code: "roomsOutOfBounds", params: { name, max: L.roomsMax } });
          }
          if (!(unit.area >= L.areaMin && unit.area <= L.areaMax)) {
            issues.push({ code: "areaOutOfBounds", params: { name, min: L.areaMin, max: L.areaMax } });
          }
        }
      });
    }
    const total = planUnits(state).length;
    if (total > L.totalUnitsMax) issues.push({ code: "totalTooMany", params: { count: total, max: L.totalUnitsMax } });
  }
  if (step === "prices") {
    if (!(state.pricePerSqm > 0)) issues.push({ code: "priceRequired" });
    if (!(state.floorStep >= 0)) issues.push({ code: "floorStepNegative" });
    if (state.numbering === "byFloor") {
      const maxSlot = Math.max(0, ...planUnits(state).map((u) => u.slot));
      if (maxSlot > L.byFloorSlotsMax) issues.push({ code: "byFloorTooWide", params: { count: maxSlot, max: L.byFloorSlotsMax } });
    }
  }
  return dedupe(issues);
}

/** Одинаковые ошибки (площадь у пяти квартир) показываем один раз. */
function dedupe(issues: WizardIssue[]): WizardIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${JSON.stringify(issue.params ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Первый шаг с ошибками — на него возвращаем перед созданием. */
export function firstInvalidStep(state: WizardState): WizardStep | null {
  return WIZARD_STEPS.find((step) => validateStep(state, step).length > 0) ?? null;
}

// ─── Тела запросов ─────────────────────────────────────────────────────────

export function projectBody(state: WizardState): NewProjectInput {
  const bounds = floorsOfProject(state);
  return {
    name: state.name.trim(),
    address: state.address.trim(),
    deadline: state.deadline,
    pricePerSqm: String(Math.round(state.pricePerSqm)),
    startFloor: bounds?.lowest ?? 1,
    floors: bounds?.highest ?? 0,
    sections: state.sections.map((section) => {
      const floors = sectionFloors(section);
      return {
        name: section.name.trim(),
        startFloor: floors?.startFloor ?? 1,
        floors: floors?.floors ?? 0,
        // Срок корпуса не задан — берём срок ЖК, чтобы у корпуса была своя подпись в шахматке.
        deadline: section.deadline ?? state.deadline,
      };
    }),
  };
}

/**
 * Квартиры для `POST /units/bulk/`. `sectionIds` — id созданных секций по
 * названию: бэк отвечает ЖК с `sections[]`, а квартира ссылается на секцию по id.
 */
export function bulkUnitsBody(units: PlannedUnit[], sectionIds: ReadonlyMap<string, number>): NewUnitInput[] {
  return units.map((u) => ({
    number: u.number,
    floor: u.floor,
    slot: u.slot,
    section: u.sectionName,
    sectionId: sectionIds.get(normalize(u.sectionName)) ?? null,
    rooms: u.rooms,
    area: u.area.toFixed(1),
    price: String(u.price),
    pricePerSqm: String(u.pricePerSqm),
  }));
}

// ─── Предпросмотр ──────────────────────────────────────────────────────────

/**
 * ЖК и квартиры в модели шахматки — предпросмотр рисуется тем же `Board`,
 * что и настоящая шахматка, поэтому результат совпадает с тем, что увидят после создания.
 */
export function previewBoardData(state: WizardState, planned: PlannedUnit[]): { project: Project; units: Unit[] } {
  const bounds = floorsOfProject(state);
  const sections = state.sections.map((s) => s.name.trim());
  const project: Project = {
    id: "wizard-preview",
    name: state.name.trim(),
    floorsCount: bounds?.highest ?? 0,
    firstResidentialFloor: bounds?.lowest ?? 1,
    sections,
    finish: "",
    completionLabel: "",
    queue: "",
    stage: "",
    manager: "",
    buildings: sections,
  };
  const units: Unit[] = planned.map((u) => ({
    id: `wizard-${u.floor}-${u.slot}`,
    projectId: project.id,
    section: u.sectionName,
    sectionId: null,
    floor: u.floor,
    position: u.position,
    axis: u.slot,
    number: String(u.number),
    rooms: u.rooms,
    totalArea: u.area,
    livingArea: u.area,
    price: u.price,
    pricePerSqm: u.pricePerSqm,
    status: "free",
    orientation: "Юг",
    view: "",
    outdoor: null,
    ceilingHeight: 0,
    bathrooms: 1,
    isCorner: false,
    hasPanoramicWindows: false,
    roomsBreakdown: [],
    layoutCode: "",
    layoutVariant: 0,
    hold: null,
  }));
  return { project, units };
}
