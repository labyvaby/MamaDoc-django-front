import * as mock from "./realestate.mocks";
import { mockDelay } from "./mockUtils";

/**
 * Модуль «Недвижимость» (вертикаль realestate): шахматка квартир застройщика,
 * карточка квартиры и сделки по ней: бронь, предоплата, КП, встреча,
 * договор и операции.
 *
 * Модуль перенесён 27.09.2026 из `crm-building/frontend`, отдельного
 * прототипа AIVIO ERP. Контракт прототипа — `docs/api-chessboard.md` в том
 * репозитории. Бэкенд модуля в работе, схемы пока нет, поэтому весь модуль
 * работает на моках (REALESTATE_USE_MOCKS). Когда бэк отдаст схему, живые
 * вызовы пишутся здесь же, по ветке `else` в каждой функции. Гейты модуля
 * (роут, сайдбар) начнут требовать права сами, см. useModuleGate.
 *
 * Открытые вопросы бэку. Это предположения фронта, унаследованные от
 * прототипа, а не факты контракта:
 * - id ЖК и квартир здесь строковые («ala», «ala-14-2»), у Django будут числа;
 * - корпус отдаётся целиком, без пагинации: фильтры шахматки клиентские;
 * - деньги — целые сомы, площади — м² с точностью 0.1;
 * - даты в истории и брони — готовые строки для людей, а не ISO;
 * - покупатель — строка ФИО и телефон, без связи с карточкой клиента и сделкой
 *   воронки (решение 27.09: связать бронь со сделкой и карточкой клиента);
 * - коды прав и ключ модуля: `realestate`, `realestate.view`.
 */
export const REALESTATE_USE_MOCKS = true;

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

// ─── API ───────────────────────────────────────────────────────────────────

/** Живого API ещё нет: вызов без моков — ошибка разработчика, а не пустой экран. */
function notConnected(): never {
  throw new Error("Бэкенд модуля «Недвижимость» ещё не подключён");
}

export async function getRealEstateProjects(): Promise<Project[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listProjects());
  return notConnected();
}

/** Все квартиры корпуса целиком: шахматке нужны и отфильтрованные ячейки. */
export async function getProjectUnits(projectId: string): Promise<Unit[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listUnits(projectId));
  return notConnected();
}

export async function getUnit(unitId: string): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.getUnitDetails(unitId));
  return notConnected();
}

export async function getSalesManagers(): Promise<string[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.managers);
  return notConnected();
}

/**
 * Команды над квартирой. Ответ — свежая карточка; для обмена — карточка
 * квартиры, на которую перенесена сделка.
 */
export async function reserveUnit(unitId: string, input: ReserveUnitInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.reserve(unitId, input));
  return notConnected();
}

export async function confirmUnitPrepayment(unitId: string): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.confirmPrepayment(unitId));
  return notConnected();
}

export async function scheduleUnitMeeting(unitId: string, input: MeetingInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.scheduleMeeting(unitId, input));
  return notConnected();
}

export async function sendUnitProposal(unitId: string, input: ProposalInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.sendProposal(unitId, input));
  return notConnected();
}

export async function runUnitOperation(unitId: string, input: OperationInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.runOperation(unitId, input));
  return notConnected();
}

export async function signUnitContract(unitId: string, input: ContractInput): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.signContract(unitId, input));
  return notConnected();
}

/** Ключи react-query модуля: команды инвалидируют всё дерево `realestate`. */
export const realEstateKeys = {
  all: ["realestate"] as const,
  projects: () => [...realEstateKeys.all, "projects"] as const,
  units: (projectId: string) => [...realEstateKeys.all, "units", projectId] as const,
  unit: (unitId: string) => [...realEstateKeys.all, "unit", unitId] as const,
  managers: () => [...realEstateKeys.all, "managers"] as const,
};
