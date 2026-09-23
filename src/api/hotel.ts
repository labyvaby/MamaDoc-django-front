/**
 * Viva (отель) — реальный бэкенд, `/api/v2/hotel/`. Типы и вызовы по
 * контракту бэк-разработчика (`hotel-viva-frontend-api.md`, версия 2.2 от
 * 19.09.2026, тестовый стенд `https://test.crm.operator.kg`). Payload'ы —
 * дословный перевод раздела 6 контракта в camelCase-интерфейсы; эндпоинты —
 * раздел 4.
 *
 * Постранично переключает src/dev/Hotel*.tsx с localStorage-мока
 * (mockDemoData.ts) на эти вызовы — план в том же контракте, раздел 5.
 */
import { apiRequest, ApiError } from "./client";

// ── Общие типы проводов ──────────────────────────────────────────────────────

/** Деньги — строка с двумя знаками после запятой ("2500.00"). */
export type Money = string;
/** Количество на кухне — строка до трёх знаков после запятой ("0.6"). */
export type Qty = string;

export interface HotelCatalogEntry {
  key: string;
  label: string;
  group: string;
}

export interface HotelChoice {
  value: string;
  label: string;
}

/** Характеристика номера — справочник объекта (propertyId), не платформы. */
export interface HotelAmenity {
  id: number;
  propertyId: number;
  key: string;
  label: string;
  group: string;
  /** Наценка к цене номера за ночь, сом — 0, если не влияет на цену. */
  extraPrice: Money;
  sortOrder: number;
}

export interface HotelAmenityCreateData {
  propertyId: number;
  label: string;
  group?: string;
  extraPrice?: Money;
  /** Если не передан — бэкенд сам выдаёт `custom-xxxxxxxx`. */
  key?: string;
  sortOrder?: number;
}

export interface HotelAmenityUpdateData {
  label?: string;
  group?: string;
  extraPrice?: Money;
  sortOrder?: number;
}

/**
 * Строка catalogs.paymentMethods — 4 платформенных способа + свои у объекта
 * (§3.4 контракта). Формам оплаты хватает value/label. Экрана управления
 * «своими» способами объекта во фронте нет: способы безнала ведутся в
 * «Настройки → Способы безнала» (/settings/cashless-methods), поэтому CRUD
 * /v2/hotel/catalogs/payment-methods/ здесь не подключён.
 */
export interface HotelPaymentMethodChoice extends HotelChoice {
  /** true — способ заведён на бэкенде для объекта, false — платформенный. */
  isCustom: boolean;
  /** id записи способа объекта; у платформенных null. */
  id: number | null;
}

export interface HotelCatalogs {
  /** Характеристики ЭТОГО объекта (см. getHotelCatalogs propertyId) — без него приходит []. */
  amenities: HotelAmenity[];
  channels: HotelCatalogEntry[];
  mealOptions: HotelChoice[];
  boardTypes: HotelChoice[];
  guestTypes: HotelChoice[];
  visitPurposes: HotelChoice[];
  guaranteeMethods: HotelChoice[];
  bookingSources: HotelChoice[];
  /** Без propertyId придут только платформенные способы. */
  paymentMethods: HotelPaymentMethodChoice[];
  genders: HotelChoice[];
  roomStates: HotelChoice[];
  mealTypes: HotelChoice[];
  ingredientUnits: HotelChoice[];
}

/** Собирает query-строку, отбрасывая undefined/null/"". */
function buildQuery(params: object): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

// ── Конфликт брони (409 NO_AVAILABILITY) ─────────────────────────────────────

export interface HotelReservationConflict {
  reservationId: number;
  reservationNumber: number;
  itemId: number;
  roomTypeId: number;
  roomId: number | null;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

/** Список пересекающихся броней из 409 NO_AVAILABILITY — null, если ошибка другая. */
export function getReservationConflicts(err: unknown): HotelReservationConflict[] | null {
  if (!(err instanceof ApiError) || err.code !== "NO_AVAILABILITY") return null;
  const conflicts = err.details?.conflicts;
  return Array.isArray(conflicts) ? (conflicts as HotelReservationConflict[]) : null;
}

/**
 * Можно ли подтвердить конфликт повтором с allowOverbooking: true. Без
 * details.overbookable (номер в ремонте, блокировка на даты — details.reason
 * "out_of_service" | "blocked") повтор вернёт тот же 409: показываем только
 * message из ошибки и «Создать всё равно» не предлагаем.
 */
export function isOverbookingConfirmable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "NO_AVAILABILITY" && err.details?.overbookable === true;
}

// ── Каталог справочников ─────────────────────────────────────────────────────

/** GET /v2/hotel/catalogs/?propertyId= — кешировать на сессию/объект (значения меняются редко). Без propertyId amenities придёт []. */
export function getHotelCatalogs(propertyId: number, signal?: AbortSignal): Promise<HotelCatalogs> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelCatalogs>(`/v2/hotel/catalogs/${qs}`, { signal });
}

/** GET /v2/hotel/catalogs/amenities/?propertyId= — то же, что catalogs.amenities, отдельным вызовом. Право hotel.view. */
export function listAmenities(propertyId: number, signal?: AbortSignal): Promise<HotelAmenity[]> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelAmenity[]>(`/v2/hotel/catalogs/amenities/${qs}`, { signal });
}

/** Право hotel.manage. Дубль label (без учёта регистра) в объекте — 400 details.fields.label. */
export function createAmenity(data: HotelAmenityCreateData): Promise<HotelAmenity> {
  return apiRequest<HotelAmenity>("/v2/hotel/catalogs/amenities/", { method: "POST", body: data });
}

/** После правки extraPrice — перечитать категории: их totalPrice меняется сразу, nights[].price уже созданных броней — нет. */
export function updateAmenity(id: number, data: HotelAmenityUpdateData): Promise<HotelAmenity> {
  return apiRequest<HotelAmenity>(`/v2/hotel/catalogs/amenities/${id}/`, { method: "PATCH", body: data });
}

/** 409 HAS_DEPENDENTS, если характеристика отмечена хоть у одной категории. */
export function deleteAmenity(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/catalogs/amenities/${id}/`, { method: "DELETE" });
}


// ── Объекты размещения (Property) ────────────────────────────────────────────

export interface HotelProperty {
  id: number;
  branchId: number | null;
  name: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  houseRules: string;
  allowCheckoutWithDebt: boolean;
  isActive: boolean;
  roomTypesCount: number;
  roomsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HotelPropertyCreateData {
  name: string;
  branchId?: number | null;
  address?: string;
  phone?: string;
  email?: string;
  timezone?: string;
  currency?: string;
  checkInTime?: string;
  checkOutTime?: string;
  houseRules?: string;
  allowCheckoutWithDebt?: boolean;
}

export interface HotelPropertyUpdateData extends Partial<HotelPropertyCreateData> {
  clearBranch?: boolean;
  isActive?: boolean;
}

/** GET /v2/hotel/properties/ — найти объект текущего филиала по branchId. */
export function listHotelProperties(signal?: AbortSignal): Promise<HotelProperty[]> {
  return apiRequest<HotelProperty[]>("/v2/hotel/properties/", { signal });
}

export function createHotelProperty(data: HotelPropertyCreateData): Promise<HotelProperty> {
  return apiRequest<HotelProperty>("/v2/hotel/properties/", { method: "POST", body: data });
}

export function updateHotelProperty(id: number, data: HotelPropertyUpdateData): Promise<HotelProperty> {
  return apiRequest<HotelProperty>(`/v2/hotel/properties/${id}/`, { method: "PATCH", body: data });
}

// ── Категории номеров (RoomType) ─────────────────────────────────────────────

export interface HotelRoomType {
  id: number;
  propertyId: number;
  name: string;
  code: string;
  adultsCapacity: number;
  childrenCapacity: number;
  /** = adultsCapacity + childrenCapacity, только для чтения. */
  capacity: number;
  /** Ключи из HotelCatalogs.amenities. */
  amenities: string[];
  view: string;
  bedType: string;
  roomLayout: string;
  isLuxury: boolean;
  description: string;
  /** Цена «номера без ничего», сом/ночь — на запись только она. */
  basePrice: Money;
  /** basePrice + Σ extraPrice отмеченных характеристик по справочнику объекта — только чтение, не считать на фронте. */
  totalPrice: Money;
  sortOrder: number;
  isActive: boolean;
  roomsCount: number;
}

export interface HotelRoomTypeCreateData {
  propertyId: number;
  name: string;
  code?: string;
  adultsCapacity?: number;
  childrenCapacity?: number;
  amenities?: string[];
  view?: string;
  bedType?: string;
  roomLayout?: string;
  isLuxury?: boolean;
  description?: string;
  basePrice?: Money;
  sortOrder?: number;
}

export interface HotelRoomTypeUpdateData {
  name?: string;
  code?: string;
  adultsCapacity?: number;
  childrenCapacity?: number;
  amenities?: string[];
  view?: string;
  bedType?: string;
  roomLayout?: string;
  isLuxury?: boolean;
  description?: string;
  basePrice?: Money;
  sortOrder?: number;
  isActive?: boolean;
}

export function listRoomTypes(
  propertyId: number,
  options: { includeInactive?: boolean } = {},
  signal?: AbortSignal,
): Promise<HotelRoomType[]> {
  const qs = buildQuery({ propertyId, includeInactive: options.includeInactive || undefined });
  return apiRequest<HotelRoomType[]>(`/v2/hotel/room-types/${qs}`, { signal });
}

export function createRoomType(data: HotelRoomTypeCreateData): Promise<HotelRoomType> {
  return apiRequest<HotelRoomType>("/v2/hotel/room-types/", { method: "POST", body: data });
}

export function updateRoomType(id: number, data: HotelRoomTypeUpdateData): Promise<HotelRoomType> {
  return apiRequest<HotelRoomType>(`/v2/hotel/room-types/${id}/`, { method: "PATCH", body: data });
}

/** 409 HAS_DEPENDENTS, если есть номера/брони — тогда повторить updateRoomType(id, {isActive: false}). */
export function deleteRoomType(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/room-types/${id}/`, { method: "DELETE" });
}

// ── Номера (Room) ─────────────────────────────────────────────────────────

export interface HotelRoom {
  id: number;
  propertyId: number;
  roomTypeId: number;
  roomTypeName: string;
  number: string;
  floor: string;
  status: "active" | "out_of_service";
  housekeepingState: string;
  /** Настоящее состояние уборки — используйте это поле, не housekeepingState. */
  state: "dirty" | "clean" | "inspected" | "repair";
  /** Ключи из HotelCatalogs.mealOptions — какое питание доступно в этом номере. */
  mealOptions: string[];
  note: string;
  /** Физические характеристики номера (см. §6 контракта, доп. поля от 23.09.2026) — все необязательные. */
  /** Площадь, м² — десятичная строка ("24.5") либо не указана. */
  area: string | null;
  /** Высота потолков, м. */
  ceilingHeight: string | null;
  /** Сторона света окон — свободный текст ("юг", "северо-восток"…). "" — не указана. */
  windowSide: string;
  /** Вид из окна ЭТОГО номера — отдельно от view категории (там вид общий для всех номеров категории). */
  view: string;
  isCorner: boolean;
  bathrooms: number | null;
  roomsCount: number | null;
  layoutDescription: string;
}

export interface HotelRoomListParams {
  propertyId: number;
  roomTypeId?: number;
  status?: "active" | "out_of_service";
}

export interface HotelRoomCreateData {
  propertyId: number;
  roomTypeId: number;
  number: string;
  floor?: string;
  mealOptions?: string[];
  note?: string;
  area?: string | null;
  ceilingHeight?: string | null;
  windowSide?: string;
  view?: string;
  isCorner?: boolean;
  bathrooms?: number | null;
  roomsCount?: number | null;
  layoutDescription?: string;
}

export interface HotelRoomUpdateData {
  roomTypeId?: number;
  number?: string;
  floor?: string;
  status?: "active" | "out_of_service";
  mealOptions?: string[];
  note?: string;
  area?: string | null;
  ceilingHeight?: string | null;
  windowSide?: string;
  view?: string;
  isCorner?: boolean;
  bathrooms?: number | null;
  roomsCount?: number | null;
  layoutDescription?: string;
  /** null у area/ceilingHeight/bathrooms/roomsCount значит «поле не прислали» — для очистки шлём этот флаг. */
  clearArea?: boolean;
  clearCeilingHeight?: boolean;
  clearBathrooms?: boolean;
  clearRoomsCount?: boolean;
}

export function listRooms(params: HotelRoomListParams, signal?: AbortSignal): Promise<HotelRoom[]> {
  const qs = buildQuery({ propertyId: params.propertyId, roomTypeId: params.roomTypeId, status: params.status });
  return apiRequest<HotelRoom[]>(`/v2/hotel/rooms/${qs}`, { signal });
}

export function createRoom(data: HotelRoomCreateData): Promise<HotelRoom> {
  return apiRequest<HotelRoom>("/v2/hotel/rooms/", { method: "POST", body: data });
}

/** Перенос в другую категорию с будущими бронями → 409 INVALID_TRANSITION (сначала переназначить брони). */
export function updateRoom(id: number, data: HotelRoomUpdateData): Promise<HotelRoom> {
  return apiRequest<HotelRoom>(`/v2/hotel/rooms/${id}/`, { method: "PATCH", body: data });
}

/** dirty/clean/inspected — право hotel.housekeeping.view; repair — hotel.manage. Принимает и "cleaned" (= "clean"). */
export function setRoomHousekeeping(id: number, state: string): Promise<HotelRoom> {
  return apiRequest<HotelRoom>(`/v2/hotel/rooms/${id}/housekeeping/`, { method: "PATCH", body: { state } });
}

/** 409 HAS_DEPENDENTS, если номер когда-либо бронировали → updateRoom(id, {status: "out_of_service"}). */
export function deleteRoom(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/rooms/${id}/`, { method: "DELETE" });
}

// ── Шахматка (Calendar) и доступность номера ─────────────────────────────────

export interface HotelCalendarRoom {
  id: number;
  number: string;
  floor: string;
  roomTypeId: number;
  status: string;
  housekeepingState: string;
  state: string;
  mealOptions: string[];
}

export interface HotelCalendarGuest {
  fullName: string;
  isPrimary: boolean;
}

export interface HotelCalendarItem {
  itemId: number;
  reservationId: number;
  reservationNumber: number;
  reservationStatus: string;
  stayStatus: string;
  source: string;
  roomTypeId: number;
  roomId: number | null;
  checkIn: string;
  checkOut: string;
  customerName: string;
  guests: HotelCalendarGuest[];
  totalAmount: Money;
  isOverbooking: boolean;
  boardType: string;
}

export interface HotelRoomBlock {
  id: number;
  propertyId: number;
  roomId: number;
  roomNumber: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
  isActive: boolean;
  createdById: number | null;
  createdAt: string;
  releasedAt: string | null;
}

export interface HotelCalendar {
  propertyId: number;
  dateFrom: string;
  dateTo: string;
  roomTypes: HotelRoomType[];
  rooms: HotelCalendarRoom[];
  items: HotelCalendarItem[];
  blocks: HotelRoomBlock[];
}

export interface HotelCalendarParams {
  propertyId: number;
  from: string;
  to: string;
  roomTypeId?: number;
  status?: string;
  source?: string;
  q?: string;
}

/** Диапазон ≤ 62 дня. Черновики (reservationStatus: "draft") номер не занимают. */
export function getCalendar(params: HotelCalendarParams, signal?: AbortSignal): Promise<HotelCalendar> {
  const qs = buildQuery(params);
  return apiRequest<HotelCalendar>(`/v2/hotel/calendar/${qs}`, { signal });
}

export interface HotelFreeWindow {
  dateFrom: string;
  dateTo: string;
}

export interface HotelRoomAvailability {
  room: HotelRoom;
  dateFrom: string;
  dateTo: string;
  items: HotelCalendarItem[];
  blocks: HotelRoomBlock[];
  freeWindows: HotelFreeWindow[];
}

export function getRoomAvailability(
  roomId: number,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<HotelRoomAvailability> {
  const qs = buildQuery({ from, to });
  return apiRequest<HotelRoomAvailability>(`/v2/hotel/rooms/${roomId}/availability/${qs}`, { signal });
}

// ── Брони (Reservation) ───────────────────────────────────────────────────

export interface HotelStayDocument {
  guestType?: string;
  citizenship?: string;
  documentType?: string;
  documentNumber?: string;
  inn?: string;
  passportCountry?: string;
  /** Срок действия любого документа (у ID-карты резидента тоже). Старое passportExpiry — алиас до v3, не используем. */
  documentExpiry?: string | null;
  gender?: string;
  placeOfBirth?: string;
  issueDate?: string | null;
  issuingAuthority?: string;
  registrationAddress?: string;
  entryDate?: string | null;
  migrationCardNumber?: string;
  visitPurpose?: string;
}

export interface HotelReservationGuestInput {
  fullName: string;
  phone?: string;
  email?: string;
  clientId?: number | null;
  isPrimary?: boolean;
  isChild?: boolean;
  document?: HotelStayDocument | null;
}

export interface HotelReservationGuest {
  id: number;
  clientId: number | null;
  fullName: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  isChild: boolean;
  /** null без права hotel.guests.documents. */
  document: HotelStayDocument | null;
  documentPhotoUrl: string | null;
}

export interface HotelReservationNight {
  date: string;
  /** Цена этой ночи, замороженная на момент создания/правки брони. */
  price: Money;
  ratePlanName: string;
}

export interface HotelReservationItemInput {
  checkIn: string;
  checkOut: string;
  roomTypeId?: number | null;
  roomId?: number | null;
  adults?: number;
  children?: number;
  ratePlanId?: number | null;
  boardType?: string;
  guests?: HotelReservationGuestInput[];
}

export interface HotelReservationItem {
  id: number;
  roomTypeId: number;
  roomTypeName: string;
  roomId: number | null;
  roomNumber: string | null;
  ratePlanId: number | null;
  ratePlanName: string | null;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  adults: number;
  children: number;
  boardType: string;
  isOverbooking: boolean;
  totalAmount: Money;
  stayStatus: "expected" | "checked_in" | "checked_out";
  isActive: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  guests: HotelReservationGuest[];
  nights: HotelReservationNight[];
}

export interface HotelCustomerInput {
  fullName: string;
  phone?: string;
  email?: string;
  source?: string;
}

export interface HotelReservationCreateData {
  propertyId: number;
  items: HotelReservationItemInput[];
  status?: "draft" | "hold" | "confirmed";
  source?: string;
  /** Выбран из автодополнения (searchGuests) — приоритетнее customer. */
  customerId?: number | null;
  /** Гость заводится «на лету» — использовать, если customerId не выбран. */
  customer?: HotelCustomerInput | null;
  externalId?: string;
  guestComment?: string;
  internalNote?: string;
  guaranteeMethod?: string;
  companyInfo?: string;
  dataConsent?: boolean;
  allowOverbooking?: boolean;
  holdMinutes?: number;
}

export interface HotelReservationLog {
  id: number;
  userId: number | null;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  createdAt: string;
}

export interface HotelReservation {
  id: number;
  number: number;
  propertyId: number;
  status: "draft" | "hold" | "confirmed" | "cancelled" | "no_show" | "expired";
  source: string;
  externalId: string;
  customerId: number | null;
  customerName: string;
  currency: string;
  totalAmount: Money;
  expiresAt: string | null;
  cancellationPolicy: string;
  guestComment: string;
  internalNote: string;
  guaranteeMethod: string;
  companyInfo: string;
  dataConsent: boolean;
  paidAmount: Money;
  balanceDue: Money;
  cancelledAt: string | null;
  cancelReason: string;
  /** Отправлять обратно в PATCH/действиях — расхождение → 409 VERSION_CONFLICT. */
  version: number;
  checkIn: string | null;
  checkOut: string | null;
  items: HotelReservationItem[];
  createdById: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface HotelReservationDetail extends HotelReservation {
  logs: HotelReservationLog[];
}

export interface HotelReservationList {
  count: number;
  results: HotelReservation[];
}

export interface HotelReservationListParams {
  propertyId: number;
  from?: string;
  to?: string;
  status?: string;
  source?: string;
  q?: string;
  arrivingOn?: string;
  departingOn?: string;
  inHouseOn?: string;
  roomId?: number;
  customerId?: number;
  limit?: number;
  offset?: number;
}

export interface HotelReservationUpdateData {
  version?: number;
  customerId?: number | null;
  clearCustomer?: boolean;
  source?: string;
  externalId?: string;
  guestComment?: string;
  internalNote?: string;
  guaranteeMethod?: string;
  companyInfo?: string;
  dataConsent?: boolean;
}

export interface HotelItemUpdateData {
  version?: number;
  roomTypeId?: number | null;
  checkIn?: string;
  checkOut?: string;
  ratePlanId?: number | null;
  clearRatePlan?: boolean;
  adults?: number;
  children?: number;
  boardType?: string;
  guests?: HotelReservationGuestInput[];
  reprice?: boolean;
  allowOverbooking?: boolean;
}

export interface HotelFreeRoom {
  id: number;
  number: string;
  floor: string;
  housekeepingState: string;
}

export function listReservations(
  params: HotelReservationListParams,
  signal?: AbortSignal,
): Promise<HotelReservationList> {
  const qs = buildQuery(params);
  return apiRequest<HotelReservationList>(`/v2/hotel/reservations/${qs}`, { signal });
}

export function getReservation(id: number, signal?: AbortSignal): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${id}/`, { signal });
}

/**
 * Первая попытка при пересечении дат → 409 NO_AVAILABILITY с
 * details.conflicts (см. getReservationConflicts/isOverbookingConfirmable) —
 * повторить с data.allowOverbooking: true.
 */
export function createReservation(data: HotelReservationCreateData): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>("/v2/hotel/reservations/", { method: "POST", body: data });
}

export function updateReservation(id: number, data: HotelReservationUpdateData): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${id}/`, { method: "PATCH", body: data });
}

export function updateReservationItem(
  reservationId: number,
  itemId: number,
  data: HotelItemUpdateData,
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/`, {
    method: "PATCH",
    body: data,
  });
}

/** Свободные номера этой категории на весь период позиции — для ручного назначения. */
export function getItemFreeRooms(
  reservationId: number,
  itemId: number,
  signal?: AbortSignal,
): Promise<HotelFreeRoom[]> {
  return apiRequest<HotelFreeRoom[]>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/free-rooms/`, { signal });
}

export function assignRoom(
  reservationId: number,
  itemId: number,
  data: { roomId: number | null; version?: number },
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/assign-room/`, {
    method: "POST",
    body: data,
  });
}

/** 409 ROOM_NOT_READY, если номер грязный/в ремонте — повторить с forceDirty (право hotel.stays.force_checkin). */
export function checkInReservationItem(
  reservationId: number,
  itemId: number,
  data: { version?: number; allowOverbooking?: boolean; roomId?: number; forceDirty?: boolean; forceReason?: string } = {},
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/check-in/`, {
    method: "POST",
    body: data,
  });
}

/** 409 HAS_DEBT, если balanceDue > 0 — открыть диалог оплаты либо повторить с allowDebt (если объект это разрешает). */
export function checkOutReservationItem(
  reservationId: number,
  itemId: number,
  data: { version?: number; allowDebt?: boolean } = {},
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/check-out/`, {
    method: "POST",
    body: data,
  });
}

/** Переселение уже заселённого гостя в другой номер. */
export function moveRoom(
  reservationId: number,
  itemId: number,
  data: { roomId: number; reason: string; version?: number },
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${reservationId}/items/${itemId}/move-room/`, {
    method: "POST",
    body: data,
  });
}

export function cancelReservation(
  id: number,
  data: { reason: string; noShow?: boolean; version?: number },
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${id}/cancel/`, { method: "POST", body: data });
}

/** Черновик/hold → confirmed. */
export function confirmReservation(
  id: number,
  data: { version?: number; allowOverbooking?: boolean } = {},
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${id}/confirm/`, { method: "POST", body: data });
}

/** Временная бронь до expiresAt. */
export function holdReservation(
  id: number,
  data: { version?: number; allowOverbooking?: boolean; holdMinutes?: number } = {},
): Promise<HotelReservationDetail> {
  return apiRequest<HotelReservationDetail>(`/v2/hotel/reservations/${id}/hold/`, { method: "POST", body: data });
}

/** jpg/png/webp/heic/pdf ≤10 МБ. Право hotel.guests.documents. */
export function uploadStayDocumentPhoto(
  reservationId: number,
  guestId: number,
  file: File,
): Promise<HotelReservationGuest> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelReservationGuest>(
    `/v2/hotel/reservations/${reservationId}/guests/${guestId}/document-photo/`,
    { method: "PUT", formData },
  );
}

export function deleteStayDocumentPhoto(reservationId: number, guestId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/reservations/${reservationId}/guests/${guestId}/document-photo/`, {
    method: "DELETE",
  });
}

// ── Оплата проживания (append-only список) ───────────────────────────────────

export interface HotelPayment {
  id: number;
  reservationId: number;
  kind: "payment" | "refund";
  /** Ключ способа (catalogs.paymentMethods[].value) — платформенный или свой объекта. */
  method: string;
  /** Название способа на момент запроса — для показа, в том числе у своих способов. */
  methodLabel: string;
  amount: Money;
  currency: string;
  note: string;
  acceptedById: number | null;
  acceptedByName: string;
  acceptedAt: string;
  createdAt: string;
}

export interface HotelPaymentList {
  reservationId: number;
  currency: string;
  totalAmount: Money;
  paidAmount: Money;
  balanceDue: Money;
  results: HotelPayment[];
}

export interface HotelPaymentCreateData {
  /** Любой value из catalogs.paymentMethods; чужой ключ или опечатка → 400 details.fields.method. */
  method: string;
  amount: Money;
  /** По умолчанию "payment"; "refund" — исправление ошибки, не больше принятого. */
  kind?: "payment" | "refund";
  note?: string;
  acceptedAt?: string;
}

export function listPayments(reservationId: number, signal?: AbortSignal): Promise<HotelPaymentList> {
  return apiRequest<HotelPaymentList>(`/v2/hotel/reservations/${reservationId}/payments/`, { signal });
}

/** Оплата закрытой брони (cancelled/no_show/expired) → 409 INVALID_TRANSITION; возврат — можно. */
export function addPayment(reservationId: number, data: HotelPaymentCreateData): Promise<HotelPaymentList> {
  return apiRequest<HotelPaymentList>(`/v2/hotel/reservations/${reservationId}/payments/`, {
    method: "POST",
    body: data,
  });
}

// ── Гости ─────────────────────────────────────────────────────────────────

export interface HotelGuest {
  clientId: number;
  fullName: string;
  phone: string;
  email: string;
  dob: string | null;
  photoUrl: string | null;
  /** Откуда гость узнал об отеле — отдельно от source брони. */
  source: string;
  guestType: string;
  citizenship: string;
  preferences: string;
  /** Как и dob — поле профиля: видно всем с hotel.guests.view. "" — не указан. */
  gender: string;
  isVip: boolean;
  marketingConsent: boolean;
  isBlacklisted: boolean;
  blacklistReason: string;
  staysCount: number;
  lastStay: string | null;
  /** Поля документа — null без права hotel.guests.documents (при записи без права — 400). */
  documentType: string | null;
  documentNumber: string | null;
  inn: string | null;
  passportCountry: string | null;
  /** Срок действия любого документа. Старое passportExpiry — алиас до v3, не читаем. */
  documentExpiry: string | null;
  placeOfBirth: string | null;
  issueDate: string | null;
  issuingAuthority: string | null;
  registrationAddress: string | null;
  documentPhotoUrl: string | null;
}

/** По какому полю совпал запрос: name | phone | document | inn (см. HOTEL_GUEST_MATCH_LABELS). */
export interface HotelGuestSearchResult {
  clientId: number;
  fullName: string;
  phone: string;
  isBlacklisted: boolean;
  staysCount: number;
  matchedBy: string[];
  /** null без права hotel.guests.documents — тогда по документам поиск и не идёт. */
  documentNumber: string | null;
  inn: string | null;
}

export interface HotelGuestCreateData {
  fullName: string;
  phone?: string;
  email?: string;
  dob?: string | null;
  source?: string;
  guestType?: string;
  citizenship?: string;
  /** "male" | "female" — catalogs.genders. */
  gender?: string;
  documentType?: string;
  documentNumber?: string;
  inn?: string;
  passportCountry?: string;
  documentExpiry?: string | null;
  placeOfBirth?: string;
  issueDate?: string | null;
  issuingAuthority?: string;
  registrationAddress?: string;
  preferences?: string;
  isVip?: boolean;
  marketingConsent?: boolean;
}

export interface HotelGuestUpdateData extends Partial<HotelGuestCreateData> {
  clearDocumentExpiry?: boolean;
  clearIssueDate?: boolean;
}

/**
 * Ответ POST /v2/hotel/guests/scan-document/. Все поля, кроме confidence и
 * warnings, могут быть null — форма подставляет то, что пришло, остальное не
 * трогает. guestType/documentType/gender уже в кодах API (resident|foreign,
 * id_card|passport, male|female) — кладутся в HotelGuestCreateData как есть.
 */
export interface HotelGuestDocumentScan {
  guestType: string | null;
  documentType: string | null;
  fullName: string | null;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  documentNumber: string | null;
  /** Только resident (ПИН с ID-карты). */
  inn: string | null;
  dob: string | null;
  gender: string | null;
  placeOfBirth: string | null;
  issueDate: string | null;
  issuingAuthority: string | null;
  documentExpiry: string | null;
  /** Только resident. */
  registrationAddress: string | null;
  /** Только foreign. */
  citizenship: string | null;
  /** Только foreign (ISO alpha-3 или как в документе). */
  passportCountry: string | null;
  /** 0..1 — ниже 0.6 поля стоит подсветить «проверьте». */
  confidence: number;
  /** Что модель сочла сомнительным: блик, обрезанный край… — текст для показа. */
  warnings: string[];
}

export interface HotelGuestListParams {
  q?: string;
  blacklisted?: boolean;
  source?: string;
}

/** До 200 гостей, поиск по имени, телефону, номеру документа и ИНН — список «Гости». */
export function listGuests(params: HotelGuestListParams = {}, signal?: AbortSignal): Promise<HotelGuest[]> {
  const qs = buildQuery(params);
  return apiRequest<HotelGuest[]>(`/v2/hotel/guests/${qs}`, { signal });
}

/**
 * ≥2 символа, ≤20 результатов — автодополнение в форме брони; ищет по всем
 * клиентам организации: по имени, телефону, номеру документа и ИНН. По
 * документам — только с правом hotel.guests.documents (без него q=ID2311220
 * вернёт []). Причина совпадения — в matchedBy каждой строки.
 */
export function searchGuests(q: string, signal?: AbortSignal): Promise<HotelGuestSearchResult[]> {
  const qs = buildQuery({ q });
  return apiRequest<HotelGuestSearchResult[]>(`/v2/hotel/guests/search/${qs}`, { signal });
}

/**
 * Распознавание фото документа. jpg/png/webp/pdf ≤10 МБ, ответ синхронный
 * (обычно 3–8 с, бэкенд обрывает на 25 с; собственного таймаута у apiRequest
 * нет — браузерный заведомо больше 30 с). Ничего не сохраняет: ни фото, ни
 * поля — фото после создания гостя грузится отдельно (uploadGuestDocumentPhoto).
 * Право hotel.guests.documents. Ошибки: 422 DOCUMENT_NOT_RECOGNIZED, 429
 * RECOGNITION_RATE_LIMITED, 503 RECOGNITION_UNAVAILABLE (провайдер не
 * настроен или лежит), 400 — не файл / больше 10 МБ.
 */
export function scanGuestDocument(file: File, signal?: AbortSignal): Promise<HotelGuestDocumentScan> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelGuestDocumentScan>("/v2/hotel/guests/scan-document/", { method: "POST", formData, signal });
}

export function createGuest(data: HotelGuestCreateData): Promise<HotelGuest> {
  return apiRequest<HotelGuest>("/v2/hotel/guests/", { method: "POST", body: data });
}

export function getGuest(clientId: number, signal?: AbortSignal): Promise<HotelGuest> {
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/`, { signal });
}

export function updateGuest(clientId: number, data: HotelGuestUpdateData): Promise<HotelGuest> {
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/`, { method: "PATCH", body: data });
}

/** reason обязателен. Бронь на гостя из ЧС не блокируется — только бейдж/алерт в карточке. */
export function setGuestBlacklist(clientId: number, reason: string): Promise<HotelGuest> {
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/blacklist/`, { method: "POST", body: { reason } });
}

export function clearGuestBlacklist(clientId: number): Promise<HotelGuest> {
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/blacklist/`, { method: "DELETE" });
}

export function uploadGuestPhoto(clientId: number, file: File): Promise<HotelGuest> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/photo/`, { method: "PUT", formData });
}

export function deleteGuestPhoto(clientId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/guests/${clientId}/photo/`, { method: "DELETE" });
}

/** Право hotel.guests.documents. */
export function uploadGuestDocumentPhoto(clientId: number, file: File): Promise<HotelGuest> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/document-photo/`, { method: "PUT", formData });
}

export function deleteGuestDocumentPhoto(clientId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/guests/${clientId}/document-photo/`, { method: "DELETE" });
}

// ── Интеграции (каналы продаж) ────────────────────────────────────────────

export interface HotelChannel {
  channel: "booking" | "ostrovok" | "expedia" | "bronevik";
  name: string;
  description: string;
  propertyId: number;
  isConnected: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSyncAt: string | null;
}

/** Все четыре канала из справочника с текущим состоянием. Только тумблер — настоящего синка нет. */
export function listChannels(propertyId: number, signal?: AbortSignal): Promise<HotelChannel[]> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelChannel[]>(`/v2/hotel/channels/${qs}`, { signal });
}

export function connectChannel(channel: string, propertyId: number): Promise<HotelChannel> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelChannel>(`/v2/hotel/channels/${channel}/connect/${qs}`, { method: "POST" });
}

export function disconnectChannel(channel: string, propertyId: number): Promise<HotelChannel> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelChannel>(`/v2/hotel/channels/${channel}/disconnect/${qs}`, { method: "POST" });
}

// ── Отчёты и дашборд ──────────────────────────────────────────────────────

export interface HotelDailyReportRow {
  roomId: number;
  roomNumber: string;
  roomTypeId: number;
  roomTypeName: string;
  isLuxury: boolean;
  state: string;
  occupancy: "free" | "occupied" | "blocked";
  nightPrice: Money | null;
  reservationId: number | null;
  reservationNumber: number | null;
  itemId: number | null;
  guestName: string;
  checkIn: string | null;
  checkOut: string | null;
  stayStatus: string | null;
  blockReason: string;
}

export interface HotelDailyReport {
  propertyId: number;
  date: string;
  currency: string;
  totalRooms: number;
  occupiedRooms: number;
  freeRooms: number;
  blockedRooms: number;
  occupancyPercent: string;
  arrivals: number;
  departures: number;
  /** Сумма цен ночей, занятых на эту дату номеров — не сумма броней целиком. */
  revenue: Money;
  rows: HotelDailyReportRow[];
}

export interface HotelRoomStateCounts {
  dirty: number;
  clean: number;
  inspected: number;
  repair: number;
}

export interface HotelDashboard {
  propertyId: number;
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  freeRooms: number;
  occupancyPercent: string;
  arrivals: number;
  arrived: number;
  overdueArrivals: number;
  walkIns: number;
  departures: number;
  departed: number;
  staying: number;
  /** Всегда на сейчас, независимо от переданной date. */
  roomState: HotelRoomStateCounts;
  openHousekeepingTasks: number;
  activeHolds: number;
}

export interface HotelOccupancyReport {
  propertyId: number;
  dateFrom: string;
  dateTo: string;
  currency: string;
  availableRoomNights: number;
  soldRoomNights: number;
  occupancyPercent: string;
  roomRevenue: Money;
  adr: Money;
  revpar: Money;
  arrivals: number;
  departures: number;
  cancellations: number;
  bySource: Record<string, number>;
}

export function getDailyReport(propertyId: number, date: string, signal?: AbortSignal): Promise<HotelDailyReport> {
  const qs = buildQuery({ propertyId, date });
  return apiRequest<HotelDailyReport>(`/v2/hotel/reports/daily/${qs}`, { signal });
}

export function getDashboard(propertyId: number, date?: string, signal?: AbortSignal): Promise<HotelDashboard> {
  const qs = buildQuery({ propertyId, date });
  return apiRequest<HotelDashboard>(`/v2/hotel/dashboard/${qs}`, { signal });
}

export function getOccupancyReport(
  propertyId: number,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<HotelOccupancyReport> {
  const qs = buildQuery({ propertyId, from, to });
  return apiRequest<HotelOccupancyReport>(`/v2/hotel/reports/occupancy/${qs}`, { signal });
}

// ── Кухня ─────────────────────────────────────────────────────────────────

export interface HotelIngredient {
  id: number;
  propertyId: number;
  name: string;
  unit: string;
  pricePerUnit: Money;
  stockQty: Qty;
  isActive: boolean;
}

export interface HotelIngredientCreateData {
  propertyId: number;
  name: string;
  unit: string;
  pricePerUnit?: Money;
  stockQty?: Qty;
}

export interface HotelIngredientUpdateData {
  name?: string;
  unit?: string;
  pricePerUnit?: Money;
  stockQty?: Qty;
  isActive?: boolean;
}

export interface HotelRecipeLineInput {
  ingredientId: number;
  qtyPerPortion: Qty;
}

export interface HotelRecipeLine {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  qtyPerPortion: Qty;
}

export interface HotelDish {
  id: number;
  propertyId: number;
  meal: "breakfast" | "lunch" | "dinner";
  name: string;
  portionsPerRoom: string;
  sortOrder: number;
  isActive: boolean;
  ingredients: HotelRecipeLine[];
}

export interface HotelDishCreateData {
  propertyId: number;
  meal: "breakfast" | "lunch" | "dinner";
  name: string;
  portionsPerRoom?: string;
  sortOrder?: number;
  ingredients?: HotelRecipeLineInput[];
}

export interface HotelDishUpdateData {
  meal?: "breakfast" | "lunch" | "dinner";
  name?: string;
  portionsPerRoom?: string;
  sortOrder?: number;
  isActive?: boolean;
  /** Полная замена рецепта. */
  ingredients?: HotelRecipeLineInput[];
}

export interface HotelPlannedDish {
  dishId: number;
  meal: string;
  name: string;
  portionsPerRoom: string;
  portions: number;
}

export interface HotelPurchase {
  id: number;
  propertyId: number;
  date: string;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  purchasedQty: Qty;
  actualPricePerUnit: Money;
  total: Money;
  purchasedById: number | null;
  purchasedByName: string;
  updatedAt: string;
}

export interface HotelShoppingLine {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  neededQty: Qty;
  inStockQty: Qty;
  toBuyQty: Qty;
  pricePerUnit: Money;
  plannedAmount: Money;
  purchase: HotelPurchase | null;
}

export interface HotelKitchenDayPlan {
  propertyId: number;
  date: string;
  occupiedRooms: number;
  dishes: HotelPlannedDish[];
  shoppingList: HotelShoppingLine[];
  plannedTotal: Money;
}

export interface HotelStockLine {
  ingredientId: number;
  stockQty: Qty;
}

export function listIngredients(propertyId: number, signal?: AbortSignal): Promise<HotelIngredient[]> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelIngredient[]>(`/v2/hotel/kitchen/ingredients/${qs}`, { signal });
}

export function createIngredient(data: HotelIngredientCreateData): Promise<HotelIngredient> {
  return apiRequest<HotelIngredient>("/v2/hotel/kitchen/ingredients/", { method: "POST", body: data });
}

/** 409 HAS_DEPENDENTS, если ингредиент в рецептах/закупках → updateIngredient(id, {isActive: false}). */
export function updateIngredient(id: number, data: HotelIngredientUpdateData): Promise<HotelIngredient> {
  return apiRequest<HotelIngredient>(`/v2/hotel/kitchen/ingredients/${id}/`, { method: "PATCH", body: data });
}

export function deleteIngredient(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/kitchen/ingredients/${id}/`, { method: "DELETE" });
}

/** Список ингредиентов объекта с текущим остатком (stockQty). */
export function getStock(propertyId: number, signal?: AbortSignal): Promise<HotelIngredient[]> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelIngredient[]>(`/v2/hotel/kitchen/stock/${qs}`, { signal });
}

export function updateStock(propertyId: number, lines: HotelStockLine[]): Promise<HotelIngredient[]> {
  return apiRequest<HotelIngredient[]>("/v2/hotel/kitchen/stock/", { method: "PATCH", body: { propertyId, lines } });
}

export function listDishes(
  propertyId: number,
  options: { meal?: "breakfast" | "lunch" | "dinner" } = {},
  signal?: AbortSignal,
): Promise<HotelDish[]> {
  const qs = buildQuery({ propertyId, meal: options.meal });
  return apiRequest<HotelDish[]>(`/v2/hotel/kitchen/dishes/${qs}`, { signal });
}

export function createDish(data: HotelDishCreateData): Promise<HotelDish> {
  return apiRequest<HotelDish>("/v2/hotel/kitchen/dishes/", { method: "POST", body: data });
}

export function updateDish(id: number, data: HotelDishUpdateData): Promise<HotelDish> {
  return apiRequest<HotelDish>(`/v2/hotel/kitchen/dishes/${id}/`, { method: "PATCH", body: data });
}

export function deleteDish(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/kitchen/dishes/${id}/`, { method: "DELETE" });
}

/** Блюда+порции+список закупки на дату одним вызовом — occupiedRooms из того же источника, что дашборд. */
export function getKitchenDayPlan(propertyId: number, date: string, signal?: AbortSignal): Promise<HotelKitchenDayPlan> {
  const qs = buildQuery({ propertyId, date });
  return apiRequest<HotelKitchenDayPlan>(`/v2/hotel/kitchen/day-plan/${qs}`, { signal });
}

export function listPurchases(
  propertyId: number,
  params: { date?: string; from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<HotelPurchase[]> {
  const qs = buildQuery({ propertyId, ...params });
  return apiRequest<HotelPurchase[]>(`/v2/hotel/kitchen/purchases/${qs}`, { signal });
}

/** Upsert по (дата, ингредиент). Факт закупки увеличивает stock на дельту (решение по ТЗ §5). */
export function upsertPurchase(data: {
  propertyId: number;
  date: string;
  ingredientId: number;
  purchasedQty: Qty;
  actualPricePerUnit: Money;
}): Promise<HotelPurchase> {
  return apiRequest<HotelPurchase>("/v2/hotel/kitchen/purchases/", { method: "POST", body: data });
}

/** Откатывает закупленное количество обратно в склад. */
export function deletePurchase(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/kitchen/purchases/${id}/`, { method: "DELETE" });
}

// ── Уборка — задачи (бонус, для «Заметок и указаний») ────────────────────────

export interface HotelHousekeepingTask {
  id: number;
  propertyId: number;
  roomId: number;
  roomNumber: string;
  roomHousekeepingState: string;
  reservationItemId: number | null;
  kind: "checkout" | "stayover" | "inspection" | "maintenance";
  status: "open" | "in_progress" | "done" | "cancelled";
  assignedToId: number | null;
  assignedToName: string;
  dueAt: string | null;
  note: string;
  completedAt: string | null;
  createdAt: string;
}

export interface HotelHousekeepingTaskListParams {
  propertyId: number;
  status?: "open" | "in_progress" | "done" | "cancelled";
  assignedToId?: number;
  mine?: boolean;
}

export interface HotelHousekeepingTaskCreateData {
  propertyId: number;
  roomId: number;
  kind?: "checkout" | "stayover" | "inspection" | "maintenance";
  assignedToId?: number | null;
  dueAt?: string | null;
  note?: string;
}

export interface HotelHousekeepingTaskUpdateData {
  status?: "open" | "in_progress" | "done" | "cancelled";
  /** Горничная закрывает задачу и сразу ставит состояние номера. */
  roomState?: string;
  assignedToId?: number | null;
  clearAssignee?: boolean;
  dueAt?: string | null;
  note?: string;
}

export function listHousekeepingTasks(
  params: HotelHousekeepingTaskListParams,
  signal?: AbortSignal,
): Promise<HotelHousekeepingTask[]> {
  const qs = buildQuery(params);
  return apiRequest<HotelHousekeepingTask[]>(`/v2/hotel/housekeeping-tasks/${qs}`, { signal });
}

export function createHousekeepingTask(data: HotelHousekeepingTaskCreateData): Promise<HotelHousekeepingTask> {
  return apiRequest<HotelHousekeepingTask>("/v2/hotel/housekeeping-tasks/", { method: "POST", body: data });
}

export function updateHousekeepingTask(
  id: number,
  data: HotelHousekeepingTaskUpdateData,
): Promise<HotelHousekeepingTask> {
  return apiRequest<HotelHousekeepingTask>(`/v2/hotel/housekeeping-tasks/${id}/`, { method: "PATCH", body: data });
}
