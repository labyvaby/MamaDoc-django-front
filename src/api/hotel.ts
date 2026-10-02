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
//
// Поля default* (defaultArea…defaultMealOptions) — ПРЕДЛОЖЕНИЕ фронта, бэком
// ЕЩЁ НЕ ПОДТВЕРЖДЕНО: просьба хранить на категории значения по умолчанию для
// «Доп. характеристик» номера, чтобы при массовом заведении номеров одной
// категории не перезабивать одно и то же в каждой форме. Пока это не
// выложено, POST/PATCH .../room-types/ с этими ключами либо получит 400
// (если бэк тоже держит forbid_unknown_fields), либо тихо их проигнорирует —
// см. черновик сообщения бек-разработчику в HotelRoomCategoryFormPage.tsx.

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
  /** Сколько номеров этой категории уже заведено — только чтение. Не путать с defaultRoomsCount ниже. */
  roomsCount: number;
  // ── Значения по умолчанию для «Доп. характеристик» нового номера этой категории.
  // ПРЕДЛОЖЕНИЕ, бэком ещё не подтверждено — см. комментарий у createRoomType
  // ниже. Подставляются в форму /rooms/new при выборе категории (HotelRoomFormPage.tsx)
  // и правятся тут же (HotelRoomCategoryFormPage.tsx); сам номер эти поля потом
  // хранит независимо — смена дефолта категории задним числом не трогает уже
  // созданные номера, только форму создания следующего.
  defaultArea: string | null;
  defaultCeilingHeight: string | null;
  /** Не путать с roomsCount выше (счётчик номеров категории) — это «жилых комнат внутри номера» по умолчанию. */
  defaultRoomsCount: number | null;
  defaultBathrooms: number | null;
  defaultWindowSide: string;
  defaultIsCorner: boolean;
  defaultLayoutDescription: string;
  /** Ключи из HotelCatalogs.mealOptions. */
  defaultMealOptions: string[];
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
  defaultArea?: string | null;
  defaultCeilingHeight?: string | null;
  defaultRoomsCount?: number | null;
  defaultBathrooms?: number | null;
  defaultWindowSide?: string;
  defaultIsCorner?: boolean;
  defaultLayoutDescription?: string;
  defaultMealOptions?: string[];
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
  defaultArea?: string | null;
  defaultCeilingHeight?: string | null;
  defaultRoomsCount?: number | null;
  defaultBathrooms?: number | null;
  defaultWindowSide?: string;
  defaultIsCorner?: boolean;
  defaultLayoutDescription?: string;
  defaultMealOptions?: string[];
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

// ── Динамическое ценообразование (PricingRule) ───────────────────────────────
//
// Контракт — «Ответ бэкенда: динамическое ценообразование отеля (Viva)»,
// 24.09.2026, ветка feat/hotel-dynamic-pricing (от test), миграция
// hotel.0006_dynamic_pricing. Финальная, полная версия — заменяет более
// раннюю (сезон/событие + только даты, без остальных условий), под которую
// были заведены первые HotelPricingRulesPage.tsx/HotelPricingRuleFormPage.tsx.
// Ключевое:
// — payload объявлен с forbid_unknown_fields=True — лишний ключ верхнего
//   уровня или внутри conditions (например, "occupancyTO") даёт 400, а не
//   молча игнорируется;
// — GET без includeInactive=true отдаёт только активные правила — выключенное
//   переключателем правило пропало бы из списка;
// — запись требует hotel.rates.manage (не hotel.manage), чтение — hotel.view;
//   у «Ресепшена» права на запись нет — см. useCan("hotel.rates.manage") в
//   HotelPricingRulesPage.tsx/HotelPricingRuleFormPage.tsx;
// — PATCH сверяет version с текущей — расхождение → 409 VERSION_CONFLICT;
//   conditions при PATCH заменяется целиком, не сливается с прежним;
// — правила применяются последовательно в порядке priority (не перемножаются
//   вслепую) — порядок значим; exclusiveGroup — из правил этой группы на
//   ночь применяется только первое подходящее (иначе «загрузка > 80%» и
//   «загрузка > 90%» сработали бы вместе);
// — category — только подпись для интерфейса, на расчёт не влияет: логику
//   определяют исключительно conditions;
// — stage ("night"/"booking") решает бэк сам по составу conditions: правило с
//   leadTime/nights или привязкой к тарифу — этапа брони, иначе — этапа ночи;
// — поправка "percent" — со знаком от −99 до 1000 (проценты от totalPrice
//   категории), "amount" — сумма за ночь со знаком в валюте объекта; цена
//   не уходит ниже нуля.
//
// Проценты/суммы нигде на фронте не пересчитываются — ни здесь, ни в форме:
// для предпросчёта есть simulatePricingRule (POST .../simulate/), который
// учитывает остальные действующие правила; локальная арифметика дала бы
// неверную картину при пересечении правил.

export interface HotelPricingRuleConditions {
  /** Загрузка НОЧИ ≥ значения, % (0–100). Категории — свои, если заданы roomTypeIds правила, иначе всего объекта. */
  occupancyFrom?: number;
  /** Загрузка ночи < значения, % (0–100) — не включая, ступени без пересечений. */
  occupancyTo?: number;
  /** Дней от сегодня (часовой пояс объекта) до заезда, включительно, 0–730. */
  leadTimeFrom?: number;
  leadTimeTo?: number;
  /** Ночей в брони, включительно, 1–365. */
  nightsFrom?: number;
  nightsTo?: number;
  /** День недели НОЧИ, ключи EN нижним регистром. */
  daysOfWeek?: Array<"monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday">;
  /** YYYY-MM-DD, включительно; равна dateFrom для правила на один день. */
  dateFrom?: string;
  dateTo?: string;
  /**
   * Действует в эти же dateFrom/dateTo каждый год, без учёта года. Диапазон
   * через Новый год (например, 31.12–02.01) бэк переходит корректно — сам
   * год в датах фронт не подгоняет.
   */
  recurringAnnually?: boolean;
}

/** Только подпись для интерфейса — группировка/подсказка мастера, на расчёт не влияет (см. conditions). */
export type HotelPricingRuleCategory =
  | "occupancy"
  | "last_minute"
  | "early_bird"
  | "weekday"
  | "season"
  | "event"
  | "length_of_stay"
  | "custom";

export interface HotelPricingRule {
  id: number;
  propertyId: number;
  name: string;
  adjustmentType: "percent" | "amount";
  /** "percent": знак важен, "20"/"-15", от −99 до 1000. "amount": сумма за ночь со знаком, "500"/"-300". */
  adjustmentValue: string;
  conditions: HotelPricingRuleConditions;
  /** Категории (HotelRoomType.id). Пустой массив — все категории объекта, включая заведённые позже. */
  roomTypeIds: number[];
  /** Тарифы (RatePlan.id). Пустой массив — все тарифы. */
  ratePlanIds: number[];
  /** Порядок применения при нескольких подходящих правилах — меньше значит раньше. */
  priority: number;
  /** Правила одной непустой группы — на ночь применяется только первое подходящее по priority. "" — вне групп. */
  exclusiveGroup: string;
  category: HotelPricingRuleCategory;
  /** Выключенное правило не влияет на цену, но не удаляется — например, сняли наценку на праздники. */
  isActive: boolean;
  /** Этап расчёта — решает бэк по составу conditions/ratePlanIds, фронт не выставляет. */
  stage: "night" | "booking";
  /** Отправлять обратно в PATCH — расхождение → 409 VERSION_CONFLICT. */
  version: number;
  createdById: number | null;
  createdByName: string;
  updatedById: number | null;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface HotelPricingRuleCreateData {
  propertyId: number;
  name: string;
  adjustmentType: "percent" | "amount";
  adjustmentValue: string;
  conditions: HotelPricingRuleConditions;
  roomTypeIds: number[];
  ratePlanIds?: number[];
  priority?: number;
  exclusiveGroup?: string;
  category: HotelPricingRuleCategory;
  isActive?: boolean;
}

export interface HotelPricingRuleUpdateData {
  name?: string;
  adjustmentType?: "percent" | "amount";
  adjustmentValue?: string;
  conditions?: HotelPricingRuleConditions;
  roomTypeIds?: number[];
  ratePlanIds?: number[];
  priority?: number;
  exclusiveGroup?: string;
  category?: HotelPricingRuleCategory;
  isActive?: boolean;
  /** Обязательно на любой PATCH — см. комментарий у HotelPricingRule.version. */
  version: number;
}

/** includeInactive всегда true — иначе выключенные переключателем правила пропадут из списка. */
export function listPricingRules(propertyId: number, signal?: AbortSignal): Promise<HotelPricingRule[]> {
  const qs = buildQuery({ propertyId, includeInactive: true });
  return apiRequest<HotelPricingRule[]>(`/v2/hotel/pricing-rules/${qs}`, { signal });
}

export function createPricingRule(data: HotelPricingRuleCreateData): Promise<HotelPricingRule> {
  return apiRequest<HotelPricingRule>("/v2/hotel/pricing-rules/", { method: "POST", body: data });
}

export function updatePricingRule(id: number, data: HotelPricingRuleUpdateData): Promise<HotelPricingRule> {
  return apiRequest<HotelPricingRule>(`/v2/hotel/pricing-rules/${id}/`, { method: "PATCH", body: data });
}

export function deletePricingRule(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/pricing-rules/${id}/`, { method: "DELETE" });
}

/**
 * Черновик правила, вложенный в запрос simulate/ (payloads.py: PricingRuleDraftPayload).
 * Лишние ключи верхнего уровня сервер отклоняет — category и isActive сюда
 * класть НЕЛЬЗЯ (400), они не часть черновика для расчёта.
 */
export interface HotelPricingRuleSimulateRuleDraft {
  adjustmentType: "percent" | "amount";
  adjustmentValue: string;
  conditions?: HotelPricingRuleConditions;
  /** По умолчанию 100, если не передать. */
  priority?: number;
  exclusiveGroup?: string;
  roomTypeIds?: number[];
  ratePlanIds?: number[];
  name?: string;
}

export interface HotelPricingRuleSimulateRequest {
  propertyId: number;
  /**
   * Окно расчёта — ВЕРХНЕУРОВНЕВЫЕ dateFrom/dateTo, не conditions черновика.
   * dateTo в окно НЕ входит (ночи [dateFrom, dateTo)): чтобы окно совпало с
   * периодом правила conditions.dateFrom–conditions.dateTo (включительно),
   * сюда — conditions.dateTo + 1 день. dateTo <= dateFrom → 400. Не длиннее
   * 366 дней.
   */
  dateFrom: string;
  dateTo: string;
  rule: HotelPricingRuleSimulateRuleDraft;
  /** При правке уже сохранённого правила — черновик заменяет его в расчёте «стало». null/не передавать — для нового. */
  ruleId?: number | null;
  /** Категории, которые попадут в ответ — не черновика. Пустой массив — все активные. */
  roomTypeIds: number[];
  /** Без него расчёт идёт по основному тарифу. */
  ratePlanId?: number;
}

export interface HotelPricingRuleSimulateNight {
  date: string;
  /** Строка-деньги, 2 знака после точки. */
  before: Money;
  after: Money;
  /** Может быть отрицательной ("-900.00"). */
  delta: Money;
  /**
   * true — черновик сработал на этой ночи (напрямую или через правила этапа
   * брони — срок до заезда/длительность/тариф — поверх ручной цены).
   * false + delta "0.00" — черновик не сработал: не подошли условия/категория
   * либо проиграл в своём exclusiveGroup (isManualOverride тут false).
   * true + delta "0.00" — цену упёрло в minPrice/maxPrice категории.
   */
  ruleApplied: boolean;
  /**
   * true — на эту дату стоит ручная цена; правила ночи её не меняют (booking-
   * этапные могут донастроить поверх — тогда возможны И isManualOverride, И
   * ruleApplied одновременно, это норма). Добавлено 24.09.2026, isManualOverride
   * на test.crm.
   */
  isManualOverride: boolean;
}

export interface HotelPricingRuleSimulateRoomType {
  roomTypeId: number;
  roomTypeName: string;
  nights: HotelPricingRuleSimulateNight[];
}

export interface HotelPricingRuleSimulateResult {
  propertyId: number;
  ratePlanId: number | null;
  dateFrom: string;
  dateTo: string;
  /** Сколько пар «ночь × категория» поменяли цену. */
  changedNights: number;
  /** На скольких сработал сам черновик. */
  matchedNights: number;
  /** null, только если ночей нет. */
  minAfter: Money | null;
  maxAfter: Money | null;
  /** Сгруппировано по категориям — плоского списка ночей нет. */
  roomTypes: HotelPricingRuleSimulateRoomType[];
}

/**
 * Живой предпросчёт черновика правила — цены «было → стало» с учётом остальных
 * действующих правил (тариф, округление, minPrice/maxPrice — та же цена, что
 * в pricing/quote/). Бронь считается одноночной: правило с nightsFrom не
 * сработает на предпросмотре. Ничего не сохраняет. Право hotel.rates.manage
 * (то же, что на запись правил, — форма уже им гейтит доступ целиком).
 */
export function simulatePricingRule(
  request: HotelPricingRuleSimulateRequest,
  signal?: AbortSignal,
): Promise<HotelPricingRuleSimulateResult> {
  return apiRequest<HotelPricingRuleSimulateResult>("/v2/hotel/pricing-rules/simulate/", {
    method: "POST",
    body: request,
    signal,
  });
}

// ── Предпросчёт суммы брони (quote) ──────────────────────────────────────────
//
// ПРЕДЛОЖЕНИЕ фронта, бэком НЕ ПОДТВЕРЖДЕНО. Точного контракта нет — есть
// только упоминание в комментарии выше («та же цена, что в pricing/quote/»):
// эндпоинт существует, форма запроса/ответа неизвестна. Путь и поля ниже —
// предположение по аналогии с HotelReservationItemInput/simulatePricingRule,
// на подтверждение бэком.
//
// Используется ТОЛЬКО как необязательный живой предпросмотр суммы в форме
// брони (CreateBookingButton) — 404/неожиданная форма ответа тихо гасится,
// предпросмотр просто не показывается, бронь всё равно создаётся как раньше.
// В payload createReservation ничего отсюда не добавляем: бэк уже проявлял
// forbid_unknown_fields на других ручках (см. комментарий у default* полей
// HotelRoomType), а создание брони — самая чувствительная запись модуля,
// ломать её угадыванием поля нельзя.
export interface HotelQuoteRequest {
  propertyId: number;
  roomId?: number | null;
  roomTypeId?: number | null;
  checkIn: string;
  checkOut: string;
  ratePlanId?: number | null;
  boardType?: string;
}

export interface HotelQuoteResult {
  currency: string;
  total: Money;
}

export function getQuote(request: HotelQuoteRequest, signal?: AbortSignal): Promise<HotelQuoteResult> {
  return apiRequest<HotelQuoteResult>("/v2/hotel/pricing/quote/", { method: "POST", body: request, signal });
}

// ── Допуслуги, начисления, юрлица, реестр оплат ─────────────────────────────

export interface HotelExtraService {
  id: number;
  propertyId: number;
  name: string;
  price: Money;
  isActive: boolean;
}

export interface HotelPage<T> {
  count: number;
  results: T[];
}

export function listExtraServices(
  propertyId: number,
  params: { q?: string; includeInactive?: boolean; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<HotelPage<HotelExtraService>> {
  const qs = buildQuery({ propertyId, ...params, includeInactive: params.includeInactive ? "true" : undefined });
  return apiRequest<HotelPage<HotelExtraService>>(`/v2/hotel/extra-services/${qs}`, { signal });
}

/** Право hotel.manage. */
export function createExtraService(data: { propertyId: number; name: string; price: Money }): Promise<HotelExtraService> {
  return apiRequest<HotelExtraService>("/v2/hotel/extra-services/", { method: "POST", body: data });
}

export function updateExtraService(id: number, data: { name?: string; price?: Money; isActive?: boolean }): Promise<HotelExtraService> {
  return apiRequest<HotelExtraService>(`/v2/hotel/extra-services/${id}/`, { method: "PATCH", body: data });
}

/** Архивирует услугу; сохранённые начисления остаются. */
export function archiveExtraService(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/extra-services/${id}/`, { method: "DELETE" });
}

export interface HotelCharge {
  id: number;
  reservationId: number;
  serviceId: number | null;
  name: string;
  quantity: string;
  price: Money;
  totalAmount: Money;
  date: string;
  comment: string;
  createdById: number | null;
  createdByName: string;
  createdAt: string;
  voidedAt: string | null;
  voidedById: number | null;
  voidedByName: string;
}

export interface HotelChargeList extends HotelPage<HotelCharge> {
  reservationId: number;
  totalAmount: Money;
  paidAmount: Money;
  balanceDue: Money;
  currency: string;
  version: number;
}

export function listCharges(reservationId: number, params: { includeVoided?: boolean } = {}, signal?: AbortSignal): Promise<HotelChargeList> {
  const qs = buildQuery({ includeVoided: params.includeVoided ? "true" : undefined, limit: 200 });
  return apiRequest<HotelChargeList>(`/v2/hotel/reservations/${reservationId}/charges/${qs}`, { signal });
}

export interface HotelChargeCreateData {
  /** Из справочника — название и цена берутся оттуда. */
  serviceId?: number;
  /** Разовая услуга без справочника (или согласованная цена с serviceId). */
  name?: string;
  price?: Money;
  /** > 0, до трёх знаков. */
  quantity: string;
  date?: string;
  comment?: string;
  /** Версия брони: расхождение — 409 VERSION_CONFLICT. */
  version: number;
}

/** Право hotel.payments.manage. Нельзя для отменённой брони и no-show (409 INVALID_TRANSITION). */
export function addCharge(reservationId: number, data: HotelChargeCreateData): Promise<HotelCharge> {
  return apiRequest<HotelCharge>(`/v2/hotel/reservations/${reservationId}/charges/`, { method: "POST", body: data });
}

/** Отменяет строку, автор и история сохраняются. Повтор безопасен. */
export function voidCharge(reservationId: number, chargeId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/reservations/${reservationId}/charges/${chargeId}/`, { method: "DELETE" });
}

export interface HotelCorporateAccount {
  id: number;
  propertyId: number;
  name: string;
  inn: string;
  bankDetails: string;
  contract: string;
  /** 0–100. */
  discountPercent: string;
  isActive: boolean;
}

export interface HotelCorporateAccountData {
  name: string;
  inn?: string;
  bankDetails?: string;
  contract?: string;
  discountPercent?: string;
}

export function listCorporateAccounts(
  propertyId: number,
  params: { q?: string; includeInactive?: boolean; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<HotelPage<HotelCorporateAccount>> {
  const qs = buildQuery({ propertyId, ...params, includeInactive: params.includeInactive ? "true" : undefined });
  return apiRequest<HotelPage<HotelCorporateAccount>>(`/v2/hotel/corporate-accounts/${qs}`, { signal });
}

/** Право hotel.manage. Непустой ИНН уникален в объекте. */
export function createCorporateAccount(propertyId: number, data: HotelCorporateAccountData): Promise<HotelCorporateAccount> {
  return apiRequest<HotelCorporateAccount>("/v2/hotel/corporate-accounts/", { method: "POST", body: { propertyId, ...data } });
}

export function updateCorporateAccount(id: number, data: Partial<HotelCorporateAccountData> & { isActive?: boolean }): Promise<HotelCorporateAccount> {
  return apiRequest<HotelCorporateAccount>(`/v2/hotel/corporate-accounts/${id}/`, { method: "PATCH", body: data });
}

/** Архивирует юрлицо; привязанные брони не меняются. */
export function archiveCorporateAccount(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/corporate-accounts/${id}/`, { method: "DELETE" });
}

export interface HotelPaymentRegisterTotal {
  method: string;
  methodLabel: string;
  currency: string;
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  payments: Money;
  refunds: Money;
  net: Money;
}

export interface HotelPaymentRegister extends HotelPage<HotelPayment> {
  /** По всему фильтру, не только по странице; группы — способ × валюта × терминал. */
  totals: HotelPaymentRegisterTotal[];
  propertyId: number;
  dateFrom: string;
  dateTo: string;
}

/** Реестр оплат и возвратов для сверки кассы (hotel.payments.manage). from включительно, to исключительно, в часовом поясе объекта. */
export function listPaymentRegister(
  params: { propertyId: number; from?: string; to?: string; acceptedById?: number; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<HotelPaymentRegister> {
  return apiRequest<HotelPaymentRegister>(`/v2/hotel/payments/${buildQuery(params)}`, { signal });
}

export interface HotelPublicBookingSettings {
  propertyId: number;
  publicSlug: string | null;
  publicBookingEnabled: boolean;
}

export function getPublicBookingSettings(propertyId: number, signal?: AbortSignal): Promise<HotelPublicBookingSettings> {
  return apiRequest<HotelPublicBookingSettings>(`/v2/hotel/properties/${propertyId}/public-booking/`, { signal });
}

/** Право hotel.manage. Slug: 3–80 символов, a–z, цифры, дефис; уникален. */
export function updatePublicBookingSettings(
  propertyId: number,
  data: { publicSlug?: string; publicBookingEnabled?: boolean },
): Promise<HotelPublicBookingSettings> {
  return apiRequest<HotelPublicBookingSettings>(`/v2/hotel/properties/${propertyId}/public-booking/`, { method: "PATCH", body: data });
}

// ── Тарифные планы (RatePlan) ───────────────────────────────────────────────

/**
 * Тарифный план: «Основной» (isBase, один на объект, выключить нельзя) и
 * производные — цена = цена родителя ± adjustment (percent со знаком, amount —
 * сумма за ночь со знаком). roomTypeIds пустой — для всех категорий.
 */
export interface HotelRatePlan {
  id: number;
  propertyId: number;
  roomTypeIds: number[];
  name: string;
  code: string;
  currency: string;
  mealPlan: string;
  minNights: number;
  prepaymentPercent: string;
  cancellationPolicy: string;
  includedServices: string;
  isActive: boolean;
  isBase: boolean;
  parentId: number | null;
  adjustmentType: "percent" | "amount";
  adjustmentValue: Money;
}

export interface HotelRatePlanCreateData {
  propertyId: number;
  name: string;
  roomTypeIds?: number[];
  code?: string;
  mealPlan?: string;
  minNights?: number;
  prepaymentPercent?: string;
  cancellationPolicy?: string;
  includedServices?: string;
  parentId?: number | null;
  adjustmentType?: "percent" | "amount";
  adjustmentValue?: Money;
}

export interface HotelRatePlanUpdateData extends Omit<Partial<HotelRatePlanCreateData>, "propertyId"> {
  isActive?: boolean;
  /** Отвязать от родителя — цена снова от категорий. */
  clearParent?: boolean;
}

export function listRatePlans(propertyId: number, signal?: AbortSignal, options: { includeInactive?: boolean } = {}): Promise<HotelRatePlan[]> {
  const qs = buildQuery({ propertyId, includeInactive: options.includeInactive ? "true" : undefined });
  return apiRequest<HotelRatePlan[]>(`/v2/hotel/rate-plans/${qs}`, { signal });
}

/** Право hotel.rates.manage. Удаления нет — план выключают (isActive=false). */
export function createRatePlan(data: HotelRatePlanCreateData): Promise<HotelRatePlan> {
  return apiRequest<HotelRatePlan>("/v2/hotel/rate-plans/", { method: "POST", body: data });
}

export function updateRatePlan(id: number, data: HotelRatePlanUpdateData): Promise<HotelRatePlan> {
  return apiRequest<HotelRatePlan>(`/v2/hotel/rate-plans/${id}/`, { method: "PATCH", body: data });
}

// ── Календарь цен и история цен ─────────────────────────────────────────────

/** Шаг расчёта цены ночи: kind — rule | manual | rate_plan | floor | ceiling | rounding. */
export interface HotelPriceStep {
  kind: string;
  stage: string | null;
  ruleId: number | null;
  ruleVersion: number | null;
  name: string;
  adjustmentType: string | null;
  adjustmentValue: string | null;
  amountBefore: string;
  amountAfter: string;
}

export interface HotelPriceNight {
  date: string;
  basePrice: Money;
  barPrice: Money;
  /** Цена одной ночи с заездом в эту дату по выбранному тарифу. */
  price: Money;
  isManualOverride: boolean;
  manualPrice: Money | null;
  overrideReason: string;
  overrideById: number | null;
  overrideByName: string;
  overrideAt: string | null;
  /** Процент проданных номеров категории. */
  occupancy: string;
  capacity: number;
  occupied: number;
  available: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minNights: number | null;
  maxNights: number | null;
  appliedRules: HotelPriceStep[];
}

export interface HotelPriceCalendarRoomType {
  roomTypeId: number;
  roomTypeName: string;
  basePrice: Money;
  minPrice: Money | null;
  maxPrice: Money | null;
  nights: HotelPriceNight[];
}

export interface HotelPriceCalendar {
  propertyId: number;
  ratePlanId: number | null;
  ratePlanName: string;
  dateFrom: string;
  dateTo: string;
  /** Процент проданных номеров объекта по ночам (ключ — дата). */
  propertyOccupancy: Record<string, string>;
  roomTypes: HotelPriceCalendarRoomType[];
}

/** Сетка цен: категории × ночи. to не включается, диапазон ≤ 62 дня. Без ratePlanId — основной тариф. */
export function getPriceCalendar(
  params: { propertyId: number; from: string; to: string; ratePlanId?: number; roomTypeId?: number },
  signal?: AbortSignal,
): Promise<HotelPriceCalendar> {
  return apiRequest<HotelPriceCalendar>(`/v2/hotel/pricing/calendar/${buildQuery(params)}`, { signal });
}

/**
 * Одно изменение на диапазон дат (dateTo не включается): своя цена или
 * clearPrice — «вернуть к авторасчёту», стоп-продажа, мин./макс. ночей.
 * null/undefined — не трогать. Каждый вызов — строка «Истории цен».
 */
export interface HotelDailyRateChange {
  roomTypeId: number;
  dateFrom: string;
  dateTo: string;
  price?: Money;
  clearPrice?: boolean;
  reason?: string;
  stopSell?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  minNights?: number;
  clearMinNights?: boolean;
  maxNights?: number;
  clearMaxNights?: boolean;
}

/** Право hotel.rates.manage. Ответ — сколько ночей изменено. */
export function setDailyRates(ratePlanId: number, change: HotelDailyRateChange): Promise<{ nights: number }> {
  return apiRequest<{ nights: number }>(`/v2/hotel/rate-plans/${ratePlanId}/daily-rates/`, { method: "PUT", body: change });
}

/** kind: daily_rate | rule_created | rule_updated | rule_deleted | rate_plan | room_type. */
export interface HotelPricingChange {
  id: number;
  kind: string;
  ruleId: number | null;
  ratePlanId: number | null;
  roomTypeId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Для правил — { поле: { old, new } } или снимок правила; для дат — новые значения. */
  changes: Record<string, unknown>;
  reason: string;
  userId: number | null;
  userName: string;
  createdAt: string;
}

/** Кто, когда и почему менял цены. Право hotel.rates.manage. Новые сверху. */
export function listPricingHistory(
  params: { propertyId: number; roomTypeId?: number; ruleId?: number; kind?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<{ count: number; results: HotelPricingChange[] }> {
  return apiRequest<{ count: number; results: HotelPricingChange[] }>(`/v2/hotel/pricing/history/${buildQuery(params)}`, { signal });
}

// ── Номера (Room) ─────────────────────────────────────────────────────────
//
// Терраса/экспликация/фото — контракт подтверждён и выложен, «Ответ бэкенда:
// API номера — терраса, экспликация и фото» (room-terrace-zones-photos-api.md),
// backend-коммит 6e739de6 ветки test, миграция hotel.0012. hasTerrace/
// terraceArea/roomZones — обычные поля POST/PATCH (см. семантику null/clear*
// у HotelRoomUpdateData ниже). Фото — POST multipart .../rooms/{id}/photos/
// (поле file, JPG/JPEG/PNG/WebP/HEIC до 10 МБ, hotel.manage) → HotelRoomPhoto,
// DELETE .../rooms/{id}/photos/{photoId}/ → 204 (см. uploadRoomPhoto/
// deleteRoomPhoto). На 27.09.2026 два blue-green прохода тестового контура
// не прошли health-check — активен предыдущий blue без этих полей; на
// test.crm.operator.kg код может недоступен, пока green не восстановят.

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
  // ── Терраса/лоджия и разбивка на зоны — см. комментарий над HotelRoom.
  // Все поля необязательные.
  hasTerrace: boolean;
  terraceArea: string | null;
  /** Именованные зоны номера («Кухня-гостиная», «Спальня»…) с площадью — для суитов из нескольких помещений. [] — не заполнено. */
  roomZones: HotelRoomZone[];
  /** Фото номера, по sortOrder затем id — см. uploadRoomPhoto/deleteRoomPhoto. */
  photos: HotelRoomPhoto[];
}

export interface HotelRoomZone {
  name: string;
  /** Десятичная строка, м², как area у номера. */
  area: string;
  /** Ширина/длина, м — десятичная строка либо не указана. */
  width: string | null;
  length: string | null;
}

export interface HotelRoomPhoto {
  id: number;
  url: string;
  sortOrder: number;
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
  hasTerrace?: boolean;
  terraceArea?: string | null;
  roomZones?: HotelRoomZone[];
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
  hasTerrace?: boolean;
  terraceArea?: string | null;
  roomZones?: HotelRoomZone[];
  /** null у area/ceilingHeight/bathrooms/roomsCount значит «поле не прислали» — для очистки шлём этот флаг. */
  clearArea?: boolean;
  clearCeilingHeight?: boolean;
  clearBathrooms?: boolean;
  clearRoomsCount?: boolean;
  clearTerraceArea?: boolean;
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

/** JPG/JPEG/PNG/WebP/HEIC до 10 МБ, право hotel.manage. Новое фото получает следующий sortOrder. */
export function uploadRoomPhoto(roomId: number, file: File): Promise<HotelRoomPhoto> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelRoomPhoto>(`/v2/hotel/rooms/${roomId}/photos/`, { method: "POST", formData });
}

export function deleteRoomPhoto(roomId: number, photoId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/rooms/${roomId}/photos/${photoId}/`, { method: "DELETE" });
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
  /** Оплаты по брони — появятся в календаре после доработки бэка; пока долг берётся из списка броней (useStayBalances). */
  paidAmount?: Money;
  balanceDue?: Money;
  currency?: string;
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

/** dateTo не включается — как выезд у брони: блок 5→8 закрывает ночи 5, 6 и 7. */
export interface HotelRoomBlockCreateData {
  roomId: number;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

/** Снять номер с продажи (hotel.manage). 409 NO_AVAILABILITY — в номере бронь или категория продана полностью. */
export function createRoomBlock(data: HotelRoomBlockCreateData): Promise<HotelRoomBlock> {
  return apiRequest<HotelRoomBlock>("/v2/hotel/room-blocks/", { method: "POST", body: data });
}

/** Вернуть в продажу. Блок остаётся в истории с isActive=false. */
export function releaseRoomBlock(id: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/room-blocks/${id}/`, { method: "DELETE" });
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
  /** Оборотная сторона ID-карты резидента (contract v2.3). null без права или если ещё не загружена. */
  documentPhotoBackUrl: string | null;
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
  /** Юрлицо из справочника: скидка идёт на проживание, не на допуслуги. */
  corporateAccountId?: number | null;
  /** Сумма, которую видел гость; при расхождении 409 PRICE_CHANGED. Для корпоративной — после скидки. */
  expectedTotal?: Money;
}

export interface HotelReservationLog {
  id: number;
  userId: number | null;
  /** Имя сотрудника (userId — технический id). */
  userName?: string;
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
  /** Юрлицо брони (название и процент зафиксированы в момент привязки). */
  corporateAccountId?: number | null;
  corporateName?: string;
  corporateDiscountPercent?: string;
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
  corporateAccountId?: number | null;
  /** Отвязать юрлицо — сумма пересчитывается без скидки. */
  clearCorporateAccount?: boolean;
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

/**
 * Оборотная сторона ID-карты резидента на брони (contract v2.3) — только хранится,
 * для загранпаспорта иностранца не шлём. Право hotel.guests.documents.
 */
export function uploadStayDocumentPhotoBack(
  reservationId: number,
  guestId: number,
  file: File,
): Promise<HotelReservationGuest> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelReservationGuest>(
    `/v2/hotel/reservations/${reservationId}/guests/${guestId}/document-photo-back/`,
    { method: "PUT", formData },
  );
}

export function deleteStayDocumentPhotoBack(reservationId: number, guestId: number): Promise<HotelReservationGuest> {
  return apiRequest<HotelReservationGuest>(
    `/v2/hotel/reservations/${reservationId}/guests/${guestId}/document-photo-back/`,
    { method: "DELETE" },
  );
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
  /** Способ безнала (тот же справочник, что у оплаты приёма, «Настройки → Способы безнала») — null, если не указан. */
  cashlessMethodId: number | null;
  /** Название способа на момент платежа — для показа, даже если способ потом скрыли. */
  cashlessMethodName: string;
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
  /** Необязательно — тот же справочник, что у оплаты приёма. Для refund без явного значения наследуется способ последнего платежа. */
  cashlessMethodId?: number | null;
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
  /** Оборотная сторона ID-карты резидента (contract v2.3). null без права hotel.guests.documents или если ещё не загружена. */
  documentPhotoBackUrl: string | null;
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

/** Удалить гостя без броней (hotel.guests.manage). С бронями или записями других модулей — 409 HAS_DEPENDENTS. */
export function deleteGuest(clientId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/guests/${clientId}/`, { method: "DELETE" });
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

/**
 * Оборотная сторона ID-карты резидента (contract v2.3) — только хранится, scan-document/
 * её не распознаёт, поэтому для загранпаспорта иностранца эти вызовы не шлём. Право
 * hotel.guests.documents, лицевая сторона (document-photo/) при этом не трогается.
 */
export function uploadGuestDocumentPhotoBack(clientId: number, file: File): Promise<HotelGuest> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/document-photo-back/`, { method: "PUT", formData });
}

export function deleteGuestDocumentPhotoBack(clientId: number): Promise<HotelGuest> {
  return apiRequest<HotelGuest>(`/v2/hotel/guests/${clientId}/document-photo-back/`, { method: "DELETE" });
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
  /** #RRGGBB — цвет канала в отметках броней и легенде; по умолчанию #64748b. */
  color: string;
}

/** Цвет канала (право hotel.channels.manage). Не меняет подключение. `channel` — ключ из API, не название. */
export function setChannelColor(channel: string, propertyId: number, color: string): Promise<HotelChannel> {
  const qs = buildQuery({ propertyId });
  return apiRequest<HotelChannel>(`/v2/hotel/channels/${channel}/${qs}`, { method: "PATCH", body: { color } });
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

// ── Channex.io (настоящий канал-менеджер: Booking.com/Airbnb/Expedia) ──────
// hotel-channex-integration.md, 24.09.2026. Экран «Каналы» первого этапа
// (выше) остаётся фолбэком на случай 409 CHANNEX_DISABLED — после реального
// подключения фронт показывает экран Channex вместо переключателей.

export interface HotelChannexPush {
  kind: string;
  status: string;
  isFullSync: boolean;
  valuesCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  taskIds: string[];
  warningsCount: number;
  error: string | null;
  createdAt: string;
}

export interface HotelChannexAttentionItem {
  id: number;
  state: string;
  status: string;
  otaName: string;
  otaReservationCode: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  reservationId: number | null;
  reservationNumber: string | null;
  message: string;
}

export interface HotelChannexStatus {
  propertyId: number;
  enabled: boolean;
  connected: boolean;
  state: "connecting" | "active" | "paused" | "error" | null;
  channexPropertyId: string | null;
  lastPushAt: string | null;
  fullSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  pendingChanges: number;
  mappedRoomTypes: number;
  mappedRatePlans: number;
  recentPushes: HotelChannexPush[];
  attention: HotelChannexAttentionItem[];
}

/** 409 CHANNEX_DISABLED — Channex ещё не подключён объекту, показывать старый экран каналов. */
export function getChannexStatus(propertyId: number, signal?: AbortSignal): Promise<HotelChannexStatus> {
  return apiRequest<HotelChannexStatus>(`/v2/hotel/properties/${propertyId}/channex/`, { signal });
}

export function connectChannex(propertyId: number): Promise<HotelChannexStatus> {
  return apiRequest<HotelChannexStatus>(`/v2/hotel/properties/${propertyId}/channex/connect/`, { method: "POST" });
}

export function pauseChannex(propertyId: number): Promise<HotelChannexStatus> {
  return apiRequest<HotelChannexStatus>(`/v2/hotel/properties/${propertyId}/channex/pause/`, { method: "POST" });
}

/** 409 FULL_SYNC_TOO_OFTEN — details.availableAt подсказывает, когда можно повторить. */
export function fullSyncChannex(propertyId: number): Promise<HotelChannexStatus> {
  return apiRequest<HotelChannexStatus>(`/v2/hotel/properties/${propertyId}/channex/full-sync/`, { method: "POST" });
}

/** Ссылка на встраиваемую в iframe страницу маппинга номеров/тарифов Channex. 502 CHANNEX_UNAVAILABLE возможен. */
export function createChannexChannelsSession(propertyId: number): Promise<{ url: string; expiresAt: string }> {
  return apiRequest<{ url: string; expiresAt: string }>(
    `/v2/hotel/properties/${propertyId}/channex/channels-session/`,
    { method: "POST" },
  );
}

export function retryChannexRevision(propertyId: number, revisionId: number): Promise<void> {
  return apiRequest<void>(`/v2/hotel/properties/${propertyId}/channex/revisions/${revisionId}/retry/`, {
    method: "POST",
  });
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
  /** Свободные в продаже: total − occupied − снятые с продажи на дату. */
  freeRooms: number;
  /**
   * Сняты с продажи на дату. Дашборд бэка пока его не сериализует (считает
   * внутри, из того же дневного отчёта) — фронт тогда берёт total − occupied − free.
   */
  blockedRooms?: number;
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
  /** Порций на одного гостя (> 0). */
  portionsPerGuest: string;
  /** @deprecated Старое имя portionsPerGuest; бэк ещё отдаёт его как alias — не показывать отдельно. */
  portionsPerRoom: string;
  sortOrder: number;
  isActive: boolean;
  ingredients: HotelRecipeLine[];
}

export interface HotelDishCreateData {
  propertyId: number;
  meal: "breakfast" | "lunch" | "dinner";
  name: string;
  /** Порций на одного гостя (> 0). Старое portionsPerRoom не отправляем. */
  portionsPerGuest?: string;
  sortOrder?: number;
  ingredients?: HotelRecipeLineInput[];
}

export interface HotelDishUpdateData {
  meal?: "breakfast" | "lunch" | "dinner";
  name?: string;
  portionsPerGuest?: string;
  sortOrder?: number;
  isActive?: boolean;
  /** Полная замена рецепта. */
  ingredients?: HotelRecipeLineInput[];
}

export interface HotelPlannedDish {
  dishId: number;
  meal: string;
  name: string;
  portionsPerGuest: string;
  /** @deprecated Старое имя portionsPerGuest; бэк ещё отдаёт его как alias — не показывать отдельно. */
  portionsPerRoom: string;
  /** round(occupiedGuests × portionsPerGuest), без минимума: нет гостей — 0. */
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
  /** Взрослые + дети в подтверждённых проживаниях на дату — база порций. */
  occupiedGuests: number;
  dishes: HotelPlannedDish[];
  shoppingList: HotelShoppingLine[];
  plannedTotal: Money;
}

export interface HotelStockLine {
  ingredientId: number;
  stockQty: Qty;
}

/** includeInactive — вместе со скрытыми (справочник продуктов на «Кухне»). */
export function listIngredients(
  propertyId: number,
  signal?: AbortSignal,
  options: { includeInactive?: boolean } = {},
): Promise<HotelIngredient[]> {
  const qs = buildQuery({ propertyId, includeInactive: options.includeInactive ? "true" : undefined });
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
  options: { meal?: "breakfast" | "lunch" | "dinner"; includeInactive?: boolean } = {},
  signal?: AbortSignal,
): Promise<HotelDish[]> {
  const qs = buildQuery({ propertyId, meal: options.meal, includeInactive: options.includeInactive ? "true" : undefined });
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

/** Блюда+порции+список закупки на дату одним вызовом; порции бэк считает от occupiedGuests. */
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

// ── События города (календарь событий) ────────────────────────────────────
//
// Концерты, фестивали, праздники и форумы, из-за которых растёт спрос на
// номера (пример заказчика: концерт звезды в Бишкеке — цены на эти ночи надо
// поднять). Эндпоинт ниже — контракт для бэка; пока он отвечает 404, фронт
// показывает демо-данные (src/dev/useCityEvents.ts → cityEventsMock.ts). Откуда бэк берёт события (афиши, госкалендарь, ручной ввод) —
// его решение; фронту важен только этот ответ.

export type HotelCityEventCategory = "concert" | "festival" | "holiday" | "sport" | "business" | "other";

/** Ожидаемый рост спроса на номера: заметный / высокий / пиковый (город переполнен). */
export type HotelCityEventDemand = "moderate" | "high" | "peak";

export interface HotelCityEvent {
  /** Строка: у внешних источников свои идентификаторы. */
  id: string;
  title: string;
  category: HotelCityEventCategory;
  city: string;
  venue: string;
  /** Первый и последний день события, включительно (YYYY-MM-DD). */
  dateFrom: string;
  dateTo: string;
  /** Ожидаемое число посетителей; null — неизвестно. */
  expectedAttendance: number | null;
  demand: HotelCityEventDemand;
  /** Рекомендованная наценка к цене ночи, % (целое, > 0). */
  suggestedMarkupPercent: number;
  description: string;
  /** Откуда событие: «Афиша», «Госкалендарь», «Добавлено вручную»… */
  source: string;
  sourceUrl: string | null;
  /** Добавлено сотрудником отеля, а не пришло из источника. */
  isManual: boolean;
}

export interface HotelCityEventCreateData {
  propertyId: number;
  title: string;
  category: HotelCityEventCategory;
  venue?: string;
  dateFrom: string;
  dateTo: string;
  expectedAttendance?: number | null;
  demand: HotelCityEventDemand;
  suggestedMarkupPercent: number;
  description?: string;
}

/** GET /v2/hotel/city-events/?propertyId&dateFrom&dateTo — события города объекта, пересекающие период. */
export function listCityEvents(
  params: { propertyId: number; dateFrom: string; dateTo: string },
  signal?: AbortSignal,
): Promise<HotelCityEvent[]> {
  return apiRequest<HotelCityEvent[]>(`/v2/hotel/city-events/${buildQuery(params)}`, { signal });
}

/** POST /v2/hotel/city-events/ — событие, добавленное вручную (isManual: true в ответе). */
export function createCityEvent(data: HotelCityEventCreateData): Promise<HotelCityEvent> {
  return apiRequest<HotelCityEvent>("/v2/hotel/city-events/", { method: "POST", body: data });
}
