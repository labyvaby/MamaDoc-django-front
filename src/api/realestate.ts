import dayjs from "dayjs";

import { apiRequest } from "./client";
import * as mock from "./realestate.mocks";
import { mockDelay } from "./mockUtils";

/**
 * Модуль «Недвижимость» (вертикаль realestate): шахматка квартир застройщика,
 * карточка квартиры и сделки по ней: бронь, предоплата, КП, встреча,
 * договор и операции.
 *
 * Модуль перенесён 27.09.2026 из `crm-building/frontend`, отдельного
 * прототипа AIVIO ERP (контракт прототипа — `docs/api-chessboard.md` там).
 * Бэк реализовал его под `/api/v2/realty/` — проверено на test2.crm.operator.kg
 * 28.09.2026 (орг 58 «AIVIO Тест (Застройщик)»): модуль `realty`, права
 * `realty.view` / `realty.manage`. Гайд бэка писал пути без `v2` и фильтр
 * `project_id` — оба неверны. Swagger схемы по адресам гайда нет, поэтому
 * формы ответов сняты с живых ответов, а не со схемы.
 *
 * Ответ бэка приводится к модели прототипа переходниками `from*` ниже:
 * id → строки, деньги (строки-decimal) → числа, ISO-даты → «28.09.2026 14:05».
 * Интерфейс шахматки от формы ответа не зависит.
 *
 * Открытые вопросы бэку — предположения фронта, не факты контракта:
 * - тело команд взято из контракта прототипа; бэк подтвердил только первое
 *   обязательное поле (reserve/sell/meetings — `buyer`, proposals — `phone`,
 *   operations — `operation`). Бронь отдаёт срок как `term`, а принимает ли
 *   `termHours` — неизвестно, шлём оба;
 * - подтверждения предоплаты нет (404 на reservation/payment и вариантах);
 * - списка менеджеров нет (managers/users/employees — 404), «Ответственный»
 *   в операции вводится текстом;
 * - у ЖК `sections: []`, `buildings` — число: секции берём из квартир
 *   (`withUnitLayout`), а в каком доме секция — не знаем, `building` пуст;
 * - `slot` — сквозная позиция по этажу (ось); место внутри секции считаем
 *   сами от левого края секции;
 * - `startFloor = 1`, но квартиры с 2-го этажа: первый жилой этаж — по квартирам;
 * - код планировки только в `/layouts/` (через `unitIds`), идентификатора 1С нет;
 * - ответ команды считаем свежей карточкой, как в прототипе; если придёт
 *   что-то другое — перечитываем карточку.
 */
export const REALESTATE_USE_MOCKS = false;

const REALTY_API = "/v2/realty";

// ─── Модель ────────────────────────────────────────────────────────────────

/** Жилой комплекс (корпус), по которому строится шахматка. */
export interface Project {
  id: string;
  name: string;
  /** Номер верхнего этажа. */
  floorsCount: number;
  /** Первый жилой этаж (ниже — коммерция/паркинг). */
  firstResidentialFloor: number;
  /** Секции (подъезды) в порядке отображения слева направо. */
  sections: string[];
  finish: string;
  /** Срок сдачи, человекочитаемо: «IV квартал 2027». */
  completionLabel: string;
  /** «I очередь». */
  queue: string;
  /** Текущая стадия строительства. */
  stage: string;
  /** Ответственный менеджер отдела продаж. */
  manager: string;
  /** Названия домов по порядку секций: секция [i] находится в доме buildings[i]. */
  buildings: string[];
}

export type UnitStatus = "free" | "reserved" | "sold";

export type Orientation = "Юг" | "Север" | "Восток" | "Запад" | "Юго-восток" | "Северо-запад";

export type OutdoorSpaceType = "balcony" | "loggia" | "terrace";

export interface OutdoorSpace {
  type: OutdoorSpaceType;
  /** м² */
  area: number;
}

export interface UnitRoom {
  name: string;
  /** м² */
  area: number;
  /** Размеры помещения в метрах. */
  width: number;
  length: number;
}

/** Квартира. Площади — м² с точностью 0.1, деньги — целые сомы. */
export interface Unit {
  id: string;
  projectId: string;
  section: string;
  floor: number;
  /** Позиция на этаже внутри секции, с 1 слева направо. */
  position: number;
  /** Сквозная позиция на этаже (ось), с 1 слева направо по всему корпусу. */
  axis: number;
  /** Номер квартиры для людей. */
  number: string;
  /** Количество комнат, 0 — студия. */
  rooms: number;
  totalArea: number;
  livingArea: number;
  price: number;
  pricePerSqm: number;
  status: UnitStatus;
  orientation: Orientation;
  view: string;
  outdoor: OutdoorSpace | null;
  ceilingHeight: number;
  bathrooms: number;
  isCorner: boolean;
  hasPanoramicWindows: boolean;
  roomsBreakdown: UnitRoom[];
  /** Код типовой планировки, например «AT-4B». */
  layoutCode: string;
  /** Вариант раскладки комнат на схеме планировки, 0…5. */
  layoutVariant: number;
}

export type ReservationType = "free" | "prepaid";

export interface Reservation {
  buyer: string;
  phone: string;
  type: ReservationType;
  termHours: number;
  /** Предоплата, сом; 0 — бесплатная бронь. */
  amount: number;
  paymentStatus: "pending" | "paid" | "not_required";
  expiresAt: string;
  offerId: string;
  finalPrice: number;
}

export interface Contract {
  number: string;
  buyer: string;
  payment: string;
  signedAt: string;
}

export type UnitEventType =
  | "inventory"
  | "reserve"
  | "cancel"
  | "payment"
  | "meeting"
  | "proposal"
  | "sale"
  | "refund"
  | "exchange"
  | "note";

/** Событие аудита квартиры. Даты — строки для людей, как их отдаёт бэкенд. */
export interface UnitEvent {
  id: string;
  type: UnitEventType;
  title: string;
  date: string;
  actor: string;
  buyer: string;
  stage: string;
  details: string;
}

export type OfferTone = "green" | "orange" | "violet" | "blue";

/** Акция, применимая к квартире. `discount` — сомы, 0 — выгода не в цене (рассрочка). */
export interface UnitOffer {
  id: string;
  tone: OfferTone;
  icon: string;
  badge: string;
  title: string;
  discount: number;
  until: string;
  text: string;
}

/** Карточка квартиры: модель списка + тяжёлые поля. */
export interface UnitDetails extends Unit {
  /** Название дома/корпуса, где секция: «Корпус Б». */
  building: string;
  /** Идентификатор в 1С. */
  externalId: string;
  reservation: Reservation | null;
  contract: Contract | null;
  /** Сначала новые. */
  history: UnitEvent[];
  offers: UnitOffer[];
}

// ─── Команды ───────────────────────────────────────────────────────────────

export interface ReserveUnitInput {
  buyer: string;
  phone: string;
  termHours: number;
  type: ReservationType;
  offerId: string;
  /** null — без задачи «Встреча». */
  meetingAt: string | null;
}

export interface MeetingInput {
  buyer: string;
  phone: string;
  meetingAt: string;
  note: string;
}

export interface ProposalInput {
  phone: string;
  includePlan: boolean;
  offerId: string;
}

export type UnitOperation = "cancel" | "refund" | "exchange" | "note";

export interface OperationInput {
  operation: UnitOperation;
  actor: string;
  buyer: string;
  targetUnitId: string | null;
  comment: string;
}

export interface ContractInput {
  buyer: string;
  passport: string;
  phone: string;
  email: string;
  payment: string;
  signCode: string;
}

// ─── Ответ бэка (/api/v2/realty) ───────────────────────────────────────────

/** Деньги бэк отдаёт строкой-decimal: «6681000.00». */
type Decimal = string;

export interface RawProject {
  id: number;
  name: string;
  queue: string;
  stage: string;
  floors: number;
  startFloor: number;
  /** На test2 пустой массив; форма элемента неизвестна. */
  sections: unknown[];
  finish: string;
  deadlineLabel: string;
  manager: string | null;
}

export interface RawRoom {
  name?: string;
  area?: number;
  width?: number;
  length?: number;
}

export interface RawReservation {
  buyer: string;
  phone: string;
  type: ReservationType;
  /** Часы. */
  term: number;
  amount: Decimal;
  paymentStatus: Reservation["paymentStatus"];
  expiresAt: string;
  offerId: string;
  finalPrice: Decimal;
}

export interface RawContract {
  number: string;
  buyer: string;
  payment: string;
  paymentLabel?: string;
  signedAt: string;
}

export interface RawUnit {
  id: number;
  projectId: number;
  number: number | string;
  floor: number;
  /** Сквозная позиция на этаже по всему корпусу, с 1 слева. */
  slot: number;
  section: string;
  rooms: number;
  area: number;
  insideArea: number;
  price: Decimal;
  pricePerSqm: Decimal;
  status: UnitStatus;
  orientation: Orientation;
  view: string;
  balconyType: "balcony" | "loggia" | null;
  balconyArea: number | null;
  terrace: unknown;
  terraceArea: number | null;
  ceiling: number;
  bathrooms: number;
  panoramic: boolean;
  corner: boolean;
  roomData: RawRoom[];
  layoutVariant: number;
  reservation: RawReservation | null;
  contract: RawContract | null;
}

export interface RawEvent {
  id: number | string;
  type: UnitEventType;
  title: string;
  date: string;
  actor: string | null;
  buyer: string | null;
  stage: string | null;
  details: string | null;
}

export interface RawOffer {
  id: string;
  tone: OfferTone;
  icon: string;
  badge: string;
  title: string;
  discount: Decimal;
  until: string;
  text: string;
}

export interface RawUnitDetails extends RawUnit {
  history: RawEvent[];
  offers: RawOffer[];
}

export interface RawLayout {
  code: string;
  projectId: number;
  unitIds: number[];
}

// ─── Переходники ───────────────────────────────────────────────────────────

const toMoney = (value: Decimal | number | null | undefined) => Math.round(Number(value ?? 0)) || 0;

/** ISO → «28.09.2026 14:05»; не-ISO строку оставляем как есть. */
function toHumanDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = dayjs(value);
  return date.isValid() ? date.format("DD.MM.YYYY HH:mm") : value;
}

export function fromRawProject(raw: RawProject): Project {
  return {
    id: String(raw.id),
    name: raw.name,
    floorsCount: raw.floors,
    firstResidentialFloor: raw.startFloor,
    sections: raw.sections.filter((s): s is string => typeof s === "string"),
    finish: raw.finish,
    completionLabel: raw.deadlineLabel,
    queue: raw.queue,
    stage: raw.stage,
    manager: raw.manager ?? "",
    buildings: [],
  };
}

function fromRawOutdoor(raw: RawUnit): OutdoorSpace | null {
  if (raw.terraceArea) return { type: "terrace", area: raw.terraceArea };
  if (raw.balconyType) return { type: raw.balconyType, area: raw.balconyArea ?? 0 };
  return null;
}

/**
 * `position` здесь = `slot`; место внутри секции уточняет `withSectionPositions`,
 * когда известны все квартиры корпуса.
 */
export function fromRawUnit(raw: RawUnit, layoutCode = ""): Unit {
  return {
    id: String(raw.id),
    projectId: String(raw.projectId),
    section: raw.section,
    floor: raw.floor,
    position: raw.slot,
    axis: raw.slot,
    number: String(raw.number),
    rooms: raw.rooms,
    totalArea: raw.area,
    livingArea: raw.insideArea,
    price: toMoney(raw.price),
    pricePerSqm: toMoney(raw.pricePerSqm),
    status: raw.status,
    orientation: raw.orientation,
    view: raw.view,
    outdoor: fromRawOutdoor(raw),
    ceilingHeight: raw.ceiling,
    bathrooms: raw.bathrooms,
    isCorner: raw.corner,
    hasPanoramicWindows: raw.panoramic,
    roomsBreakdown: raw.roomData.map((room) => ({
      name: room.name ?? "",
      area: room.area ?? 0,
      width: room.width ?? 0,
      length: room.length ?? 0,
    })),
    layoutCode,
    layoutVariant: raw.layoutVariant,
  };
}

/** Место внутри секции: от самой левой оси секции по всему корпусу. */
export function withSectionPositions(units: Unit[]): Unit[] {
  const firstAxis = new Map<string, number>();
  for (const unit of units) {
    firstAxis.set(unit.section, Math.min(firstAxis.get(unit.section) ?? Infinity, unit.axis));
  }
  return units.map((unit) => ({ ...unit, position: unit.axis - (firstAxis.get(unit.section) ?? 1) + 1 }));
}

function fromRawReservation(raw: RawReservation): Reservation {
  return {
    buyer: raw.buyer,
    phone: raw.phone,
    type: raw.type,
    termHours: raw.term,
    amount: toMoney(raw.amount),
    paymentStatus: raw.paymentStatus,
    expiresAt: toHumanDate(raw.expiresAt),
    offerId: raw.offerId,
    finalPrice: toMoney(raw.finalPrice),
  };
}

export function fromRawUnitDetails(raw: RawUnitDetails, layoutCode = ""): UnitDetails {
  return {
    ...fromRawUnit(raw, layoutCode),
    building: "",
    externalId: "",
    reservation: raw.reservation ? fromRawReservation(raw.reservation) : null,
    contract: raw.contract
      ? {
          number: raw.contract.number,
          buyer: raw.contract.buyer,
          payment: raw.contract.paymentLabel || raw.contract.payment,
          signedAt: toHumanDate(raw.contract.signedAt),
        }
      : null,
    history: raw.history.map((event) => ({
      id: String(event.id),
      type: event.type,
      title: event.title,
      date: toHumanDate(event.date),
      actor: event.actor ?? "",
      buyer: event.buyer ?? "",
      stage: event.stage ?? "",
      details: event.details ?? "",
    })),
    offers: raw.offers.map((offer) => ({ ...offer, discount: toMoney(offer.discount) })),
  };
}

const isRawUnitDetails = (value: unknown): value is RawUnitDetails =>
  typeof value === "object" && value !== null && "slot" in value && "history" in value;

// ─── API ───────────────────────────────────────────────────────────────────

export async function getRealEstateProjects(): Promise<Project[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listProjects());
  const raw = await apiRequest<RawProject[]>(`${REALTY_API}/projects/`);
  return raw.map(fromRawProject);
}

async function getLayoutCodes(projectId?: string): Promise<Map<number, string>> {
  const layouts = await apiRequest<RawLayout[]>(`${REALTY_API}/layouts/`);
  const codes = new Map<number, string>();
  for (const layout of layouts) {
    if (projectId && String(layout.projectId) !== projectId) continue;
    for (const unitId of layout.unitIds) codes.set(unitId, layout.code);
  }
  return codes;
}

/** Все квартиры корпуса целиком: шахматке нужны и отфильтрованные ячейки. */
export async function getProjectUnits(projectId: string): Promise<Unit[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listUnits(projectId));
  const [raw, codes] = await Promise.all([
    apiRequest<RawUnit[]>(`${REALTY_API}/units/?projectId=${encodeURIComponent(projectId)}`),
    getLayoutCodes(projectId),
  ]);
  return withSectionPositions(raw.map((unit) => fromRawUnit(unit, codes.get(unit.id))));
}

export async function getUnit(unitId: string): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.getUnitDetails(unitId));
  const [raw, codes] = await Promise.all([
    apiRequest<RawUnitDetails>(`${REALTY_API}/units/${unitId}/`),
    getLayoutCodes(),
  ]);
  return fromRawUnitDetails(raw, codes.get(raw.id));
}

/** Списка менеджеров на бэке нет — пустой список, форма операции переходит на ввод текстом. */
export async function getSalesManagers(): Promise<string[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.managers);
  return [];
}

/** Команда над квартирой: ответ — свежая карточка, иначе перечитываем её. */
async function postUnitCommand(unitId: string, action: string, body: object): Promise<UnitDetails> {
  const raw = await apiRequest<unknown>(`${REALTY_API}/units/${unitId}/${action}/`, { method: "POST", body });
  return isRawUnitDetails(raw) ? fromRawUnitDetails(raw) : getUnit(unitId);
}

/**
 * Команды над квартирой. Ответ — свежая карточка; для обмена — карточка
 * квартиры, на которую перенесена сделка.
 */
export async function reserveUnit(unitId: string, input: ReserveUnitInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.reserve(unitId, input));
  // Срок в ответе — `term`; какое имя ждёт запрос, бэк не подтвердил — шлём оба.
  return postUnitCommand(unitId, "reserve", { ...input, term: input.termHours });
}

export async function confirmUnitPrepayment(unitId: string): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.confirmPrepayment(unitId));
  throw new Error("Подтверждение предоплаты пока не поддерживается сервером");
}

export async function scheduleUnitMeeting(unitId: string, input: MeetingInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.scheduleMeeting(unitId, input));
  return postUnitCommand(unitId, "meetings", input);
}

export async function sendUnitProposal(unitId: string, input: ProposalInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.sendProposal(unitId, input));
  return postUnitCommand(unitId, "proposals", input);
}

export async function runUnitOperation(unitId: string, input: OperationInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.runOperation(unitId, input));
  return postUnitCommand(unitId, "operations", input);
}

export async function signUnitContract(unitId: string, input: ContractInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.signContract(unitId, input));
  return postUnitCommand(unitId, "sell", input);
}

/** Ключи react-query модуля: команды инвалидируют всё дерево `realestate`. */
export const realEstateKeys = {
  all: ["realestate"] as const,
  projects: () => [...realEstateKeys.all, "projects"] as const,
  units: (projectId: string) => [...realEstateKeys.all, "units", projectId] as const,
  unit: (unitId: string) => [...realEstateKeys.all, "unit", unitId] as const,
  managers: () => [...realEstateKeys.all, "managers"] as const,
};
