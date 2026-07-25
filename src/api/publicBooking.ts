import { API_BASE, ApiError, extractErrorMessage, NETWORK_ERROR_MESSAGE } from "./client";

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
}

/**
 * GET/POST к публичному API. Без credentials (публичный AllowAny). Ошибки бэка
 * приходят как `{ error, message, details }` — extractErrorMessage их разбирает.
 * Возвращает СЫРОЙ (snake_case) payload; распаковка/camelize — в обёртках ниже.
 */
async function publicRawRequest<T>(
  path: string,
  { signal, method = "GET", body }: PublicRequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PUBLIC_API_BASE}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (import.meta.env.DEV) console.error("[publicBooking] network error:", err);
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

/** GET одиночного ресурса: `{ data }` → camelCase T. */
async function getItem<T>(path: string, signal?: AbortSignal): Promise<T> {
  const raw = await publicRawRequest<ItemEnvelope<unknown>>(path, { signal });
  return camelizeDeep(raw.data) as T;
}

/** GET списка: `{ data, pagination }` → { items: T[], pagination }. */
async function getList<T>(path: string, signal?: AbortSignal): Promise<PublicList<T>> {
  const raw = await publicRawRequest<ListEnvelope<unknown>>(path, { signal });
  return {
    items: (raw.data ?? []).map((x) => camelizeDeep(x) as T),
    pagination: raw.pagination,
  };
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
}

/** Организация — детали (§2). Адрес/телефоны всегда пустые (они на филиалах). */
export interface OrganizationDetail extends OrganizationPreview {
  address: string | null;
  phones: string[];
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

/** Врач — превью (§3, professional preview). specialty — одна строка. */
export interface ProfessionalPreview {
  id: number;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  specialty: string;
  experienceYears: number;
  isAcceptingNew: boolean;
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

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** `{id_or_slug}`: число трактуется как PK, строка — как slug. */
export type IdOrSlug = number | string;

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
  signal?: AbortSignal,
): Promise<AvailableTimes> {
  const query = buildQuery({ date, service_ids: serviceIds?.join(",") });
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
  signal?: AbortSignal,
): Promise<PublicList<PublicService>> {
  return getList<PublicService>(
    `/professionals/${idOrSlug}/available-services/${buildQuery({ date, time })}`,
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

// ── Гостевая бронь (§7 — НЕ РЕАЛИЗОВАНО на бэке) ──────────────────────────────
//
// ⚠ ПРЕДЛОЖЕННЫЙ фронтом контракт, НЕ подтверждён бэком. POST /api/v1/bookings/
// в §7 помечен как «не готово». До реализации вызов вернёт 404 —
// UI показывает заглушку. Тикет с этим контрактом уходит Рику (см. задачу #4).
// Продуктовое решение: гостевая запись без регистрации пациента (без OTP/JWT).

/** Тело гостевой брони — предложение фронта (не факт из контракта). */
export interface CreateGuestBookingRequest {
  professionalId: number;
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
}

/** Ответ на создание брони — предложение фронта (не факт из контракта). */
export interface GuestBookingResult {
  id: number;
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
}

/**
 * Создание гостевой брони. ⚠ Эндпоинт на бэке пока отсутствует (§7) —
 * ожидаемо вернёт 404, пока Рик не реализует контракт (задача #4).
 */
export async function createGuestBooking(
  req: CreateGuestBookingRequest,
  signal?: AbortSignal,
): Promise<GuestBookingResult> {
  const raw = await publicRawRequest<ItemEnvelope<unknown>>(`/bookings/`, {
    method: "POST",
    signal,
    body: {
      professional_id: req.professionalId,
      service_ids: req.serviceIds,
      date: req.date,
      time: req.time,
      patient_name: req.patientName,
      patient_phone: req.patientPhone,
      comment: req.comment,
    },
  });
  return camelizeDeep(raw.data) as GuestBookingResult;
}
