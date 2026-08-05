import { ApiError } from "./client";
import {
  BOOKING_ORG_SLUG,
  getItem,
  getList,
  publicRawRequest,
  snakeizeBody,
  type BookingBranchRef,
  type BookingDoctorRef,
  type BookingServiceRef,
  type PublicList,
} from "./publicBooking";

// ── Кабинет пациента на публичной витрине (`/api/v1/auth/*`, `/api/v1/me*`) ───
//
// Контракт согласован в `MamaDoc/backend_ticket_public_booking_phase3.md` (часть
// A) и проверен на живом тесте 05.08.2026 — совпал, кроме трёх мест, отмеченных
// ⚠ ниже (тикет `backend_ticket_booking_patient_cabinet_2026-08-05.md`).
//
// Токен пациента ходит в заголовке `X-Patient-Token` и НЕ является сессией
// сотрудника: витрина живёт на том же домене, что CRM, и кука пациента
// столкнулась бы с сессией врача, открывшего /book у себя.

/** Заголовок пациентского токена. Не `Authorization`: Bearer съедает middleware. */
export const PATIENT_TOKEN_HEADER = "X-Patient-Token";

const authHeaders = (token: string): Record<string, string> => ({
  [PATIENT_TOKEN_HEADER]: token,
});

/** Машиночитаемые коды ошибок кабинета (проверены на живом API). */
export type PatientAuthErrorCode =
  | "invalid_patient_token"
  | "invalid_code"
  | "code_expired"
  | "validation_error"
  | "not_found";

/** Код ошибки из ответа бэка (`{error, message, details}`), если он есть. */
export function patientErrorCode(e: unknown): PatientAuthErrorCode | null {
  if (!(e instanceof ApiError)) return null;
  const code = (e.payload as { error?: string } | null)?.error;
  return (code as PatientAuthErrorCode) ?? null;
}

/** Токен истёк или отозван — пора показывать вход заново. */
export function isPatientTokenInvalid(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}

// ── A1. Запрос кода ───────────────────────────────────────────────────────────

export interface OtpRequestResult {
  /** Всегда true — есть номер в базе или нет, чтобы номера нельзя было перебирать. */
  ok: boolean;
  /** Секунды до следующей отправки; фронт рисует обратный отсчёт. */
  retryAfter: number;
}

/**
 * `POST /auth/otp/request/` — SMS с кодом. Организация обязательна: пул
 * пациентов у каждой клиники свой.
 *
 * ⚠ Организация передаётся именно как `organization_slug`. На несуществующий
 * slug бэк отвечает `400 «organization и phone обязательны»` — сообщение
 * выглядит как «поле не передано», хотя поле принято, просто клиника не найдена.
 */
export function requestPatientOtp(
  phone: string,
  signal?: AbortSignal,
): Promise<OtpRequestResult> {
  return publicRawRequest<{ data: { ok: boolean; retry_after: number } }>(
    `/auth/otp/request/`,
    { method: "POST", signal, body: { phone, organization_slug: BOOKING_ORG_SLUG } },
  ).then((raw) => ({ ok: raw.data.ok, retryAfter: raw.data.retry_after }));
}

// ── A2. Проверка кода ─────────────────────────────────────────────────────────

/**
 * Карта пациента, доступная по этому номеру. Один телефон часто держит
 * несколько карт: клиника педиатрическая, у детей записан телефон родителя
 * (плюс встречаются дубли). Поэтому вход даёт список, а не одного пациента.
 */
export interface PatientCard {
  id: number;
  fullName: string;
  /** YYYY-MM-DD; null у карт, где дата не заполнена. */
  birthDate: string | null;
}

export interface PatientSessionResult {
  token: string;
  /** ISO-дата истечения; на тесте бэк выдавал месяц. */
  expiresAt: string;
  /** Пустой список — номера нет в базе, дальше регистрация (A3). */
  patients: PatientCard[];
}

/** `POST /auth/otp/verify/` — код на токен. Неверный/истёкший → 400 `code_expired`. */
export function verifyPatientOtp(
  phone: string,
  code: string,
  signal?: AbortSignal,
): Promise<PatientSessionResult> {
  return publicRawRequest<{
    data: { token: string; expires_at: string; patients: { id: number; full_name: string; birth_date: string | null }[] };
  }>(`/auth/otp/verify/`, {
    method: "POST",
    signal,
    body: { phone, code, organization_slug: BOOKING_ORG_SLUG },
  }).then((raw) => ({
    token: raw.data.token,
    expiresAt: raw.data.expires_at,
    patients: (raw.data.patients ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      birthDate: p.birth_date,
    })),
  }));
}

// ── A3. Регистрация нового пациента ───────────────────────────────────────────

/** Пол — значения как в карте пациента CRM. */
export type PatientGenderInput = "male" | "female";

export interface RegisterPatientPayload {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  birthDate: string;
  gender: PatientGenderInput;
}

/**
 * `POST /auth/register/` (с токеном из A2) — карта для номера, которого не было
 * в базе. Все четыре поля обязательны, проверено: пустое тело → `400
 * «first_name, last_name, birth_date и gender обязательны»`.
 */
export function registerPatient(
  token: string,
  payload: RegisterPatientPayload,
  signal?: AbortSignal,
): Promise<PatientCard> {
  return publicRawRequest<{ data: { patient: { id: number; full_name: string; birth_date: string | null } } }>(
    `/auth/register/`,
    {
      method: "POST",
      signal,
      headers: authHeaders(token),
      body: snakeizeBody({ ...payload }),
    },
  ).then((raw) => ({
    id: raw.data.patient.id,
    fullName: raw.data.patient.full_name,
    birthDate: raw.data.patient.birth_date,
  }));
}

/** `POST /auth/logout/` — отзывает токен на бэке. Ошибку глушим: выйти надо всё равно. */
export function logoutPatient(token: string): Promise<void> {
  return publicRawRequest<void>(`/auth/logout/`, {
    method: "POST",
    headers: authHeaders(token),
    body: {},
  })
    .then(() => undefined)
    .catch(() => undefined);
}

// ── A4. Профиль и записи ──────────────────────────────────────────────────────

/** `GET /me/` — какие карты доступны этому номеру. */
export function getPatientMe(token: string, signal?: AbortSignal): Promise<{ patients: PatientCard[] }> {
  return getItem<{ patients: PatientCard[] }>(`/me/`, signal, authHeaders(token));
}

/**
 * Запись пациента в кабинете. Поля те же, что у брони по коду.
 *
 * ⚠ Привязки к конкретной карте бэк не отдаёт (нет `patientId`), поэтому
 * разделить историю по профилям на клиенте нельзя — показываем все записи
 * номера. Тикет: §1 `backend_ticket_booking_patient_cabinet_2026-08-05.md`.
 */
export interface MyBooking {
  id: number;
  confirmationCode: string;
  status: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  totalDurationMin: number;
  totalPrice: string;
  services: BookingServiceRef[];
  doctor: BookingDoctorRef | null;
  branch: BookingBranchRef | null;
  /** Предоплата; null — не требуется. */
  payment: unknown | null;
}

/**
 * `GET /me/bookings/` — записи по номеру, включая созданные гостем до входа
 * (привязка по телефону работает, проверено: в списке есть брони с 6-символьными
 * кодами из старой генерации).
 *
 * ⚠ Параметры `patient_id` и `status=upcoming|past` бэк игнорирует — возвращает
 * один и тот же набор. Фильтруем на клиенте (`splitBookingsByTime`).
 */
export function getMyBookings(
  token: string,
  signal?: AbortSignal,
): Promise<PublicList<MyBooking>> {
  return getList<MyBooking>(`/me/bookings/`, signal, authHeaders(token));
}

/**
 * `POST /me/bookings/<id>/cancel/` — отмена. Бронь чужого номера недоступна:
 * бэк отвечает `404 not_found` (проверено). Каскад на приём делает бэк.
 */
export function cancelMyBooking(token: string, id: number): Promise<void> {
  return publicRawRequest<void>(`/me/bookings/${id}/cancel/`, {
    method: "POST",
    headers: authHeaders(token),
    body: {},
  }).then(() => undefined);
}

// ── Клиентские хелперы ────────────────────────────────────────────────────────

/** Статусы, при которых запись ещё «живая» и её можно отменить. */
const ACTIVE_STATUSES = new Set(["pending", "confirmed", "awaiting_payment"]);

export function isBookingCancellable(b: MyBooking): boolean {
  return ACTIVE_STATUSES.has(b.status) && !isPast(b);
}

function isPast(b: MyBooking): boolean {
  // Сравниваем по локальному времени приёма: бэк отдаёт дату и время строками
  // без зоны, а клиника и пациент всегда в одной зоне.
  const dt = new Date(`${b.date}T${b.time.length === 5 ? `${b.time}:00` : b.time}`);
  return Number.isFinite(dt.getTime()) ? dt.getTime() < Date.now() : false;
}

/**
 * Разделение на предстоящие и прошедшие — на клиенте, потому что `?status=`
 * бэк игнорирует. Отменённые и завершённые уходят в «прошедшие» независимо от
 * даты: активной записью они не являются.
 */
export function splitBookingsByTime(items: MyBooking[]): {
  upcoming: MyBooking[];
  past: MyBooking[];
} {
  const upcoming: MyBooking[] = [];
  const past: MyBooking[] = [];
  for (const b of items) {
    if (ACTIVE_STATUSES.has(b.status) && !isPast(b)) upcoming.push(b);
    else past.push(b);
  }
  upcoming.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  past.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return { upcoming, past };
}
