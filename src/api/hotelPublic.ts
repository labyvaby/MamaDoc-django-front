/**
 * Публичные прямые продажи отеля — без входа в CRM: свободные категории и
 * цены на даты, заявка на бронь с временным резервом на 30 минут.
 * Бэк: /api/v2/hotel/public/{slug}/… (AllowAny, без CSRF).
 *
 * Запросы идут без cookies CRM (credentials: "omit") — витрина может стоять
 * на отдельном домене, а гость не должен нести сессию сотрудника. Своя
 * функция, а не apiRequest: тот шлёт cookies и на 401/403 будит глобальные
 * события CRM («сессия протухла»), которые для публичной страницы не нужны.
 */
import { API_BASE as API_URL, ApiError, extractErrorMessage, NETWORK_ERROR_MESSAGE, parseErrorEnvelope } from "./client";

export interface PublicHotelCategory {
  id: number;
  name: string;
  adultsCapacity: number;
  childrenCapacity: number;
  /** Сколько номеров категории свободно на весь период. */
  available: number;
  /** За весь период, не за ночь. */
  totalAmount: string;
}

export interface PublicHotelAvailability {
  propertyName: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  count: number;
  results: PublicHotelCategory[];
}

export interface PublicHotelRequestData {
  /** UUID один на заявку: повтор с тем же UUID и телом не создаёт вторую бронь. */
  requestId: string;
  roomTypeId: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  fullName: string;
  phone: string;
  email?: string;
  dataConsent: boolean;
  /** Сумма, которую видел гость; при расхождении — 409 PRICE_CHANGED. */
  expectedTotal: string;
  comment?: string;
}

export interface PublicHotelReservation {
  reference: string;
  status: "hold";
  /** Резерв действует до этого времени (30 минут), потом перестаёт занимать номер. */
  expiresAt: string;
  totalAmount: string;
  currency: string;
}

async function publicRequest<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "omit",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // пустое или не-JSON тело
  }
  if (!response.ok) {
    const env = parseErrorEnvelope(payload);
    // Публичной странице нужен код ошибки (PRICE_CHANGED, NO_AVAILABILITY, RATE_LIMITED…),
    // а текст — человеческий, без «Код обращения» служебного вида.
    throw new ApiError(env?.message || extractErrorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

export function getPublicAvailability(
  slug: string,
  params: { checkIn: string; checkOut: string; adults: number; children: number },
  signal?: AbortSignal,
): Promise<PublicHotelAvailability> {
  const qs = new URLSearchParams({
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: String(params.adults),
    children: String(params.children),
  });
  return publicRequest<PublicHotelAvailability>(`/v2/hotel/public/${encodeURIComponent(slug)}/availability/?${qs}`, { signal });
}

export function createPublicReservation(slug: string, data: PublicHotelRequestData): Promise<PublicHotelReservation> {
  return publicRequest<PublicHotelReservation>(`/v2/hotel/public/${encodeURIComponent(slug)}/reservations/`, { method: "POST", body: data });
}
