import { apiRequest } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────
// Backend contract: docs `bookings-contract.md` (operator.kg integration,
// CRM-сторона). Все имена полей — camelCase. CRM = source of truth.

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

/** Статусы, в которые персонал может перевести бронь (pending недопустим). */
export type BookingManageStatus = Exclude<BookingStatus, "pending">;

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
  doctorId?: number;
  /** По имени/телефону пациента и коду подтверждения. */
  search?: string;
  organizationId?: number;
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
  if (filters.doctorId != null) q.set("doctorId", String(filters.doctorId));
  if (filters.search) q.set("search", filters.search);
  if (filters.organizationId != null) {
    q.set("organizationId", String(filters.organizationId));
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
