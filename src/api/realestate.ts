import dayjs from "dayjs";

import { apiRequest } from "./client";
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
 * - суперпользователю нужен `organizationId`, иначе 400 — все функции
 *   принимают его (в компонентах — `useApiOrgId()`);
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

export const CONTRACT_PAYMENT_LABELS: Record<ContractPayment, string> = {
  installment: "Рассрочка 24 месяца",
  full: "100% оплата",
  mortgage: "Ипотека",
};

export interface ContractInput {
  buyer: string;
  passport: string;
  phone: string;
  email: string;
  payment: ContractPayment;
  /** SMS-подписание на бэке не включено — код проверяют только моки. */
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
  /** По порядку слева направо; на test2 пока пустой массив. */
  sections: RawSection[];
  finish: string;
  deadlineLabel: string;
  manager: string | null;
  sellerInfo?: string | null;
  defaultReservationAmount?: Decimal | null;
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
  /** Совпадает с `id` в `/layouts/`. */
  layoutId?: string;
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

/** Суперпользователю бэк не выводит организацию сам — без `organizationId` 400. */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  return `${path}${path.includes("?") ? "&" : "?"}organizationId=${organizationId}`;
}

// ─── API ───────────────────────────────────────────────────────────────────

export async function getRealEstateProjects(organizationId?: number): Promise<Project[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listProjects());
  const raw = await apiRequest<RawProject[]>(withOrg(`${REALTY_API}/projects/`, organizationId));
  return raw.map(fromRawProject);
}

/** Код планировки квартиры: по `unit.layoutId`, у старого ответа — по `unitIds` планировки. */
type LayoutCodes = (unit: RawUnit) => string | undefined;

async function getLayoutCodes(organizationId?: number, projectId?: string): Promise<LayoutCodes> {
  const layouts = await apiRequest<RawLayout[]>(withOrg(`${REALTY_API}/layouts/`, organizationId));
  const byLayout = new Map<string, string>();
  const byUnit = new Map<number, string>();
  for (const layout of layouts) {
    if (projectId && String(layout.projectId) !== projectId) continue;
    byLayout.set(layout.id, layout.code);
    for (const unitId of layout.unitIds) byUnit.set(unitId, layout.code);
  }
  return (unit) => (unit.layoutId && byLayout.get(unit.layoutId)) || byUnit.get(unit.id);
}

/** Все квартиры корпуса целиком: шахматке нужны и отфильтрованные ячейки. */
export async function getProjectUnits(projectId: string, organizationId?: number): Promise<Unit[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.listUnits(projectId));
  const [raw, codes] = await Promise.all([
    apiRequest<RawUnit[]>(withOrg(`${REALTY_API}/units/?projectId=${encodeURIComponent(projectId)}`, organizationId)),
    getLayoutCodes(organizationId, projectId),
  ]);
  return withSectionPositions(raw.map((unit) => fromRawUnit(unit, codes(unit))));
}

export async function getUnit(unitId: string, organizationId?: number): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.getUnitDetails(unitId));
  const [raw, codes] = await Promise.all([
    apiRequest<RawUnitDetails>(withOrg(`${REALTY_API}/units/${unitId}/`, organizationId)),
    getLayoutCodes(organizationId),
  ]);
  return fromRawUnitDetails(raw, codes(raw));
}

/**
 * Менеджеры — активные сотрудники организации (фильтра «отдел продаж» у бэка
 * нет). `allBranches` — чтобы попали и «общие» менеджеры без филиала: без флага
 * список режется по активному филиалу. Без права на справочник сотрудников —
 * пустой список, и ответственный вводится текстом.
 */
export async function getSalesManagers(organizationId?: number): Promise<SalesManager[]> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.managers.map((name) => ({ id: "", name })));
  try {
    const employees = await getAllDjangoEmployees({ status: "active", allBranches: true, organizationId });
    return employees.map((employee) => ({ id: String(employee.id), name: employee.fullName }));
  } catch {
    return [];
  }
}

/**
 * Минимальная ставка ипотеки среди активных банков организации, % годовых.
 * null — банков нет или справочник недоступен: тогда строку ипотеки не показываем.
 */
export async function getMortgageRateFrom(organizationId?: number): Promise<number | null> {
  if (REALESTATE_USE_MOCKS) return mockDelay(14);
  try {
    const banks = await apiRequest<{ mortgageRate: number; isActive: boolean }[]>(withOrg(`${REALTY_API}/banks/?active=true`, organizationId));
    const rates = banks.filter((bank) => bank.isActive && bank.mortgageRate > 0).map((bank) => bank.mortgageRate);
    return rates.length ? Math.min(...rates) : null;
  } catch {
    return null;
  }
}

/** Команда над квартирой. reserve/sell отвечают бронью или договором — карточку перечитываем. */
async function postUnitCommand(unitId: string, action: string, body: object, organizationId?: number): Promise<UnitDetails> {
  await apiRequest<unknown>(withOrg(`${REALTY_API}/units/${unitId}/${action}/`, organizationId), { method: "POST", body });
  return getUnit(unitId, organizationId);
}

export async function reserveUnit(unitId: string, input: ReserveUnitInput, organizationId?: number): Promise<UnitDetails> {
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
    },
    organizationId,
  );
}

/** Предоплата подтверждается по брони (`reservation.id`), а не по квартире. */
export async function confirmUnitPrepayment(unit: UnitDetails, organizationId?: number): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.confirmPrepayment(unit.id));
  if (!unit.reservation) throw new Error("У квартиры нет брони");
  await apiRequest<unknown>(withOrg(`${REALTY_API}/reservations/${unit.reservation.id}/confirm-payment/`, organizationId), {
    method: "POST",
  });
  return getUnit(unit.id, organizationId);
}

export async function scheduleUnitMeeting(unitId: string, input: MeetingInput, organizationId?: number): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.scheduleMeeting(unitId, input));
  return postUnitCommand(unitId, "meetings", input, organizationId);
}

/** Отправленное КП: свежая карточка и ссылка WhatsApp с текстом, который бэк сохранил в истории. */
export interface SentProposal {
  unit: UnitDetails;
  /** null — только в моках: ссылку собирает интерфейс. */
  whatsappUrl: string | null;
}

export async function sendUnitProposal(unitId: string, input: ProposalInput, organizationId?: number): Promise<SentProposal> {
  if (REALESTATE_USE_MOCKS) return mockDelay({ unit: mock.sendProposal(unitId, input), whatsappUrl: null });
  const proposal = await apiRequest<{ whatsappUrl: string }>(withOrg(`${REALTY_API}/units/${unitId}/proposals/`, organizationId), {
    method: "POST",
    body: input,
  });
  return { unit: await getUnit(unitId, organizationId), whatsappUrl: proposal.whatsappUrl || null };
}

/**
 * Операция отвечает свежими карточками `{unit, target}`; для обмена возвращаем
 * карточку квартиры, на которую перенесена сделка.
 */
export async function runUnitOperation(unitId: string, input: OperationInput, organizationId?: number): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.runOperation(unitId, input));
  const [result, codes] = await Promise.all([
    apiRequest<{ unit: RawUnitDetails; target: RawUnitDetails | null }>(withOrg(`${REALTY_API}/units/${unitId}/operations/`, organizationId), {
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
    getLayoutCodes(organizationId),
  ]);
  const card = result.target ?? result.unit;
  return fromRawUnitDetails(card, codes(card));
}

export async function signUnitContract(unitId: string, input: ContractInput, organizationId?: number): Promise<UnitDetails> {
  if (REALESTATE_USE_MOCKS) return mockDelay(mock.signContract(unitId, input));
  // Код подписи бэк пока не проверяет (SMS-подписания нет) — шлём пустую строку.
  return postUnitCommand(unitId, "sell", { ...input, signCode: "" }, organizationId);
}

/**
 * Ключи react-query модуля: команды инвалидируют всё дерево `realestate`.
 * Организация — в ключе: при смене контекста страница пересоздаётся, а кэш
 * остаётся, и без неё суперпользователь увидел бы ЖК прошлой организации.
 */
type OrgKey = number | undefined;

export const realEstateKeys = {
  all: ["realestate"] as const,
  org: (org: OrgKey) => [...realEstateKeys.all, org ?? "session"] as const,
  projects: (org: OrgKey) => [...realEstateKeys.org(org), "projects"] as const,
  units: (org: OrgKey, projectId: string) => [...realEstateKeys.org(org), "units", projectId] as const,
  unit: (org: OrgKey, unitId: string) => [...realEstateKeys.org(org), "unit", unitId] as const,
  managers: (org: OrgKey) => [...realEstateKeys.org(org), "managers"] as const,
  mortgageRate: (org: OrgKey) => [...realEstateKeys.org(org), "mortgage-rate"] as const,
};
