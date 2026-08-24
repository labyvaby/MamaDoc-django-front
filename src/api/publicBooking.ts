import {
  API_BASE,
  ApiError,
  extractErrorMessage,
  NETWORK_ERROR_MESSAGE,
  notifyRateLimited,
} from "./client";

// ── Публичный booking-API (`/api/v1`) ────────────────────────────────────────
// Контракт: docs `public-booking-api-contract.md` (2026-07-24).
// Отдельный публичный слой CRM-бэка: `AllowAny`, без сессии/CSRF/credentials,
// только GET (пока read-only каталог + доступность). Поля — snake_case, деньги
// строкой. На фронте всё приводим к camelCase (конвенция проекта).
//
// ⚠ Создание брони (POST /bookings/), авторизация пациента, оплата и написание
// отзыва на бэке НЕ реализованы (§7 контракта). См. createGuestBooking ниже —
// это ПРЕДЛОЖЕННЫЙ фронтом контракт гостевой брони, не подтверждённый бэком.

/**
 * База публичного API. Staff-API живёт на `.../api`, публичный — на `.../api/v1`.
 * Выводим из VITE_API_URL (отрезаем хвост `/api`), с возможностью явного
 * override через VITE_PUBLIC_API_URL. Деплой фронта: `/api/v1` (см. §9 контракта).
 */
export const PUBLIC_API_BASE =
  import.meta.env.VITE_PUBLIC_API_URL ||
  `${API_BASE.replace(/\/api\/?$/, "")}/api/v1`;

/**
 * Организация, к которой скоупится публичный сайт записи. `/api/v1` мультиарендный
 * (отдаёт врачей ВСЕХ организаций по умолчанию), а наш сайт — для одной клиники.
 * Меняется через env `VITE_BOOKING_ORG_SLUG`; дефолт — «Мама Доктор».
 */
export const BOOKING_ORG_SLUG = import.meta.env.VITE_BOOKING_ORG_SLUG || "mama-doktor";

// ── Envelope ──────────────────────────────────────────────────────────────────

/** Пагинация публичного API (не DRF: page/limit/total, не count/next/previous). */
export interface PublicPagination {
  page: number;
  limit: number;
  total: number;
}

interface ListEnvelope<T> {
  data: T[];
  pagination: PublicPagination;
}

interface ItemEnvelope<T> {
  data: T;
}

/** Список + пагинация, уже распакованные и приведённые к camelCase. */
export interface PublicList<T> {
  items: T[];
  pagination: PublicPagination;
}

// ── snake_case → camelCase (глубокий маппинг) ─────────────────────────────────

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Рекурсивно переводит ключи объекта/массива в camelCase. Значения не трогает. */
function camelizeDeep(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(camelizeDeep);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[snakeToCamel(k)] = camelizeDeep(v);
    }
    return out;
  }
  return input;
}

// ── Низкоуровневый запрос ─────────────────────────────────────────────────────

interface PublicRequestOptions {
  signal?: AbortSignal;
  method?: string;
  body?: unknown;
  /** Доп. заголовки — нужны кабинету пациента (`X-Patient-Token`). */
  headers?: Record<string, string>;
}

/**
 * GET/POST к публичному API. Без credentials (публичный AllowAny). Ошибки бэка
 * приходят как `{ error, message, details }` — extractErrorMessage их разбирает.
 * Возвращает СЫРОЙ (snake_case) payload; распаковка/camelize — в обёртках ниже.
 */
export async function publicRawRequest<T>(
  path: string,
  { signal, method = "GET", body, headers }: PublicRequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PUBLIC_API_BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (import.meta.env.DEV) console.error("[publicBooking] network error:", err);
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null);
  }

  if (response.status === 204) return undefined as T;
  if (response.status === 429) notifyRateLimited();

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

/** GET одиночного ресурса: `{ data }` → camelCase T. */
export async function getItem<T>(
  path: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const raw = await publicRawRequest<ItemEnvelope<unknown>>(path, { signal, headers });
  return camelizeDeep(raw.data) as T;
}

/**
 * GET списка: `{ data, pagination }` → `{ items, pagination }`. Часть ручек
 * (`/me/bookings/`) конверт без `pagination` — тогда подставляем размер выборки,
 * чтобы вызывающий код не проверял поле на undefined.
 */
export async function getList<T>(
  path: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<PublicList<T>> {
  const raw = await publicRawRequest<ListEnvelope<unknown>>(path, { signal, headers });
  const items = (raw.data ?? []).map((x) => camelizeDeep(x) as T);
  return {
    items,
    pagination: raw.pagination ?? { page: 1, limit: items.length, total: items.length },
  };
}

/** Тело-объект в camelCase → snake_case (публичный API принимает snake). */
export function snakeizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

// ── Общие типы ────────────────────────────────────────────────────────────────

/** Краткая ссылка на организацию/филиал внутри других ресурсов. */
export interface PublicRef {
  id: number;
  slug: string;
  name: string;
  /** Присутствует у branch-ссылки в professional detail. */
  address?: string;
}

/** consultation_type врача. */
export type ConsultationType = "in_person" | "online" | "both" | null;

/** Категория услуги (совпадает со staff-категориями услуг). */
export type ServiceCategory = "doctor" | "nurse" | "lab" | "hardware" | string;

// ── Каталог (§2) ──────────────────────────────────────────────────────────────

/** Специализация (specialist shape, §2). */
export interface Specialist {
  id: number;
  title: string;
  slug: string;
  description: string;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Организация — превью (§2). */
export interface OrganizationPreview {
  id: number;
  slug: string;
  name: string;
  branchesCount: number;
  specialistsCount: number;
  professionalsCount: number;
  /**
   * Логотип клиники. В контракте §2 поля нет и на 03.08.2026 бэк его не отдаёт
   * (тикет `docs/backend-ticket-public-booking-logo.md`); витрина рисует
   * монограмму, пока значение не появится.
   */
  logoUrl?: string | null;
}

/** Организация — детали (§2). Адрес/телефоны всегда пустые (они на филиалах). */
export interface OrganizationDetail extends OrganizationPreview {
  address: string | null;
  phones: string[];
  /**
   * Вертикаль бизнеса — от неё зависит терминология публичных страниц
   * («врач» в клинике, «мастер» в салоне). В контракте §2 поля нет, тикет —
   * `MamaDoc/backend_ticket_public_landing.md` §1. Пока не отдаётся, публичные
   * страницы говорят терминами клиники (DEFAULT_VERTICAL).
   */
  vertical?: string | null;
  /**
   * Оформление лендинга `/site`, которое владелец задал в CRM (слоган, «о нас»,
   * соцсети, набор блоков). Хранится на бэке как есть — свободный JSON внутри
   * `themeConfig.landing` организации, и сюда попадает без разбора полей.
   *
   * Форму значения проверяет фронт (`parseLandingConfig`): это пользовательский
   * ввод из CRM, а не контракт. Поля бэк не отдаёт до тикета
   * `MamaDoc/backend_ticket_public_landing.md` §2 — до тех пор гость видит
   * лендинг, целиком собранный из данных CRM.
   */
  landing?: unknown;
}

/** Услуга (§2, service preview). base_price — строка Decimal. */
export interface PublicService {
  id: number;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  basePrice: string;
  category: ServiceCategory;
  imageUrl: string | null;
  sortOrder: number;
}

/** Филиал — превью (§2, branch preview). */
export interface BranchPreview {
  id: number;
  slug: string;
  name: string;
  address: string;
  phones: string[];
  professionalsCount: number;
}

/** Филиал — детали (§2, branch detail). */
export interface BranchDetail extends BranchPreview {
  organization: PublicRef;
  twoGisUrl: string | null;
  yandexMapsUrl: string | null;
  googleMapsUrl: string | null;
  timezone: string;
}

// ── Специалисты (§3) ────────────────────────────────────────────────────────

/**
 * Доступность врача прямо в списке — чтобы не добирать календарь по каждой
 * карточке отдельно и чтобы список приходил упорядоченным по загруженности.
 *
 * Бэк отдаёт блок в трёх списках врачей (общий, организации, филиала) и
 * сортирует по нему сквозно по всей выборке — проверено на проде и тесте
 * 14.08.2026. В карточке врача блока нет: там грузится полный календарь.
 * Поле остаётся опциональным на случай старого сервера.
 *
 * ⚠ Значения кэшируются до 5 минут, `times` — из того же кэша. Клик по
 * подсказанному окну может прийти в уже занятый слот: `409` при создании брони
 * — обычная ситуация («это время только что заняли»), а не сбой.
 */
export interface ProfessionalAvailability {
  /** Свободных окон на сегодня (0 — на сегодня уже нет). Ключ сортировки. */
  todayFreeSlots: number;
  /** Ближайший день со свободными окнами; null — окон нет в горизонте 14 дней. */
  nearestDay: {
    /** YYYY-MM-DD */
    date: string;
    /** Всего окон в этот день (не длина times). */
    slotsCount: number;
    /** Первые окна дня "HH:MM" — приходит три штуки, их показывает карточка. */
    times: string[];
  } | null;
}

/** Врач — превью (§3, professional preview). specialty — одна строка. */
export interface ProfessionalPreview {
  id: number;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  specialty: string;
  experienceYears: number;
  isAcceptingNew: boolean;
  /** См. ProfessionalAvailability: появится, когда бэк закроет тикет. */
  availability?: ProfessionalAvailability;
}

/** Услуга в карточке врача (усечённая форма, §3). */
export interface ProfessionalService {
  id: number;
  name: string;
  slug: string;
  durationMinutes: number;
  basePrice: string;
}

/** Врач — детали (§3, professional detail). */
export interface ProfessionalDetail {
  id: number;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  specialties: string[];
  bio: string;
  education: string;
  languages: string[];
  experienceYears: number;
  consultationType: ConsultationType;
  isAcceptingNew: boolean;
  organization: PublicRef;
  /** null — у врача не задан основной филиал. */
  branch: PublicRef | null;
  services: ProfessionalService[];
  /** Среднее по отзывам (2 знака) или null, если отзывов нет. */
  rating: number | null;
  ratingCount: number;
}

/** Отзыв о враче (§3). Контакты пациента не отдаются — только имя. */
export interface ProfessionalReview {
  patientName: string;
  rating: number;
  comment: string;
  /** ISO с таймзоной, напр. "2026-07-20T14:30:00+06:00". */
  date: string;
}

// ── Доступность (§4) ──────────────────────────────────────────────────────────

/** День календаря врача (§4). */
export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** Напр. "Пт 24.07". */
  label: string;
  isAvailable: boolean;
  slotsCount: number;
  /** Свободные времена "HH:MM". */
  times: string[];
}

/** Слот в available-times (§4). */
export interface AvailableTimeSlot {
  /** HH:MM */
  time: string;
  busy: boolean;
}

/** Ответ available-times (§4). slotDurationMin == durationMin. */
export interface AvailableTimes {
  date: string;
  durationMin: number;
  slotDurationMin: number;
  times: AvailableTimeSlot[];
}

// ── Мета (§5) ─────────────────────────────────────────────────────────────────

/** Фича-флаги публичного API (§5). Все paylink-флаги пока false. */
export interface PublicFeatures {
  branchesEnabled: boolean;
  paylinkEnabled: boolean;
  paylinkByOrganization: boolean;
  paylinkByProfessional: boolean;
}

/** Страна для телефонного ввода (§5). */
export interface PhoneCountry {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

// ── Фильтры ───────────────────────────────────────────────────────────────────

/** Пагинация публичного API: page (>=1), limit (<=100). */
export interface PublicPageParams {
  page?: number;
  limit?: number;
}

/** Фильтры списка врачей (§3). */
export interface ProfessionalsFilters extends PublicPageParams {
  specialistId?: number;
  specialistIds?: number[];
  organizationId?: number;
  organizationSlug?: string;
  serviceId?: number;
  serviceIds?: number[];
  search?: string;
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** `{id_or_slug}`: число трактуется как PK, строка — как slug. */
export type IdOrSlug = number | string;

/**
 * Ссылка на объект для `{id_or_slug}`. Slug предпочтительнее (человекочитаемый
 * адрес), но только если он не выглядит числом: бэк разбирает такую строку как
 * PK. У филиала «Клиники 21» slug именно такой — «21», и запрос за его
 * специализациями уходил к несуществующему филиалу №21 и возвращал 404, из-за
 * чего витрина оставалась без специализаций.
 */
export function idOrSlugRef(entity: { id: number; slug?: string | null }): IdOrSlug {
  const slug = entity.slug?.trim();
  return slug && !/^\d+$/.test(slug) ? slug : entity.id;
}

// ── Каталог: функции (§2) ─────────────────────────────────────────────────────

export function getSpecialists(
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<Specialist>> {
  return getList<Specialist>(`/specialists/${buildQuery({ ...params })}`, signal);
}

export function getOrganizations(
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<OrganizationPreview>> {
  return getList<OrganizationPreview>(`/organizations/${buildQuery({ ...params })}`, signal);
}

export function getOrganization(
  idOrSlug: IdOrSlug,
  signal?: AbortSignal,
): Promise<OrganizationDetail> {
  return getItem<OrganizationDetail>(`/organizations/${idOrSlug}/`, signal);
}

export function getOrganizationBranches(
  idOrSlug: IdOrSlug,
  signal?: AbortSignal,
): Promise<PublicList<BranchPreview>> {
  return getList<BranchPreview>(`/organizations/${idOrSlug}/branches/`, signal);
}

export function getOrganizationServices(
  idOrSlug: IdOrSlug,
  signal?: AbortSignal,
): Promise<PublicList<PublicService>> {
  return getList<PublicService>(`/organizations/${idOrSlug}/services/`, signal);
}

export function getOrganizationProfessionals(
  idOrSlug: IdOrSlug,
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<ProfessionalPreview>> {
  return getList<ProfessionalPreview>(
    `/organizations/${idOrSlug}/professionals/${buildQuery({ ...params })}`,
    signal,
  );
}

export function getBranches(
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<BranchPreview>> {
  return getList<BranchPreview>(`/branches/${buildQuery({ ...params })}`, signal);
}

export function getBranch(idOrSlug: IdOrSlug, signal?: AbortSignal): Promise<BranchDetail> {
  return getItem<BranchDetail>(`/branches/${idOrSlug}/`, signal);
}

export function getBranchProfessionals(
  idOrSlug: IdOrSlug,
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<ProfessionalPreview>> {
  return getList<ProfessionalPreview>(
    `/branches/${idOrSlug}/professionals/${buildQuery({ ...params })}`,
    signal,
  );
}

export function getBranchSpecialists(
  idOrSlug: IdOrSlug,
  signal?: AbortSignal,
): Promise<PublicList<Specialist>> {
  return getList<Specialist>(`/branches/${idOrSlug}/specialists/`, signal);
}

// ── Специалисты: функции (§3) ─────────────────────────────────────────────────

export function getProfessionals(
  filters: ProfessionalsFilters = {},
  signal?: AbortSignal,
): Promise<PublicList<ProfessionalPreview>> {
  const query = buildQuery({
    specialist_id: filters.specialistId,
    specialist_ids: filters.specialistIds?.join(","),
    organization_id: filters.organizationId,
    organization_slug: filters.organizationSlug,
    service_id: filters.serviceId,
    service_ids: filters.serviceIds?.join(","),
    search: filters.search,
    page: filters.page,
    limit: filters.limit,
  });
  return getList<ProfessionalPreview>(`/professionals/${query}`, signal);
}

export function getProfessional(
  idOrSlug: IdOrSlug,
  signal?: AbortSignal,
): Promise<ProfessionalDetail> {
  return getItem<ProfessionalDetail>(`/professionals/${idOrSlug}/`, signal);
}

export function getProfessionalReviews(
  idOrSlug: IdOrSlug,
  params: PublicPageParams = {},
  signal?: AbortSignal,
): Promise<PublicList<ProfessionalReview>> {
  return getList<ProfessionalReview>(
    `/professionals/${idOrSlug}/reviews/${buildQuery({ ...params })}`,
    signal,
  );
}

// ── Доступность: функции (§4) ─────────────────────────────────────────────────

export interface CalendarParams {
  /** YYYY-MM-DD, по умолчанию сегодня. */
  dateFrom?: string;
  /** YYYY-MM-DD, по умолчанию dateFrom + 13 дней. Макс. диапазон — 62 дня. */
  dateTo?: string;
  /** Задаёт длительность слота; без него — шаг 30 минут. */
  serviceId?: number;
  /**
   * Филиал, в котором считается занятость (ответ бэка от 21.08.2026).
   *
   * Параметр опциональный, и без него бэк берёт занятость по всей организации —
   * врач филиала A показывался занятым своими приёмами филиала B. Поэтому
   * передаём всегда, когда филиал известен: это тот же филиал, что уйдёт в
   * POST /bookings/, — окна показываем там, где и заведём приём.
   *
   * Недоступный или чужой филиал → 400 validation_error (проверка та же, что у
   * брони, — общий хелпер resolve_employee_branch на бэке).
   */
  branchId?: number | null;
}

/** Календарь врача (§4). Прошедшие дни/время отфильтрованы бэком. */
export function getProfessionalCalendar(
  idOrSlug: IdOrSlug,
  params: CalendarParams = {},
  signal?: AbortSignal,
): Promise<CalendarDay[]> {
  const query = buildQuery({
    date_from: params.dateFrom,
    date_to: params.dateTo,
    service_id: params.serviceId,
    branch_id: params.branchId,
  });
  // Календарь — список без пагинации: возвращаем плоский массив дней.
  return getList<CalendarDay>(`/professionals/${idOrSlug}/calendar/${query}`, signal).then(
    (r) => r.items,
  );
}

/**
 * Свободные времена на дату (§4). date обязателен (YYYY-MM-DD).
 * service_ids — csv, длительность = сумма длительностей услуг.
 */
export function getProfessionalAvailableTimes(
  idOrSlug: IdOrSlug,
  date: string,
  serviceIds?: number[],
  /** Филиал занятости — см. CalendarParams.branchId. */
  branchId?: number | null,
  signal?: AbortSignal,
): Promise<AvailableTimes> {
  const query = buildQuery({ date, service_ids: serviceIds?.join(","), branch_id: branchId });
  return getItem<AvailableTimes>(`/professionals/${idOrSlug}/available-times/${query}`, signal);
}

/**
 * Услуги врача, помещающиеся в свободное окно с началом ровно в `time` (§4).
 * date и time (HH:MM) обязательны. Пустой список — не ошибка (окно не свободно).
 */
export function getProfessionalAvailableServices(
  idOrSlug: IdOrSlug,
  date: string,
  time: string,
  /** Филиал занятости — см. CalendarParams.branchId. */
  branchId?: number | null,
  signal?: AbortSignal,
): Promise<PublicList<PublicService>> {
  return getList<PublicService>(
    `/professionals/${idOrSlug}/available-services/${buildQuery({ date, time, branch_id: branchId })}`,
    signal,
  );
}

// ── Мета: функции (§5) ────────────────────────────────────────────────────────

export function getPublicFeatures(signal?: AbortSignal): Promise<PublicFeatures> {
  return getItem<PublicFeatures>(`/features/`, signal);
}

/** Страны для телефонного ввода (§5). Ответ — плоский массив (без {data}). */
export function getPhoneCountries(signal?: AbortSignal): Promise<PhoneCountry[]> {
  return publicRawRequest<unknown[]>(`/meta/phone-countries/`, { signal }).then(
    (raw) => (raw ?? []).map((x) => camelizeDeep(x) as PhoneCountry),
  );
}

// ── Гостевая бронь ────────────────────────────────────────────────────────────
//
// POST /api/v1/bookings/ бэк реализовал (проверено 03.08.2026). Обязательные
// поля подтверждены самим бэком — ответ на пустое тело перечисляет их в
// `details.missing`: professional_id, branch_id, date, time, patient_name,
// patient_phone, service_ids. Продуктовое решение: гостевая запись без
// регистрации пациента (без OTP/JWT); заявка ложится в очередь «Брони»
// (status=pending), приём создаётся только при подтверждении персоналом.

/** Тело гостевой брони. Все поля ниже — обязательные (см. `details.missing`). */
export interface CreateGuestBookingRequest {
  professionalId: number;
  /**
   * Филиал приёма — обязателен (`400 validation_error` без него). Берём из
   * `ProfessionalDetail.branch` (основной филиал врача) — единственный
   * источник в публичном каталоге; см. открытый вопрос §7.4 тикета.
   */
  branchId: number;
  /**
   * Услуги брони. Обязательность зависит от окружения — проверено пустым POST
   * (ответ перечисляет обязательные поля в `details.missing`):
   *   • test.crm.operator.kg (06.08.2026) — `missing: [professional_id,
   *     branch_id, date, time]`: брони без услуги бэк уже принимает;
   *   • newcrm.pediatr.kg (там же) — в `missing` ещё и `patient_name`,
   *     `patient_phone`, `service_ids`: на проде релиз не выложен.
   * Поэтому витрина с `BOOKING_NO_SERVICE_ENABLED` выпускается только после
   * деплоя прода (тикет `backend_ticket_booking_deploy_gap_2026-08-05.md` §1).
   */
  serviceIds: number[];
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM — начало слота. */
  time: string;
  patientName: string;
  /** В международном формате, напр. "+996700123456". */
  patientPhone: string;
  /** Опциональный комментарий пациента. */
  comment?: string;
  /**
   * Карта пациента, на которую садится бронь (A7). Бэк принимает её только
   * вместе с пациентским токеном и только из списка этого токена, поэтому
   * передаётся с `patientToken`.
   *
   * Привязка работает — проверено на тесте 05.08.2026 косвенно, но однозначно:
   * у брони, созданной с `patient_id`, CRM отдаёт `patientMatches: []`, а у
   * брони с тем же телефоном без него — два совпадения. Бэк не ищет карту,
   * когда она уже известна.
   *
   * §4 тикета `backend_ticket_booking_patient_cabinet_2026-08-05.md` закрыт: с
   * `patient_id` имя и телефон бэк берёт из карты и в теле их не ждёт (тест,
   * 06.08.2026). Мы их всё равно шлём — на проде релиза ещё нет, и без них
   * запрос там упадёт с `400 details.missing`, а лишними на новом контракте они
   * не будут.
   */
  patientId?: number;
  /** Токен пациента; без него бэк проигнорирует `patientId`. */
  patientToken?: string;
}

/**
 * Ответ на создание брони — только эти пять полей (проверено на живом API
 * 05.08.2026). Услуги, сумму, врача и филиал POST не отдаёт, хотя ответ бэка
 * `BOOKING_AND_TEST_ENVIRONMENT.md` §3 их обещает: за ними идём в
 * `getBookingByCode()`.
 */
export interface GuestBookingResult {
  id: number;
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
}

/** Услуга в брони: цена — строка-decimal, как везде в публичном API. */
export interface BookingServiceRef {
  id: number;
  name: string;
  price: string;
}

/** Врач в брони — публичный минимум, без контактов. */
export interface BookingDoctorRef {
  id: number;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  specialty: string | null;
}

/** Филиал брони: адрес и ссылки на карты для экрана «как добраться». */
export interface BookingBranchRef {
  id: number;
  slug: string;
  name: string;
  address: string | null;
  phones: string[];
  twoGisUrl: string | null;
  yandexMapsUrl: string | null;
  googleMapsUrl: string | null;
}

/**
 * Бронь по коду подтверждения — полная карточка (проверено на живом API
 * 05.08.2026). ФИО и телефон пациента в публичном ответе не приходят: код знает
 * только он сам, но бэк всё равно не отдаёт ПДн.
 *
 * `totalDurationMin` для брони без услуг — 30 (стандартное окно).
 * `payment` — предоплата, `null` если её не требуется.
 */
export interface PublicBookingDetail {
  id: number;
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
  totalDurationMin: number;
  totalPrice: string;
  services: BookingServiceRef[];
  doctor: BookingDoctorRef | null;
  branch: BookingBranchRef | null;
  payment: unknown | null;
}

/**
 * `GET /api/v1/bookings/<confirmation_code>/` — карточка брони по коду. Новые
 * коды 10 символов (алфавит без 0/O/1/I), старые 6-символьные тоже работают.
 * Несуществующий код → 404.
 */
export function getBookingByCode(
  code: string,
  signal?: AbortSignal,
): Promise<PublicBookingDetail> {
  return getItem<PublicBookingDetail>(`/bookings/${encodeURIComponent(code)}/`, signal);
}

/**
 * Создание гостевой брони — заявка в очередь «Брони» (status=pending), приём
 * создаётся персоналом при подтверждении. Известные ошибки бэка: `400
 * validation_error` (+`details.missing`), `409` на занятый слот.
 */
export async function createGuestBooking(
  req: CreateGuestBookingRequest,
  signal?: AbortSignal,
): Promise<GuestBookingResult> {
  const raw = await publicRawRequest<ItemEnvelope<unknown>>(`/bookings/`, {
    method: "POST",
    signal,
    headers: req.patientToken ? { "X-Patient-Token": req.patientToken } : undefined,
    body: {
      professional_id: req.professionalId,
      branch_id: req.branchId,
      service_ids: req.serviceIds,
      date: req.date,
      time: req.time,
      patient_name: req.patientName,
      patient_phone: req.patientPhone,
      comment: req.comment,
      ...(req.patientId != null ? { patient_id: req.patientId } : {}),
    },
  });
  return camelizeDeep(raw.data) as GuestBookingResult;
}
