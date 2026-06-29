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

/** Элемент списка броней (§2.1). */
export interface BookingListItem {
  id: number;
  operatorBookingId: string;
  confirmationCode: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  doctorId: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  status: BookingStatus;
  /** Decimal string, напр. "1500.00". */
  totalPrice: string;
  totalDurationMin: number;
  /** Привязка к CRM-приёму. */
  appointmentId: number | null;
}

/** Снимок услуги из брони operator.kg (passthrough — форма уточнится по Swagger). */
export interface BookingServiceSnapshot {
  name: string;
  price: string;
  [key: string]: unknown;
}

/** Карточка брони (§2.2) — поля списка + услуги + время синка. */
export interface BookingDetail extends BookingListItem {
  services: BookingServiceSnapshot[];
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
 * PATCH /api/bookings/<id>/status/ — смена статуса в CRM (§2.3, право
 * bookings.manage). Допустимо: confirmed|cancelled|completed|no_show.
 * Ответ 200 — обновлённая карточка.
 */
export function updateBookingStatus(
  id: number,
  status: BookingManageStatus,
): Promise<BookingDetail> {
  return apiRequest<BookingDetail>(`/bookings/${id}/status/`, {
    method: "PATCH",
    body: { status },
  });
}
