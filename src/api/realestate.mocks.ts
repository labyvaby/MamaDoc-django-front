/**
 * Мок-«бэкенд» модуля «Недвижимость»: 3 ЖК, ~500 квартир, брони, договоры и
 * история. Данные детерминированные, изменения живут в памяти до перезагрузки.
 * Генератор и бизнес-правила перенесены из прототипа `crm-building/frontend`
 * (src/mocks/data/seed.ts + db.ts) без изменений, чтобы шахматка совпадала.
 *
 * Наружу отдаются только копии: react-query сравнивает старые и новые данные
 * структурно, и мутация общего объекта «спрятала» бы смену статуса.
 */
import { ApiError } from "./client";
import { CONTRACT_PAYMENT_LABELS, sectionKey, withSectionPositions } from "./realestate";
import type {
  Contract,
  ContractInput,
  MeetingInput,
  NewProjectInput,
  NewUnitInput,
  OperationInput,
  Orientation,
  OutdoorSpace,
  Project,
  ProposalInput,
  Reservation,
  ReserveUnitInput,
  Unit,
  UnitHold,
  UnitDetails,
  UnitEvent,
  UnitOffer,
  UnitRoom,
  UnitStatus,
} from "./realestate";

// ─── Генератор ─────────────────────────────────────────────────────────────

interface ProjectSeed extends Project {
  basePrice: number;
  unitsOnFloor: (floor: number) => number;
  sectionOf: (slot: number, count: number) => { section: string; position: number };
}

const splitInTwo = (slot: number, count: number) => {
  const half = Math.ceil(count / 2);
  return slot <= half ? { section: "А", position: slot } : { section: "Б", position: slot - half };
};

const projectSeeds: ProjectSeed[] = [
  {
    id: "ala",
    name: "Ала-Тоо Residence",
    floorsCount: 14,
    firstResidentialFloor: 2,
    sections: ["А", "Б"],
    finish: "White box",
    completionLabel: "IV квартал 2027",
    queue: "I очередь",
    stage: "Монолитный каркас 9–12 этажи",
    manager: "Анна Котова",
    buildings: ["Корпус А", "Корпус Б"],
    basePrice: 102_000,
    unitsOnFloor: (f) => (f === 14 ? 2 : f === 13 ? 4 : f >= 11 ? 5 : 6),
    sectionOf: splitInTwo,
  },
  {
    id: "ordo",
    name: "Ордо Park",
    floorsCount: 12,
    firstResidentialFloor: 2,
    // Как в прототипе: секции ЖК «Ордо Park» пронумерованы со второй.
    sections: ["2", "3", "4", "5", "6"],
    finish: "Предчистовая",
    completionLabel: "II квартал 2027",
    queue: "II очередь",
    stage: "Утепление и фасад",
    manager: "Дмитрий Орлов",
    buildings: ["Секция 2", "Секция 3", "Секция 4", "Секция 5", "Секция 6"],
    basePrice: 98_000,
    unitsOnFloor: (f) => (f === 12 ? 18 : f >= 10 ? 22 : 24),
    sectionOf: (slot) => ({
      section: String(((slot - 1) % 5) + 2),
      position: Math.floor((slot - 1) / 5) + 1,
    }),
  },
  {
    id: "north",
    name: "Северный квартал",
    floorsCount: 10,
    firstResidentialFloor: 2,
    sections: ["А", "Б"],
    finish: "White box",
    completionLabel: "I квартал 2028",
    queue: "III очередь",
    stage: "Монолитный каркас 5–8 этажи",
    manager: "Игорь Ли",
    buildings: ["Корпус 1", "Корпус 2"],
    basePrice: 95_000,
    unitsOnFloor: (f) => (f === 10 ? 4 : f === 9 ? 5 : f === 8 ? 6 : 8),
    sectionOf: splitInTwo,
  },
];

const orientations: Orientation[] = ["Юг", "Север", "Восток", "Запад", "Юго-восток", "Северо-запад"];
const viewByOrientation: Record<Orientation, string> = {
  Юг: "На горы",
  Север: "На город",
  Восток: "Во двор",
  Запад: "На парк",
  "Юго-восток": "На горы и рассвет",
  "Северо-запад": "На город и закат",
};

const roomTemplates: Record<number, [string, number][]> = {
  0: [
    ["Кухня-гостиная", 0.64],
    ["Прихожая", 0.19],
    ["Санузел", 0.17],
  ],
  1: [
    ["Кухня-гостиная", 0.36],
    ["Спальня", 0.32],
    ["Прихожая", 0.17],
    ["Санузел", 0.15],
  ],
  2: [
    ["Кухня-гостиная", 0.31],
    ["Спальня", 0.22],
    ["Детская", 0.19],
    ["Прихожая", 0.15],
    ["Санузел", 0.13],
  ],
  3: [
    ["Кухня-гостиная", 0.27],
    ["Мастер-спальня", 0.19],
    ["Спальня", 0.16],
    ["Детская", 0.14],
    ["Прихожая", 0.12],
    ["Ванная", 0.07],
    ["Гостевой санузел", 0.05],
  ],
  4: [
    ["Кухня-гостиная", 0.24],
    ["Мастер-спальня", 0.17],
    ["Спальня", 0.14],
    ["Детская", 0.13],
    ["Кабинет", 0.11],
    ["Прихожая", 0.1],
    ["Ванная", 0.06],
    ["Гостевой санузел", 0.05],
  ],
};

const LAYOUT_ROOMS = [0, 1, 1, 2, 2, 3, 3, 4] as const;
const LAYOUT_AREA = [37.8, 46.2, 51.4, 62.8, 69.6, 84.2, 96.5, 118.4] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pick = <T>(list: readonly T[], index: number): T => list[index % list.length]!;

function buildRooms(rooms: number, livingArea: number): UnitRoom[] {
  return (roomTemplates[rooms] ?? roomTemplates[1]!).map(([name, ratio]) => {
    const area = round1(livingArea * ratio);
    const width = round1(Math.sqrt(area / 1.35));
    return { name, area, width, length: round1(area / width) };
  });
}

type DraftUnit = Omit<Unit, "layoutCode">;

function buildUnits(p: ProjectSeed, pi: number): DraftUnit[] {
  const result: DraftUnit[] = [];

  for (let floor = p.firstResidentialFloor; floor <= p.floorsCount; floor++) {
    const count = p.unitsOnFloor(floor);
    const premium = floor >= p.floorsCount - 1;

    for (let si = 0; si < count; si++) {
      const slot = si + 1;
      const layout = premium
        ? count <= 8
          ? Math.min(7, 8 - count + si)
          : 3 + ((si + pi) % 5)
        : (si + pi) % 8;
      const rooms = pick(LAYOUT_ROOMS, layout);
      const hasTerrace = floor === p.floorsCount || (floor === p.floorsCount - 1 && si % 2 === 0);
      const hasBalcony = !hasTerrace && (floor + si + pi) % 4 !== 0;

      let outdoor: OutdoorSpace | null = null;
      if (hasTerrace) outdoor = { type: "terrace", area: pick([18.6, 24.8, 31.2], si + pi) };
      else if (hasBalcony)
        outdoor = {
          type: (floor + si + pi) % 2 === 0 ? "balcony" : "loggia",
          area: pick([3.8, 4.6, 5.4], floor + si),
        };

      const livingArea = round1(pick(LAYOUT_AREA, layout) + (floor % 3) * 0.4);
      const totalArea = round1(livingArea + (outdoor?.area ?? 0));
      const orientation = pick(orientations, floor + si + pi * 2);
      const pricePerSqm =
        p.basePrice +
        floor * 450 +
        (orientation.startsWith("Юг") ? 2800 : 0) +
        (hasTerrace ? 5200 : 0);
      const marker = (floor * slot + pi * 3) % 13;
      const status: UnitStatus =
        marker === 0 || marker === 7 ? "sold" : marker === 1 || marker === 8 ? "reserved" : "free";
      const { section, position } = p.sectionOf(slot, count);

      result.push({
        id: `${p.id}-${floor}-${slot}`,
        // Как в прототипе: <№ ЖК><этаж><место>, 1142 — ЖК 1, 14 этаж, 2 место.
        // В широких корпусах (Ордо Park, до 24 мест на этаже) номера повторяются.
        number: String((pi + 1) * 1000 + floor * 10 + slot),
        projectId: p.id,
        section,
        floor,
        position,
        axis: slot,
        rooms,
        totalArea,
        livingArea,
        price: Math.round((totalArea * pricePerSqm) / 1000) * 1000,
        pricePerSqm,
        status,
        orientation,
        view: viewByOrientation[orientation],
        outdoor,
        ceilingHeight: premium ? 3.3 : 3.0,
        bathrooms: rooms >= 3 ? 2 : 1,
        isCorner: slot === 1 || slot === count,
        hasPanoramicWindows: premium || slot === 1,
        roomsBreakdown: buildRooms(rooms, livingArea),
        layoutVariant: (floor + slot + pi) % 6,
      });
    }
  }

  return result;
}

export const seedProjects: Project[] = projectSeeds.map((p) => ({
  id: p.id,
  name: p.name,
  floorsCount: p.floorsCount,
  firstResidentialFloor: p.firstResidentialFloor,
  sections: p.sections,
  finish: p.finish,
  completionLabel: p.completionLabel,
  queue: p.queue,
  stage: p.stage,
  manager: p.manager,
  buildings: p.buildings,
}));

const layoutPrefix: Record<string, string> = { ala: "AT", ordo: "OP", north: "SK" };

/**
 * Коды типовых планировок: квартиры группируются по ЖК, комнатности, площади
 * (шаг 5 м²), террасе и варианту раскладки; внутри ЖК и комнатности группы
 * получают буквы A, B, C… по возрастанию площади.
 */
function withLayoutCodes(draft: DraftUnit[]): Unit[] {
  const groups = new Map<string, DraftUnit[]>();
  for (const u of draft) {
    const key = [
      u.projectId,
      u.rooms,
      Math.round(u.livingArea / 5) * 5,
      u.outdoor?.type === "terrace" ? "t" : "s",
      u.layoutVariant,
    ].join("-");
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }

  const codeOf = new Map<string, string>();
  const letters = new Map<string, number>();
  const sorted = [...groups.values()].sort(
    (a, b) =>
      a[0]!.projectId.localeCompare(b[0]!.projectId) ||
      a[0]!.rooms - b[0]!.rooms ||
      a[0]!.livingArea - b[0]!.livingArea,
  );
  for (const group of sorted) {
    const { projectId, rooms } = group[0]!;
    const roomKey = `${projectId}-${rooms}`;
    const index = letters.get(roomKey) ?? 0;
    letters.set(roomKey, index + 1);
    const code = `${layoutPrefix[projectId]}-${rooms === 0 ? "ST" : rooms}${String.fromCharCode(65 + index)}`;
    for (const u of group) codeOf.set(u.id, code);
  }

  return draft.map((u) => ({ ...u, layoutCode: codeOf.get(u.id)! }));
}

export const seedUnits: Unit[] = withLayoutCodes(projectSeeds.flatMap(buildUnits));

// ─── Хранилище ─────────────────────────────────────────────────────────────

interface UnitState {
  reservation: Reservation | null;
  contract: Contract | null;
  history: UnitEvent[] | null;
}

let units: Unit[] = [];
let state = new Map<string, UnitState>();
let eventSeq = 0;

/** Сбрасывает изменения — для тестов. */
export function resetRealEstateMocks() {
  units = seedUnits.map((u) => ({ ...u }));
  state = new Map();
  eventSeq = 0;
}
resetRealEstateMocks();

const clone = <T>(value: T): T => structuredClone(value);
const money = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} сом`;
const nowLabel = () =>
  new Date().toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const round1000 = (n: number) => Math.round(n / 1000) * 1000;

/** Нарушение бизнес-правила — как 409 от бэкенда. */
const conflict = (message: string) => new ApiError(message, 409, { detail: message });

export const managers = ["Анна Котова", "Игорь Ли", "Марина Садыкова", "Дмитрий Орлов"];

const findProject = (id: string) => seedProjects.find((p) => p.id === id);

function findUnitOrThrow(id: string): Unit {
  const unit = units.find((u) => u.id === id);
  if (!unit) throw new ApiError("Квартира не найдена", 404, { detail: "Квартира не найдена" });
  return unit;
}

export const listProjects = () => clone(seedProjects);

export function listUnits(projectId: string): Unit[] {
  if (!findProject(projectId)) throw new ApiError("ЖК не найден", 404, { detail: "ЖК не найден" });
  return clone(units.filter((u) => u.projectId === projectId).map((u) => ({ ...u, hold: u.status === "reserved" ? (u.hold ?? seedHold(u)) : null })));
}

/**
 * Мастер «Новый ЖК» на моках: ЖК и квартиры живут в памяти до перезагрузки.
 * Правила бэка повторены те, что видит пользователь: номер уникален в ЖК.
 */
export function createProject(
  input: NewProjectInput,
  unitsFor: (sectionIds: ReadonlyMap<string, number>) => NewUnitInput[],
): { projectId: string; created: number } {
  const projectId = `mock-${seedProjects.length + 1}-${Date.now().toString(36)}`;
  const sectionIds = new Map(input.sections.map((s, i) => [sectionKey(s.name), i + 1]));
  const rows = unitsFor(sectionIds);
  const numbers = new Set<number>();
  for (const row of rows) {
    if (numbers.has(row.number)) throw new ApiError(`Квартира №${row.number} уже есть в этом ЖК.`, 400, { detail: "duplicate" });
    numbers.add(row.number);
  }
  const names = input.sections.map((s) => s.name);
  seedProjects.push({
    id: projectId,
    name: input.name,
    floorsCount: input.floors,
    firstResidentialFloor: input.startFloor,
    sections: names,
    finish: "",
    completionLabel: "",
    queue: "",
    stage: "",
    manager: "",
    buildings: names,
  });
  // position внутри корпуса считается так же, как для ответа бэка.
  units.push(
    ...withSectionPositions(rows.map((row, i): Unit => ({
      id: `${projectId}-${i + 1}`,
      projectId,
      section: row.section,
      sectionId: null,
      floor: row.floor,
      position: row.slot,
      axis: row.slot,
      number: String(row.number),
      rooms: row.rooms,
      totalArea: Number(row.area),
      livingArea: Number(row.area),
      price: Number(row.price),
      pricePerSqm: Number(row.pricePerSqm),
      status: "free",
      orientation: "Юг",
      view: "",
      outdoor: null,
      ceilingHeight: 3,
      bathrooms: row.rooms >= 3 ? 2 : 1,
      isCorner: false,
      hasPanoramicWindows: false,
      roomsBreakdown: [],
      layoutCode: "",
      layoutVariant: 0,
    }))),
  );
  return { projectId, created: rows.length };
}

/** Бронь из сида: срок от 1 до 47 часов, у чётных номеров — ждёт предоплату. */
function seedHold(unit: Unit): UnitHold {
  const n = Number(unit.number);
  return { endsAt: new Date(Date.now() + ((n % 47) + 1) * 3_600_000).toISOString(), awaitingPayment: n % 2 === 0 };
}

function stateOf(unit: Unit): UnitState {
  let s = state.get(unit.id);
  if (!s) {
    s = { reservation: null, contract: null, history: null };
    state.set(unit.id, s);
  }
  return s;
}

const projectOf = (unit: Unit): Project => findProject(unit.projectId)!;

/** История создаётся лениво: каталог → бронь → продажа. */
function historyOf(unit: Unit): UnitEvent[] {
  const s = stateOf(unit);
  if (s.history) return s.history;
  const p = projectOf(unit);
  const buyer =
    s.reservation?.buyer ??
    s.contract?.buyer ??
    ["Айжан Исакова", "Нурбек Асанов", "Алина Ибраимова"][(unit.floor + unit.axis) % 3]!;
  const history: UnitEvent[] = [
    {
      id: `e${++eventSeq}`,
      type: "inventory",
      title: "Квартира добавлена в каталог",
      date: "12.08.2026, 09:15",
      actor: "Система",
      buyer: "—",
      stage: "Доступна к продаже",
      details: `ЖК «${p.name}», ${unit.floor} этаж, секция ${unit.section}. Стартовая цена ${money(unit.price)}.`,
    },
  ];
  if (unit.status !== "free")
    history.unshift({
      id: `e${++eventSeq}`,
      type: "reserve",
      title: "Бронь квартиры",
      date: "18.08.2026, 11:40",
      actor: p.manager,
      buyer,
      stage: "Бронь создана",
      details: `${s.reservation?.type === "prepaid" ? "Бронь с предоплатой" : "Бесплатная бронь"} на 48 часов. Телефон покупателя: ${s.reservation?.phone ?? "+996 555 240 118"}.`,
    });
  if (unit.status === "sold")
    history.unshift({
      id: `e${++eventSeq}`,
      type: "sale",
      title: "Квартира продана",
      date: "20.08.2026, 16:25",
      actor: p.manager,
      buyer,
      stage: "Договор подписан",
      details: `Стоимость сделки ${money(unit.price)}. Договор ${s.contract?.number ?? `ДКП-2026-${unit.number}`}.`,
    });
  s.history = history;
  return history;
}

function addEvent(unit: Unit, event: Omit<UnitEvent, "id" | "date">) {
  historyOf(unit).unshift({ id: `e${++eventSeq}`, date: nowLabel(), ...event });
}

const projectOffer = (projectId: string) =>
  projectId === "ala"
    ? {
        badge: "Рассрочка 0%",
        title: "Без переплаты на 24 месяца",
        until: "До 31 августа",
        text: "Первый взнос 30%. Цена квартиры фиксируется после бронирования.",
      }
    : projectId === "ordo"
      ? {
          badge: "Первый взнос 20%",
          title: "Пониженный первый взнос",
          until: "До 15 сентября",
          text: "Остаток можно внести равными платежами до сдачи дома.",
        }
      : {
          badge: "Старт продаж",
          title: "Цена первого пула квартир",
          until: "До 10 сентября",
          text: "Специальная цена действует на ограниченное число свободных квартир.",
        };

function offersOf(unit: Unit): UnitOffer[] {
  const base = projectOffer(unit.projectId);
  return [
    { id: "installment", tone: "green", icon: "0%", discount: 0, ...base },
    {
      id: "storage",
      tone: "orange",
      icon: "%",
      badge: "Кладовая в комплекте",
      title: "Скидка при покупке кладовой",
      discount: Math.min(250_000, round1000(unit.price * 0.025)),
      until: "До 31 декабря",
      text: "Выберите квартиру и кладовую в одной сделке — скидка фиксируется после бронирования.",
    },
    {
      id: "meter",
      tone: "violet",
      icon: "м²",
      badge: "Скидка за площадь",
      title: "5 000 сом за каждый м²",
      discount: round1000(unit.totalArea * 5000),
      until: "Ещё 45 дней",
      text: "Скидка рассчитывается автоматически от общей площади выбранной квартиры.",
    },
    {
      id: "full",
      tone: "blue",
      icon: "⚡",
      badge: "Полная оплата",
      title: "Скидка 4% при полной оплате",
      discount: round1000(unit.price * 0.04),
      until: "До 15 сентября",
      text: "Максимальная выгода при оплате полной стоимости после подписания договора.",
    },
  ];
}

function unitDetails(unit: Unit): UnitDetails {
  const p = projectOf(unit);
  const s = stateOf(unit);
  const sectionIndex = Math.max(0, p.sections.indexOf(unit.section));
  return clone({
    ...unit,
    building: p.buildings[sectionIndex] ?? `Секция ${unit.section}`,
    externalId: `00-${String(320000 + Number(unit.number)).padStart(8, "0")}`,
    reservation: s.reservation,
    contract: s.contract,
    history: historyOf(unit),
    offers: offersOf(unit),
  });
}

export const getUnitDetails = (unitId: string) => unitDetails(findUnitOrThrow(unitId));

// ─── Команды ───────────────────────────────────────────────────────────────

export const PREPAYMENT = 50_000;

export function reserve(unitId: string, input: ReserveUnitInput): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  if (unit.status !== "free") throw conflict("Квартира уже недоступна");
  const p = projectOf(unit);
  const offer = offersOf(unit).find((o) => o.id === input.offerId) ?? offersOf(unit)[2]!;
  const finalPrice = Math.max(0, unit.price - offer.discount);
  const amount = input.type === "prepaid" ? PREPAYMENT : 0;
  const expiresAt = new Date(Date.now() + input.termHours * 3_600_000).toLocaleString("ru-RU");
  historyOf(unit);
  unit.status = "reserved";
  unit.hold = { endsAt: new Date(Date.now() + input.termHours * 3_600_000).toISOString(), awaitingPayment: amount > 0 };
  stateOf(unit).reservation = {
    id: `r-${unit.id}-${Date.now()}`,
    buyer: input.buyer,
    phone: input.phone,
    type: input.type,
    termHours: input.termHours,
    amount,
    paymentStatus: amount ? "pending" : "not_required",
    expiresAt,
    offerId: offer.id,
    finalPrice,
  };
  addEvent(unit, {
    type: "reserve",
    title: "Квартира забронирована",
    actor: p.manager,
    buyer: input.buyer,
    stage: amount ? "Ожидается предоплата" : "Бесплатная бронь",
    details: `Бронь на ${input.termHours} часов до ${expiresAt}. Акция: ${offer.title}. Цена по акции: ${money(finalPrice)}. Телефон покупателя: ${input.phone}.`,
  });
  if (input.meetingAt) addMeeting(unit, { buyer: input.buyer, meetingAt: input.meetingAt });
  return unitDetails(unit);
}

export function confirmPrepayment(unitId: string): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  const reservation = stateOf(unit).reservation;
  if (!reservation || reservation.paymentStatus !== "pending")
    throw conflict("Нет ожидающей предоплаты");
  reservation.paymentStatus = "paid";
  if (unit.hold) unit.hold = { ...unit.hold, awaitingPayment: false };
  addEvent(unit, {
    type: "payment",
    title: "Предоплата за бронь получена",
    actor: "Касса CRM",
    buyer: reservation.buyer,
    stage: "Оплачено",
    details: `Получена предоплата ${money(reservation.amount)} по QR. Сумма зачтена в стоимость квартиры.`,
  });
  return unitDetails(unit);
}

export function extendReservation(unitId: string, hours: number): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  const reservation = stateOf(unit).reservation;
  if (unit.status !== "reserved" || !reservation) throw conflict("Бронь уже снята");
  const base = unit.hold?.endsAt ? new Date(unit.hold.endsAt).getTime() : Date.now();
  const endsAt = new Date(Math.max(base, Date.now()) + hours * 3_600_000);
  unit.hold = { endsAt: endsAt.toISOString(), awaitingPayment: unit.hold?.awaitingPayment ?? false };
  reservation.termHours += hours;
  reservation.expiresAt = endsAt.toLocaleString("ru-RU");
  addEvent(unit, {
    type: "reserve",
    title: "Бронь продлена",
    actor: projectOf(unit).manager,
    buyer: reservation.buyer,
    stage: `+${hours} ч`,
    details: `Бронь продлена до ${reservation.expiresAt}.`,
  });
  return unitDetails(unit);
}

function addMeeting(unit: Unit, input: { buyer: string; meetingAt: string; note?: string }) {
  const date = new Date(input.meetingAt);
  const when = Number.isNaN(date.getTime()) ? input.meetingAt : date.toLocaleString("ru-RU");
  addEvent(unit, {
    type: "meeting",
    title: "Назначена встреча",
    actor: projectOf(unit).manager,
    buyer: input.buyer,
    stage: "Задача создана",
    details: input.note
      ? `Встреча ${when}. Комментарий: ${input.note}`
      : `Встреча назначена на ${when}.`,
  });
}

export function scheduleMeeting(unitId: string, input: MeetingInput): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  addMeeting(unit, input);
  return unitDetails(unit);
}

export function sendProposal(unitId: string, input: ProposalInput): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  const offer = offersOf(unit).find((o) => o.id === input.offerId) ?? offersOf(unit)[2]!;
  const finalPrice = Math.max(0, unit.price - offer.discount);
  addEvent(unit, {
    type: "proposal",
    title: "КП отправлено в WhatsApp",
    actor: projectOf(unit).manager,
    buyer: stateOf(unit).reservation?.buyer ?? "Покупатель",
    stage: "Отправлено",
    details: `Получатель: ${input.phone}. Акция: ${offer.title}, цена ${money(finalPrice)}. ${input.includePlan ? "Приложены планировка и схема этажа." : "Отправлено описание и цена квартиры."}`,
  });
  return unitDetails(unit);
}

/** Возвращает карточку квартиры, которую нужно показать после операции. */
export function runOperation(unitId: string, input: OperationInput): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  const s = stateOf(unit);
  const buyer = input.buyer || s.reservation?.buyer || s.contract?.buyer || "—";
  historyOf(unit);

  switch (input.operation) {
    case "cancel": {
      if (unit.status !== "reserved") throw conflict("Квартира не в брони");
      unit.status = "free";
      s.reservation = null;
      addEvent(unit, {
        type: "cancel",
        title: "Бронь снята",
        actor: input.actor,
        buyer,
        stage: "Квартира снова свободна",
        details: `Причина: ${input.comment}`,
      });
      return unitDetails(unit);
    }
    case "refund": {
      if (unit.status !== "sold") throw conflict("Квартира не продана");
      unit.status = "free";
      s.contract = null;
      addEvent(unit, {
        type: "refund",
        title: "Оформлен возврат квартиры",
        actor: input.actor,
        buyer,
        stage: "Возврат завершён",
        details: `Сделка отменена. Причина: ${input.comment}`,
      });
      return unitDetails(unit);
    }
    case "exchange": {
      const target = units.find((u) => u.id === input.targetUnitId && u.status === "free");
      if (!target) throw conflict("Выберите свободную квартиру для обмена");
      if (unit.status === "free") throw conflict("Свободную квартиру нельзя обменять");
      historyOf(target);
      const t = stateOf(target);
      target.status = unit.status;
      t.reservation = s.reservation && { ...s.reservation };
      t.contract = s.contract && { ...s.contract };
      unit.status = "free";
      s.reservation = null;
      s.contract = null;
      addEvent(unit, {
        type: "exchange",
        title: "Квартира заменена в сделке",
        actor: input.actor,
        buyer,
        stage: `Обмен на квартиру №${target.number}`,
        details: `Квартира №${unit.number} освобождена. Причина: ${input.comment}`,
      });
      addEvent(target, {
        type: "exchange",
        title: "Квартира добавлена по обмену",
        actor: input.actor,
        buyer,
        stage: `Вместо квартиры №${unit.number}`,
        details: `Статус сделки перенесён на квартиру №${target.number}. ${input.comment}`,
      });
      return unitDetails(target);
    }
    case "note": {
      addEvent(unit, {
        type: "note",
        title: "Служебная запись",
        actor: input.actor,
        buyer,
        stage: "Комментарий",
        details: input.comment,
      });
      return unitDetails(unit);
    }
  }
}

/** Демо-код электронной подписи. */
export const SIGN_CODE = "4826";

export function signContract(unitId: string, input: ContractInput): UnitDetails {
  const unit = findUnitOrThrow(unitId);
  if (unit.status !== "reserved") throw conflict("Договор можно подписать только по брони");
  if (input.signCode !== SIGN_CODE) throw conflict("Неверный код подписи");
  historyOf(unit);
  const s = stateOf(unit);
  unit.status = "sold";
  s.contract = {
    number: `ДКП-${new Date().getFullYear()}-${unit.number}`,
    buyer: input.buyer,
    payment: CONTRACT_PAYMENT_LABELS[input.payment],
    price: stateOf(unit).reservation?.finalPrice || unit.price,
    signedAt: new Date().toLocaleString("ru-RU"),
  };
  addEvent(unit, {
    type: "sale",
    title: "Квартира продана",
    actor: projectOf(unit).manager,
    buyer: input.buyer,
    stage: "Договор подписан",
    details: `Договор ${s.contract.number}. Стоимость ${money(unit.price)}. Способ оплаты: ${CONTRACT_PAYMENT_LABELS[input.payment]}.`,
  });
  return unitDetails(unit);
}
