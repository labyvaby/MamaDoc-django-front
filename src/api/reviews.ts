import { apiRequest } from "./client";

// ── Domain types ─────────────────────────────────────────────────────────────
// Backend contract: docs `reviews-contract.md`. Все имена полей — camelCase.

/** Производное от оценки/порога. negative = 1–4, promoter = 5 (по умолчанию). */
export type ReviewSentiment = "negative" | "neutral" | "promoter";

/** Канал доставки приглашения. */
export type ReviewChannel = "whatsapp" | "sms" | "whatsapp_then_sms";

/**
 * Статусы жизненного цикла запроса:
 * created → sent → rated → awaiting_comment → completed
 * + expired (нет ответа), failed (не доставлено).
 */
export type ReviewRequestStatus =
  | "created"
  | "sent"
  | "rated"
  | "awaiting_comment"
  | "completed"
  | "expired"
  | "failed";

/** Элемент списка отзывов (§3.1). */
export interface Review {
  id: number;
  appointmentId: number;
  patientName: string;
  doctorName: string;
  rating: number;
  comment: string;
  sentiment: ReviewSentiment;
  channel: ReviewChannel;
  ratedAt: string | null;
  status: ReviewRequestStatus;
}

export interface ReviewsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Review[];
}

/** Статистика дашборда (§3.2). Денежные/доли — строки. */
export interface ReviewStats {
  sent: number;
  answered: number;
  /** answered / sent, строка с 2 знаками, напр. "0.73". */
  responseRate: string;
  /** средняя оценка, строка с 1 знаком, напр. "4.3". */
  avgRating: string;
  byRating: Record<string, number>;
  negativeCount: number;
  promoterCount: number;
  /** Бэкенд кодирует "2gis" как "2Gis" (camelCase-конвертер). */
  redirectedTo2Gis: number;
}

/** Запрос отзыва по приёму (§3.3 / §3.4). */
export interface ReviewRequest {
  id: number;
  appointmentId: number;
  patientName: string;
  doctorName: string;
  channel: ReviewChannel;
  status: ReviewRequestStatus;
  attempt: number;
  rating: number | null;
  sentAt: string | null;
  createdAt: string;
}

/** Настройки модуля (§3.5). */
export interface ReviewSettings {
  organizationId: number;
  enabled: boolean;
  channel: ReviewChannel;
  delayMinutes: number;
  expireHours: number;
  /** Порог негатива ∈ [1..5]; оценка < threshold — негатив. */
  negativeThreshold: number;
  gisUrl: string;
  templateInvite: string;
  templateAskComment: string;
  templateThanks5: string;
  templateThanksLow: string;
  /** Актуальный список доступных плейсхолдеров шаблонов. */
  variables: string[];
}

/** Частичное обновление настроек (шлём только меняемые поля). */
export interface ReviewSettingsPatch {
  enabled?: boolean;
  channel?: ReviewChannel;
  delayMinutes?: number;
  expireHours?: number;
  negativeThreshold?: number;
  gisUrl?: string;
  templateInvite?: string;
  templateAskComment?: string;
  templateThanks5?: string;
  templateThanksLow?: string;
  /** Суперадмин может адресовать чужую организацию. */
  organizationId?: number;
}

/** Контекст публичной страницы оценки (§4.1). */
export interface RateContext {
  token: string;
  status: ReviewRequestStatus;
  patientName: string;
  doctorName: string;
  clinicName: string;
  rating: number | null;
  needComment: boolean;
  completed: boolean;
  gisUrl: string;
  /** Бэкенд кодирует "2gis" как "2Gis" (camelCase-конвертер). */
  redirectTo2Gis: boolean;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReviewsFilters {
  /** YYYY-MM-DD — фильтр по дате запроса отзыва. */
  from: string;
  to: string;
  rating?: number;
  sentiment?: ReviewSentiment;
  doctorId?: number;
  organizationId?: number;
  page?: number;
  pageSize?: number;
}

export interface ReviewStatsFilters {
  from: string;
  to: string;
  organizationId?: number;
}

// ── API functions (под авторизацией) ────────────────────────────────────────

/** GET /api/reviews/ — пагинированный список отзывов (§3.1). */
export function getReviews(
  filters: ReviewsFilters,
  signal?: AbortSignal,
): Promise<ReviewsResponse> {
  const q = new URLSearchParams();
  q.set("from", filters.from);
  q.set("to", filters.to);
  if (filters.rating != null) q.set("rating", String(filters.rating));
  if (filters.sentiment) q.set("sentiment", filters.sentiment);
  if (filters.doctorId != null) q.set("doctorId", String(filters.doctorId));
  if (filters.organizationId != null) {
    q.set("organizationId", String(filters.organizationId));
  }
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return apiRequest<ReviewsResponse>(`/reviews/?${q.toString()}`, { signal });
}

/** GET /api/reviews/stats/ — агрегаты для дашборда (§3.2). */
export function getReviewStats(
  filters: ReviewStatsFilters,
  signal?: AbortSignal,
): Promise<ReviewStats> {
  const q = new URLSearchParams();
  q.set("from", filters.from);
  q.set("to", filters.to);
  if (filters.organizationId != null) {
    q.set("organizationId", String(filters.organizationId));
  }
  return apiRequest<ReviewStats>(`/reviews/stats/?${q.toString()}`, { signal });
}

/**
 * POST /api/reviews/requests/ — инициировать / переотправить запрос (§3.3).
 * Активный запрос уже есть → 409. Приём не найден → 404. Ответ 201.
 */
export function createReviewRequest(appointmentId: number): Promise<ReviewRequest> {
  return apiRequest<ReviewRequest>("/reviews/requests/", {
    method: "POST",
    body: { appointmentId },
  });
}

/**
 * GET /api/reviews/requests/?appointmentId= — запросы по приёму (§3.4).
 * Массив (новые первыми). Для индикатора берём первый элемент.
 */
export function getReviewRequestsByAppointment(
  appointmentId: number,
  signal?: AbortSignal,
): Promise<ReviewRequest[]> {
  const q = new URLSearchParams({ appointmentId: String(appointmentId) });
  return apiRequest<ReviewRequest[]>(`/reviews/requests/?${q.toString()}`, { signal });
}

/** GET /api/reviews/settings/ — настройки модуля (§3.5, право reviews.manage). */
export function getReviewSettings(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<ReviewSettings> {
  const q = new URLSearchParams();
  if (organizationId != null) q.set("organizationId", String(organizationId));
  const qs = q.toString();
  return apiRequest<ReviewSettings>(`/reviews/settings/${qs ? `?${qs}` : ""}`, { signal });
}

/** PATCH /api/reviews/settings/ — частичное обновление (§3.5). */
export function updateReviewSettings(
  patch: ReviewSettingsPatch,
): Promise<ReviewSettings> {
  return apiRequest<ReviewSettings>("/reviews/settings/", {
    method: "PATCH",
    body: patch,
  });
}

// ── Публичная страница оценки (без авторизации, §4) ──────────────────────────

/** GET /api/reviews/rate/<token>/ — контекст страницы. Неизвестный токен → 404. */
export function getRateContext(token: string, signal?: AbortSignal): Promise<RateContext> {
  return apiRequest<RateContext>(`/reviews/rate/${encodeURIComponent(token)}/`, { signal });
}

/**
 * POST /api/reviews/rate/<token>/ — отправка оценки или комментария (§4.2).
 *   { rating }  — шаг 1
 *   { comment } — шаг 2 (если needComment)
 * Возвращает обновлённый контекст. Повторная оценка после завершения → 409.
 */
export function postRate(
  token: string,
  body: { rating: number } | { comment: string },
): Promise<RateContext> {
  return apiRequest<RateContext>(`/reviews/rate/${encodeURIComponent(token)}/`, {
    method: "POST",
    body,
  });
}
