import { API_BASE, ApiError, extractErrorMessage, NETWORK_ERROR_MESSAGE, notifyRateLimited } from "./client";

// ── Клиентский ЛК биллинга (`/api/client-portal/*`) ──────────────────────────
//
// Контракт: `MamaDoc-backend/docs/billing-frontend-api-guide.md` §1 «Клиентский
// ЛК», сверено по коду `server/apps/clients/api/public_views.py` (10.09.2026).
//
// Это НЕ кабинет пациента с витрины записи (`/api/v1/*`, `src/api/publicPatient.ts`):
// другая таблица OTP, другой токен, другой заголовок и другой набор данных —
// там записи к врачу, здесь деньги (начисления, оплаты, абонементы, баланс).
// Клиент одной организации может существовать в обоих контурах, но токены
// невзаимозаменяемы.
//
// Отличия от остального API, которые ломают ожидания:
//   • Ответы уже camelCase (views собирают dict вручную) — камелизация не нужна.
//   • Ошибки — простая строка `{"error": "..."}`, без конверта `error.code`.
//     Ветвиться можно только по HTTP-статусу.
//   • Деньги приходят строками (`"1500.00"`) — не приводим к number для показа.

/** База ЛК. Путь под старым `/api/`, не под `/api/v2/billing/`. */
const PORTAL_BASE = `${API_BASE.replace(/\/$/, "")}/client-portal`;

interface PortalRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Токен ЛК; без него ручка ответит 401. */
  token?: string;
  signal?: AbortSignal;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return null;
  }
}

/**
 * Запрос к ЛК. `credentials: "omit"` — намеренно: ЛК живёт на том же домене,
 * что CRM, и кука сотрудника, случайно приехавшая с запросом клиента, не должна
 * влиять ни на что. Авторизация здесь только по Bearer-токену.
 */
async function portalRequest<T>(
  path: string,
  { method = "GET", body, token, signal }: PortalRequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PORTAL_BASE}${path}`, {
      method,
      signal,
      credentials: "omit",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (import.meta.env.DEV) console.error("[clientPortal] network error:", err);
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null);
  }

  if (response.status === 429) notifyRateLimited();
  const payload = await readJsonBody(response);
  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }
  return payload as T;
}

/** Токен истёк, отозван или его не приняли — показываем вход заново. */
export function isPortalTokenInvalid(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** Организации с таким slug нет — ошибка ссылки, а не клиента. */
export function isPortalOrgUnknown(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

// ── Вход по SMS ──────────────────────────────────────────────────────────────

/**
 * Запросить код. Ответ всегда `{status: "sent"}` — зарегистрирован номер или
 * нет, бэк не раскрывает (защита от перебора базы клиентов). Значит, «код
 * отправлен» на экране не означает, что SMS реально ушла.
 *
 * Код — 6 цифр, живёт 5 минут, повторная отправка не чаще раза в 60 секунд
 * (`OTP_CODE_LENGTH` / `OTP_CODE_TTL_SECONDS` / `OTP_RESEND_COOLDOWN_SECONDS`).
 * Кулдаун бэк не возвращает, отсчёт на экране — наш собственный.
 */
export function requestPortalOtp(
  orgSlug: string,
  phone: string,
  signal?: AbortSignal,
): Promise<void> {
  return portalRequest<{ status: string }>(`/${encodeURIComponent(orgSlug)}/auth/otp/request/`, {
    method: "POST",
    body: { phone },
    signal,
  }).then(() => undefined);
}

export interface PortalSessionResult {
  token: string;
  clientId: number;
}

/** Проверить код. Неверный/просроченный → 401 (не 400, как на витрине записи). */
export function verifyPortalOtp(
  orgSlug: string,
  phone: string,
  code: string,
  signal?: AbortSignal,
): Promise<PortalSessionResult> {
  return portalRequest<PortalSessionResult>(`/${encodeURIComponent(orgSlug)}/auth/otp/verify/`, {
    method: "POST",
    body: { phone, code },
    signal,
  });
}

// ── Данные кабинета ──────────────────────────────────────────────────────────

export type PortalChargeStatus = "draft" | "issued" | "partial" | "paid" | "overdue" | "canceled";
export type PortalPaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PortalPaymentMethod = "bakai" | "cash" | "transfer";
export type PortalOfferingKind = "service" | "course" | "rental";

export interface PortalClient {
  id: number;
  fullName: string;
  phone: string;
  /** Аванс на лицевом счёте, строкой. Может быть отрицательным. */
  balance: string;
  /** Суммарный долг по открытым начислениям, строкой. */
  debt: string;
}

export interface PortalSubscription {
  id: number;
  offeringId: number;
  offeringName: string;
  offeringKind: PortalOfferingKind;
  startsOn: string;
  /** null — бессрочная подписка (аренда/услуга без конца). */
  endsOn: string | null;
  /** Остаток занятий у пакета; null — не пакет. */
  sessionsLeft: number | null;
}

export interface PortalCharge {
  id: number;
  number: number;
  purpose: string;
  amount: string;
  paidAmount: string;
  dueDate: string;
  status: PortalChargeStatus;
  /** `status ∈ {issued, partial, overdue}` — считает бэк, сами не выводим. */
  isOpen: boolean;
}

export interface PortalPayment {
  id: number;
  amount: string;
  method: PortalPaymentMethod;
  status: PortalPaymentStatus;
  /** null у платежей, которые ещё не проведены. */
  paidAt: string | null;
}

export interface PortalFamilyMember {
  id: number;
  fullName: string;
  phone: string;
}

export interface PortalMe {
  client: PortalClient;
  /** Только активные подписки. */
  subscriptions: PortalSubscription[];
  /** Последние 100 начислений по убыванию срока оплаты. */
  charges: PortalCharge[];
  /** Последние 100 оплат; возвраты бэк исключает. */
  payments: PortalPayment[];
  /** Семья без самого клиента; пустой список — семейной группы нет. */
  family: PortalFamilyMember[];
}

/** Весь кабинет одним запросом — отдельных ручек по разделам у бэка нет. */
export function getPortalMe(token: string, signal?: AbortSignal): Promise<PortalMe> {
  return portalRequest<PortalMe>("/me/", { token, signal });
}

// ── Оплата начисления ────────────────────────────────────────────────────────

export interface PortalPayLink {
  /** Ссылка на оплату у Bakai; редиректим клиента прямо на неё. */
  providerPayUrl: string;
  expiresAt: string;
}

/**
 * Создать ссылку на оплату. В отличие от сотрудничьей ручки промежуточной
 * страницы `/pay/<token>` тут нет — сразу отдаётся `providerPayUrl`.
 *
 * ⚠ Это живой сетевой вызов к Bakai, не мгновенная операция: закладывайте
 * ожидание и обработку сбоя. 400 приходит и когда Bakai не настроен у
 * организации, и когда он недоступен, и когда начисление уже закрыто —
 * различать можно только по тексту, машинного кода бэк не даёт.
 */
export function createPortalPayLink(
  token: string,
  chargeId: number,
  signal?: AbortSignal,
): Promise<PortalPayLink> {
  return portalRequest<PortalPayLink>(`/charges/${chargeId}/pay-link/`, {
    method: "POST",
    token,
    signal,
  });
}
