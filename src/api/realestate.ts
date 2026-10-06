import dayjs from "dayjs";

import { tt } from "../i18n/t";
import { ApiError, apiRequest } from "./client";
import * as mock from "./realestate.mocks";
import { mockDelay } from "./mockUtils";
import { getAllDjangoEmployees } from "./staff";

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
 * Контракт команд, оплаты брони, менеджеров и секций подтверждён ответом бэка
 * на тикет (`MamaDoc/backend_ticket_realty_response.md`, 28.09.2026):
 * - reserve: срок только `term` (24/48/72 ч), тип — `reservationType`;
 *   reserve/sell отвечают бронью/договором, не карточкой → карточку перечитываем;
 *   operations отвечает `{unit, target}` — уже свежие карточки;
 * - sell: `payment` — код installment/full/mortgage, `signCode` бэк не проверяет;
 * - предоплата подтверждается по брони: `reservations/<reservation.id>/confirm-payment/`;
 * - менеджеры — обычный `/staff/employees/?allBranches=1`, отдельного справочника нет;
 * - `sections` — объекты по порядку слева направо, дом = название секции;
 *   квартира ссылается на секцию `unit.sectionId` (`withProjectSections`);
 * - `slot` — сквозная позиция по этажу (ось); место внутри секции считаем сами;
 * - организация — заголовком `X-Organization-Id` на каждом запросе (с 02.10.2026,
 *   было `?organizationId=`); все функции принимают `RealtyScope`
 *   (в компонентах — `useRealtyScope()`), запросы — только при `orgReady`;
 * - чтение — `realty.view`, любая команда — `realty.manage`.
 *
 * С 30.09.2026 (AIVIO `a5010da`, проверено на test2): у ЖК `sellerInfo` и
 * `defaultReservationAmount` (null — не заполнено; сумму брони тогда ставит бэк),
 * срок сдачи у каждой секции; у квартиры `sectionId` и `layoutId` (= `id` в
 * `/layouts/`, код планировки — оттуда); файлы планировок и документов пока
 * пустые (`[]` / `fileUrl: null`).
 *
 * Открытые вопросы бэку — предположения фронта, не факты контракта:
 * - тело meetings/proposals ответ не описал — шлём по контракту прототипа;
 * - идентификатора 1С нет.
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
  /** Секции ЖК из API: по id квартира находит свою секцию, срок сдачи — у каждой свой. */
  sectionRefs?: ProjectSection[];
  /** Юрлицо продавца для договора; null — у ЖК не заполнено. */
  sellerInfo?: string | null;
  /** Предоплата брони по умолчанию, сом; null — у ЖК не задана (бэк подставит свою). */
  defaultPrepayment?: number | null;
  /** Счётчики квартир из `/projects/`; null — бэк их не отдал, считаем по квартирам. */
  stats?: ProjectStats | null;
}

export interface ProjectStats {
  total: number;
  free: number;
  reserved: number;
  sold: number;
}

export interface ProjectSection {
  id: string;
  name: string;
  /** «I квартал 2027»; пусто — срок не задан. */
  completionLabel: string;
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
  /** id секции ЖК (`sectionRefs`); null — бэк не сопоставил. */
  sectionId?: string | null;
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
  /** Бронь для шахматки: срок и ждёт ли предоплату; null — квартира не в брони. */
  hold?: UnitHold | null;
}

export interface UnitHold {
  /** ISO; null — бэк срок не отдал. */
  endsAt: string | null;
  awaitingPayment: boolean;
}

export type ReservationType = "free" | "prepaid";

export interface Reservation {
  /** id брони — по нему подтверждается предоплата. */
  id: string;
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
  /** Цена по договору, сом (с учётом акции брони). */
  price: number;
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

/** Срок брони: бэк принимает только 24, 48 или 72 часа. */
export type ReservationTerm = 24 | 48 | 72;

export interface ReserveUnitInput {
  buyer: string;
  phone: string;
  termHours: ReservationTerm;
  type: ReservationType;
  offerId: string;
  /** null — без задачи «Встреча». */
  meetingAt: string | null;
  /** Заявка CRM: бэк передвинет её на «Бронирование». */
  leadId?: number | null;
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

/** Менеджер отдела продаж — сотрудник организации. */
export interface SalesManager {
  id: string;
  name: string;
}

export interface OperationInput {
  operation: UnitOperation;
  /** id сотрудника; null — ответственный введён текстом. */
  actorId: string | null;
  actor: string;
  buyer: string;
  targetUnitId: string | null;
  comment: string;
}

/** Способ оплаты по договору — код бэка. */
export type ContractPayment = "installment" | "full" | "mortgage";

/** Геттеры: подпись читается из словаря при обращении, а не при импорте модуля. */
export const CONTRACT_PAYMENT_LABELS: Record<ContractPayment, string> = {
  get installment() {
    return tt("realestate:contractPayment.installment");
  },
  get full() {
    return tt("realestate:contractPayment.full");
  },
  get mortgage() {
    return tt("realestate:contractPayment.mortgage");
  },
};

export interface ContractInput {
  buyer: string;
  passport: string;
  phone: string;
  email: string;
  payment: ContractPayment;
  /** SMS-подписание на бэке не включено — код проверяют только моки. */
  signCode: string;
  /**
   * Квартира забронирована на другого покупателя: бэк отвечает 409
   * `INVALID_STATE`, после подтверждения повторяем с этим флагом.
   */
  allowOtherBuyer?: boolean;
  /** Заявка CRM: бэк передвинет её на «Договор / оплата». */
  leadId?: number | null;
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
  /** По порядку слева направо; на test2 пока пустой массив. */
  sections: RawSection[];
  finish: string;
  deadlineLabel: string;
  manager: string | null;
  sellerInfo?: string | null;
  defaultReservationAmount?: Decimal | null;
  /** Счётчики квартир ЖК — бэк считает сам, в скоупе филиала. */
  total?: number;
  free?: number;
  reserved?: number;
  sold?: number;
}

export interface RawSection {
  id: number;
  name: string;
  floors: number;
  progress: number;
  deadline: string | null;
  deadlineLabel: string;
}

export interface RawRoom {
  name?: string;
  /** Площадь помещения, м²: поле называется `size`, не `area`. */
  size?: number;
  width?: number;
  length?: number;
}

export interface RawReservation {
  id: number;
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
  price?: Decimal;
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
  sectionId?: number | null;
  /**
   * До 01.10.2026 — строка = `id` в `/layouts/`; с 01.10 (AIVIO `a4ed83d`) —
   * число, FK нового справочника планировок ЖК (пока пуст → null), а прежняя
   * строка переехала в `layoutCode`.
   */
  layoutId?: string | number | null;
  /** Ключ группы `/layouts/` («1-2-40-s-v0»), не код планировки. */
  layoutCode?: string;
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
  id: string;
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
    sections: raw.sections.map((section) => section.name),
    finish: raw.finish,
    completionLabel: raw.deadlineLabel,
    queue: raw.queue,
    stage: raw.stage,
    manager: raw.manager ?? "",
    // Домов отдельно бэк не хранит: название дома = название секции.
    buildings: raw.sections.map((section) => section.name),
    sectionRefs: raw.sections.map((section) => ({
      id: String(section.id),
      name: section.name,
      completionLabel: section.deadlineLabel,
    })),
    sellerInfo: raw.sellerInfo || null,
    defaultPrepayment: raw.defaultReservationAmount == null ? null : toMoney(raw.defaultReservationAmount),
    stats:
      raw.total == null
        ? null
        : { total: raw.total, free: raw.free ?? 0, reserved: raw.reserved ?? 0, sold: raw.sold ?? 0 },
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
    sectionId: raw.sectionId == null ? null : String(raw.sectionId),
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
      area: room.size ?? 0,
      width: room.width ?? 0,
      length: room.length ?? 0,
    })),
    layoutCode,
    layoutVariant: raw.layoutVariant,
    // Бронь приходит и в списке квартир — срок нужен шахматке для таймера.
    hold:
      raw.status === "reserved" && raw.reservation
        ? { endsAt: raw.reservation.expiresAt || null, awaitingPayment: raw.reservation.paymentStatus === "pending" }
        : null,
  };
}

/**
 * Место внутри секции — от самой левой квартиры секции на том же этаже.
 * Считать от оси всего корпуса нельзя: у сужающихся этажей (как в прототипе,
 * ЖК «Северный квартал» на test2 30.09.2026) `slot` нумеруется заново на
 * каждом этаже, и корпус 2 на 10-м этаже начинается с места 3, а на 7-м — с 5:
 * квартиры съезжали вправо, оставляя пустые колонки. Пропуски внутри этажа
 * (квартира 1 и 4 — между ними две пустые) сохраняются.
 */
export function withSectionPositions(units: Unit[]): Unit[] {
  const key = (unit: Unit) => `${unit.section}|${unit.floor}`;
  const firstAxis = new Map<string, number>();
  for (const unit of units) {
    firstAxis.set(key(unit), Math.min(firstAxis.get(key(unit)) ?? Infinity, unit.axis));
  }
  return units.map((unit) => ({ ...unit, position: unit.axis - (firstAxis.get(key(unit)) ?? 1) + 1 }));
}

function fromRawReservation(raw: RawReservation): Reservation {
  return {
    id: String(raw.id),
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
    building: raw.section,
    externalId: "",
    reservation: raw.reservation ? fromRawReservation(raw.reservation) : null,
    contract: raw.contract
      ? {
          number: raw.contract.number,
          buyer: raw.contract.buyer,
          payment: raw.contract.paymentLabel || raw.contract.payment,
          price: toMoney(raw.contract.price),
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

/**
 * Скоуп запроса: организация уходит заголовком `X-Organization-Id` (правило
 * AIVIO с 02.10.2026 — права, модуль и филиал бэк считает в организации из
 * заголовка), филиал бэк берёт из сессии. `branchId` в запрос не кладём — он
 * нужен только ключам кэша, чтобы смена филиала не показала чужие данные.
 */
export interface RealtyScope {
  organizationId?: number;
  branchId?: number;
  /** false — организация ещё не известна, запросы не отправляем. */
  orgReady?: boolean;
}

/** Заголовок организации; пустой скоуп — бэк берёт организацию активного членства. */
export function realtyHeaders(scope?: RealtyScope): Record<string, string> {
  return scope?.organizationId != null ? { "X-Organization-Id": String(scope.organizationId) } : {};
}

function realty<T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, headers: { ...realtyHeaders(scope), ...(options.headers as Record<string, string> | undefined) } });
}

// ─── API ───────────────────────────────────────────────────────────────────

export async function getRealEstateProjects(scope?: RealtyScope): Promise<Project[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listProjects());
  const raw = await realty<RawProject[]>(scope, `${REALTY_API}/projects/`);
  return raw.map(fromRawProject);
}

/** Код планировки квартиры: по `unit.layoutId`, у старого ответа — по `unitIds` планировки. */
type LayoutCodes = (unit: RawUnit) => string | undefined;

async function getLayoutCodes(scope?: RealtyScope, projectId?: string): Promise<LayoutCodes> {
  const layouts = await realty<RawLayout[]>(scope, `${REALTY_API}/layouts/`);
  const byLayout = new Map<string, string>();
  const byUnit = new Map<number, string>();
  for (const layout of layouts) {
    if (projectId && String(layout.projectId) !== projectId) continue;
    byLayout.set(layout.id, layout.code);
    for (const unitId of layout.unitIds) byUnit.set(unitId, layout.code);
  }
  return (unit) => {
    const key = typeof unit.layoutId === "string" ? unit.layoutId : unit.layoutCode;
    return (key && byLayout.get(key)) || byUnit.get(unit.id);
  };
}

/** Все квартиры корпуса целиком: шахматке нужны и отфильтрованные ячейки. */
export async function getProjectUnits(projectId: string, scope?: RealtyScope): Promise<Unit[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listUnits(projectId));
  const [raw, codes] = await Promise.all([
    realty<RawUnit[]>(scope, `${REALTY_API}/units/?projectId=${encodeURIComponent(projectId)}`),
    getLayoutCodes(scope, projectId),
  ]);
  return withSectionPositions(raw.map((unit) => fromRawUnit(unit, codes(unit))));
}

export async function getUnit(unitId: string, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.getUnitDetails(unitId));
  const [raw, codes] = await Promise.all([
    realty<RawUnitDetails>(scope, `${REALTY_API}/units/${unitId}/`),
    getLayoutCodes(scope),
  ]);
  return fromRawUnitDetails(raw, codes(raw));
}

/**
 * Менеджеры — активные сотрудники организации (фильтра «отдел продаж» у бэка
 * нет). `allBranches` — чтобы попали и «общие» менеджеры без филиала: без флага
 * список режется по активному филиалу. Без права на справочник сотрудников —
 * пустой список, и ответственный вводится текстом.
 */
export async function getSalesManagers(scope?: RealtyScope): Promise<SalesManager[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.managers.map((name) => ({ id: "", name })));
  try {
    const employees = await getAllDjangoEmployees({ status: "active", allBranches: true, organizationId: scope?.organizationId });
    return employees.map((employee) => ({ id: String(employee.id), name: employee.fullName }));
  } catch {
    return [];
  }
}

/**
 * Минимальная ставка ипотеки среди активных банков организации, % годовых.
 * null — банков нет или справочник недоступен: тогда строку ипотеки не показываем.
 */
export async function getMortgageRateFrom(scope?: RealtyScope): Promise<number | null> {
  if (REALESTATE_USE_MOCKS) return mockDelay(14);
  try {
    const banks = await realty<{ mortgageRate: number; isActive: boolean }[]>(scope, `${REALTY_API}/banks/?active=true`);
    const rates = banks.filter((bank) => bank.isActive && bank.mortgageRate > 0).map((bank) => bank.mortgageRate);
    return rates.length ? Math.min(...rates) : null;
  } catch {
    return null;
  }
}

/** Команда над квартирой. reserve/sell отвечают бронью или договором — карточку перечитываем. */
async function postUnitCommand(unitId: string, action: string, body: object, scope?: RealtyScope): Promise<UnitDetails> {
  await realty<unknown>(scope, `${REALTY_API}/units/${unitId}/${action}/`, { method: "POST", body });
  return getUnit(unitId, scope);
}

export async function reserveUnit(unitId: string, input: ReserveUnitInput, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.reserve(unitId, input));
  return postUnitCommand(
    unitId,
    "reserve",
    {
      buyer: input.buyer,
      phone: input.phone,
      term: input.termHours,
      reservationType: input.type,
      offerId: input.offerId,
      meeting: input.meetingAt !== null,
      meetingAt: input.meetingAt,
      ...(input.leadId != null ? { leadId: input.leadId } : {}),
    },
    scope,
  );
}

/** Предоплата подтверждается по брони (`reservation.id`), а не по квартире. */
export async function confirmUnitPrepayment(unit: UnitDetails, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.confirmPrepayment(unit.id));
  if (!unit.reservation) throw new Error(tt("realestate:errors.noReservation"));
  await realty<unknown>(scope, `${REALTY_API}/reservations/${unit.reservation.id}/confirm-payment/`, {
    method: "POST",
  });
  return getUnit(unit.id, scope);
}

/** Продление брони на `hours` часов (бэк принимает 1–720). Продлевается бронь, а не квартира. */
export async function extendUnitReservation(unit: UnitDetails, hours: ReservationTerm, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.extendReservation(unit.id, hours));
  if (!unit.reservation) throw new Error(tt("realestate:errors.noReservation"));
  await realty<unknown>(scope, `${REALTY_API}/reservations/${unit.reservation.id}/extend/`, {
    method: "POST",
    body: { hours },
  });
  return getUnit(unit.id, scope);
}

export async function scheduleUnitMeeting(unitId: string, input: MeetingInput, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.scheduleMeeting(unitId, input));
  return postUnitCommand(unitId, "meetings", input, scope);
}

/** Отправленное КП: свежая карточка и ссылка WhatsApp с текстом, который бэк сохранил в истории. */
export interface SentProposal {
  unit: UnitDetails;
  /** null — только в моках: ссылку собирает интерфейс. */
  whatsappUrl: string | null;
}

export async function sendUnitProposal(unitId: string, input: ProposalInput, scope?: RealtyScope): Promise<SentProposal> {
  if (REALESTATE_USE_MOCKS) return mockDelay({ unit: mock.sendProposal(unitId, input), whatsappUrl: null });
  const proposal = await realty<{ whatsappUrl: string }>(scope, `${REALTY_API}/units/${unitId}/proposals/`, {
    method: "POST",
    body: input,
  });
  return { unit: await getUnit(unitId, scope), whatsappUrl: proposal.whatsappUrl || null };
}

/**
 * Операция отвечает свежими карточками `{unit, target}`; для обмена возвращаем
 * карточку квартиры, на которую перенесена сделка.
 */
export async function runUnitOperation(unitId: string, input: OperationInput, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.runOperation(unitId, input));
  const [result, codes] = await Promise.all([
    realty<{ unit: RawUnitDetails; target: RawUnitDetails | null }>(scope, `${REALTY_API}/units/${unitId}/operations/`, {
      method: "POST",
      body: {
        operation: input.operation,
        comment: input.comment,
        actorId: input.actorId ? Number(input.actorId) : null,
        actor: input.actor,
        buyer: input.buyer,
        targetUnitId: input.targetUnitId ? Number(input.targetUnitId) : null,
      },
    }),
    getLayoutCodes(scope),
  ]);
  const card = result.target ?? result.unit;
  return fromRawUnitDetails(card, codes(card));
}

export async function signUnitContract(unitId: string, input: ContractInput, scope?: RealtyScope): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.signContract(unitId, input));
  // Код подписи бэк пока не проверяет (SMS-подписания нет) — шлём пустую строку.
  return postUnitCommand(unitId, "sell", { ...input, signCode: "" }, scope);
}

// ─── Каталог: заведение ЖК ─────────────────────────────────────────────────

/** Тело `POST /projects/` мастера «Новый ЖК». */
export interface NewProjectInput {
  name: string;
  address: string;
  deadline: string | null;
  pricePerSqm: string;
  startFloor: number;
  floors: number;
  sections: { name: string; startFloor: number; floors: number; deadline: string | null }[];
}

/** Квартира в `POST /units/bulk/`. */
export interface NewUnitInput {
  number: number;
  floor: number;
  slot: number;
  section: string;
  sectionId: number | null;
  rooms: number;
  area: string;
  price: string;
  pricePerSqm: string;
}

/** Ошибка строки bulk: `index` — номер квартиры в теле запроса. */
export interface BulkRowError {
  index: number;
  field: string;
  code: string;
  message: string;
}

/** Квартиры не создались — ЖК удалён (или удалить не удалось: `projectLeft`). */
export class ProjectCreateError extends Error {
  constructor(
    message: string,
    readonly rows: BulkRowError[],
    /** id ЖК, который остался пустым: откат не прошёл. */
    readonly projectLeft: string | null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProjectCreateError";
  }
}

/**
 * Ошибки строк bulk. Бэк кладёт их в `{bulk: [{index, field, code, message}]}`,
 * но где окажется этот ключ в конверте ошибки, живым ответом не проверено —
 * ищем массив строк в любом месте ответа.
 */
export function findBulkRowErrors(payload: unknown, depth = 0): BulkRowError[] {
  if (depth > 5 || payload == null || typeof payload !== "object") return [];
  if (Array.isArray(payload)) {
    const rows = payload.filter(
      (item): item is BulkRowError => typeof item === "object" && item != null && typeof (item as BulkRowError).index === "number",
    );
    if (rows.length) return rows;
    return payload.flatMap((item) => findBulkRowErrors(item, depth + 1));
  }
  return Object.values(payload).flatMap((value) => findBulkRowErrors(value, depth + 1));
}

/**
 * Создаёт ЖК с секциями, затем все квартиры одним `POST /units/bulk/` (всё или
 * ничего). Квартиры ссылаются на секции по id из ответа на создание ЖК, поэтому
 * их тело строится после него (`unitsFor`). Если квартиры не создались —
 * удаляем пустой ЖК, чтобы повторная попытка не плодила дубли.
 */
export async function createProjectWithUnits(
  project: NewProjectInput,
  unitsFor: (sectionIds: ReadonlyMap<string, number>) => NewUnitInput[],
  scope?: RealtyScope,
): Promise<{ projectId: string; created: number }> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.createProject(project, unitsFor));
  const created = await realty<RawProject>(scope, `${REALTY_API}/projects/`, { method: "POST", body: project });
  const sectionIds = new Map(created.sections.map((s) => [sectionKey(s.name), s.id]));
  try {
    const result = await realty<{ created: number; unitIds: number[] }>(scope, `${REALTY_API}/units/bulk/`, {
      method: "POST",
      body: { projectId: created.id, units: unitsFor(sectionIds) },
    });
    return { projectId: String(created.id), created: result.created };
  } catch (error) {
    const rows = error instanceof ApiError ? findBulkRowErrors(error.payload) : [];
    let projectLeft: string | null = null;
    try {
      await realty<unknown>(scope, `${REALTY_API}/projects/${created.id}/`, { method: "DELETE" });
    } catch {
      projectLeft = String(created.id);
    }
    throw new ProjectCreateError(error instanceof Error ? error.message : String(error), rows, projectLeft, error);
  }
}

/** Ключ секции по названию: без регистра и лишних пробелов — как сверяет бэк. */
export const sectionKey = (name: string) => name.trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");

/**
 * Ключи react-query модуля: команды инвалидируют всё дерево `realestate`.
 * Организация и филиал — в ключе: при смене контекста страница пересоздаётся,
 * а кэш остаётся, и без них показались бы ЖК прошлой организации или офиса.
 */
type ScopeKey = RealtyScope | undefined;
const scopeKey = (scope: ScopeKey) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realEstateKeys = {
  all: ["django", "realestate"] as const,
  org: (scope: ScopeKey) => [...realEstateKeys.all, ...scopeKey(scope)] as const,
  projects: (scope: ScopeKey) => [...realEstateKeys.org(scope), "projects"] as const,
  units: (scope: ScopeKey, projectId: string) => [...realEstateKeys.org(scope), "units", projectId] as const,
  unit: (scope: ScopeKey, unitId: string) => [...realEstateKeys.org(scope), "unit", unitId] as const,
  managers: (scope: ScopeKey) => [...realEstateKeys.org(scope), "managers"] as const,
  mortgageRate: (scope: ScopeKey) => [...realEstateKeys.org(scope), "mortgage-rate"] as const,
};
