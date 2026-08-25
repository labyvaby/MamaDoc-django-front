import { apiRequest } from "./client";

/**
 * Скоупинг броней по филиалу работает с 20.08.2026 (проверено на проде): в
 * ответе есть `branchId`/`branchName`, а `?branchId` фильтрует выдачу.
 *
 * ⚠ Фильтрует только явный параметр: **без `branchId` бэк отдаёт всю
 * организацию**, активный филиал сессии сам не подставляет. Поэтому `branchId`
 * обязателен в любом запросе к `/bookings/`, включая счётчики и бейджи, —
 * иначе число не сойдётся со списком и будет одинаковым во всех филиалах.
 *
 * UI определяет готовность по факту — есть ли филиал в ответе
 * (`bookingHasBranch`): так колонка «Филиал» не появляется пустой на данных,
 * созданных до скоупинга.
 */
export function bookingHasBranch(b: BookingListItem): boolean {
  return b.branchId != null || !!b.branchName;
}

// ── Types ─────────────────────────────────────────────────────────────────────
// Backend contract: docs `bookings-contract.md` (operator.kg integration,
// CRM-сторона). Все имена полей — camelCase. CRM = source of truth.

export type BookingStatus =
  /**
   * Бронь к врачу с предоплатой: слот держится, банк ещё не подтвердил
   * оплату. Подтвердить её нельзя (400) — после оплаты бэк сам переводит
   * бронь в `pending`, а по истечении 15 минут снимает поллером.
   */
  | "awaiting_payment"
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/**
 * Статусы, в которые персонал может перевести бронь. `pending` — начальный,
 * `awaiting_payment` ставит только бэк по факту выставленной ссылки банка.
 */
export type BookingManageStatus = Exclude<
  BookingStatus,
  "pending" | "awaiting_payment"
>;

/**
 * Состояние онлайн-предоплаты брони (наряд A, Bakai Paylink).
 * `null` в поле брони — врач предоплату не требует, предоплаты нет вовсе.
 */
export type BookingPrepaymentStatus =
  /** ссылка выставлена, банк молчит */
  | "pending"
  /** банк подтвердил оплату — бронь ушла в `pending` и ждёт администратора */
  | "paid"
  /** 15 минут вышли, бронь снята поллером */
  | "expired"
  /** банк отказал, бронь снята */
  | "failed";

/**
 * Откуда пришла бронь: `public` — наша витрина `/book` (нативный `/api/v1`),
 * `operator` — интеграция с iwork.operator.kg. Проверено на живом API
 * 05.08.2026: публичные брони приходят с `source: "public"` и
 * `operatorBookingId: "public-<uuid>"`.
 */
export type BookingSource = "public" | "operator";

/** Элемент списка броней (§2.1). */
export interface BookingListItem {
  id: number;
  /** Для публичных броней — синтетический `public-<uuid>`, не id operator.kg. */
  operatorBookingId: string;
  confirmationCode: string;
  patientName: string;
  patientPhone: string;
  /** Имя специалиста из operator.kg (professionalName). */
  doctorName: string;
  /** null, пока не сделан маппинг operator professional_id ↔ CRM employee. */
  doctorId: number | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  status: BookingStatus;
  source: BookingSource;
  /** Decimal string, напр. "1500.00". */
  totalPrice: string;
  totalDurationMin: number;
  /** Привязка к CRM-приёму. */
  appointmentId: number | null;
  /**
   * Филиал брони. `?:` — потому что до 20.08.2026 бэк этих полей не отдавал;
   * наличие хотя бы одного означает, что скоупинг живой (`bookingHasBranch`).
   */
  branchId?: number | null;
  branchName?: string | null;
  /** null — врач предоплату не требует, предоплаты у брони нет. */
  prepaymentStatus?: BookingPrepaymentStatus | null;
  /** Сумма предоплаты, decimal-строка. */
  prepaymentAmount?: string | null;
  /** ISO-время оплаты по данным банка. */
  prepaymentPaidAt?: string | null;
  /** Докуда действует ссылка на оплату (15 минут от создания). */
  prepaymentExpiresAt?: string | null;
  /** Деньги есть, а приёма не будет: бронь отменена или неявка. */
  prepaymentNeedsAttention?: boolean;
}

/**
 * Снимок услуги из брони. Для броней с витрины (`source: "public"`) бэк отдаёт
 * и `id` услуги CRM, и цену — проверено на живом API 05.08.2026
 * (`{"id": 65, "name": "Вакцинация", "price": "1000.00"}`). Для броней
 * operator.kg `id` может отсутствовать, а `price` быть null: источник цен по
 * услугам не даёт.
 */
export interface BookingServiceSnapshot {
  /** id услуги в каталоге CRM; null у броней operator.kg. */
  id: number | null;
  name: string;
  price: string | null;
}

/**
 * Кандидат на привязку пациента: бэк ищет по телефону брони и присылает
 * совпадения, чтобы персонал выбрал нужного при подтверждении. Пустой массив —
 * пациента с таким номером в CRM нет, нужно искать вручную или создавать.
 */
export interface BookingPatientMatch {
  id: number;
  fullName: string;
  phone: string;
}

/** Карточка брони (§2.2) — поля списка + услуги, совпадения пациентов, синк. */
export interface BookingDetail extends BookingListItem {
  services: BookingServiceSnapshot[];
  /** Подсказки бэка по телефону брони (проверено на живом API 05.08.2026). */
  patientMatches: BookingPatientMatch[];
  syncedAt: string | null;
  /** Ссылка банка — админ может переслать её пациенту, пока оплата `pending`. */
  prepaymentPayUrl?: string | null;
}

export interface BookingsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: BookingListItem[];
}

export interface BookingsFilters {
  /** YYYY-MM-DD — фильтр по дате брони. */
  dateFrom: string;
  dateTo: string;
  status?: BookingStatus;
  /** Состояние онлайн-предоплаты — те же 4 значения, что у брони. */
  prepaymentStatus?: BookingPrepaymentStatus;
  doctorId?: number;
  /** По имени/телефону пациента и коду подтверждения. */
  search?: string;
  organizationId?: number;
  /** Активный филиал. Без него бэк отдаёт всю организацию — см. начало файла. */
  branchId?: number;
  page?: number;
  pageSize?: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** GET /api/bookings/ — пагинированный список броней (§2.1). */
export function getBookings(
  filters: BookingsFilters,
  signal?: AbortSignal,
): Promise<BookingsResponse> {
  const q = new URLSearchParams();
  q.set("dateFrom", filters.dateFrom);
  q.set("dateTo", filters.dateTo);
  if (filters.status) q.set("status", filters.status);
  if (filters.prepaymentStatus) q.set("prepaymentStatus", filters.prepaymentStatus);
  if (filters.doctorId != null) q.set("doctorId", String(filters.doctorId));
  if (filters.search) q.set("search", filters.search);
  if (filters.organizationId != null) {
    q.set("organizationId", String(filters.organizationId));
  }
  if (filters.branchId != null) {
    q.set("branchId", String(filters.branchId));
  }
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return apiRequest<BookingsResponse>(`/bookings/?${q.toString()}`, { signal });
}

/** GET /api/bookings/<id>/ — карточка брони (§2.2). Чужая орг / нет id → 404. */
export function getBooking(id: number, signal?: AbortSignal): Promise<BookingDetail> {
  return apiRequest<BookingDetail>(`/bookings/${id}/`, { signal });
}

/**
 * Дополнения к смене статуса. Оба поля бэк принимает (проверено на живом API
 * 05.08.2026: PATCH с `patientId`/`serviceIds` ругается только на невалидный
 * `status`, а не на неизвестное поле):
 *
 * - `patientId` — какому пациенту CRM принадлежит бронь. Кандидатов бэк сам
 *   подсказывает в `BookingDetail.patientMatches`.
 * - `serviceIds` — набор услуг приёма. Нужен прежде всего для брони, созданной
 *   без услуги: услуги выбирает персонал при подтверждении.
 *
 * Отсутствие поля бронь не меняет, поэтому «на всякий случай» их не отправляем.
 */
export interface BookingStatusExtras {
  patientId?: number;
  serviceIds?: number[];
}

/**
 * PATCH /api/bookings/<id>/status/ — смена статуса в CRM (§2.3, право
 * bookings.manage). Допустимо: confirmed|cancelled|completed|no_show.
 * Ответ 200 — обновлённая карточка.
 */
export function updateBookingStatus(
  id: number,
  status: BookingManageStatus,
  extras: BookingStatusExtras = {},
): Promise<BookingDetail> {
  return apiRequest<BookingDetail>(`/bookings/${id}/status/`, {
    method: "PATCH",
    body: {
      status,
      ...(extras.patientId != null ? { patientId: extras.patientId } : {}),
      ...(extras.serviceIds ? { serviceIds: extras.serviceIds } : {}),
    },
  });
}
