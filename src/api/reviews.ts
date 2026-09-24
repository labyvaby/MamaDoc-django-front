import { apiRequest } from "./client";

// ── Domain types ─────────────────────────────────────────────────────────────
// Backend contract: docs `reviews-contract.md`. Все имена полей — camelCase.

export type ReviewSentiment = "negative" | "neutral" | "promoter";

/** Канал доставки (v1-поле настроек; v2 шлёт сценарием Raven WhatsApp → SMS). */
export type ReviewChannel = "whatsapp" | "sms" | "whatsapp_then_sms";

export type ReviewRequestStatus =
  | "created"
  | "sent"
  | "rated"
  | "awaiting_comment"
  | "completed"
  | "expired"
  | "failed"
  | "skipped";

export type MapPlatform = "2gis" | "yandex" | "google";
export type CaseStatus = "" | "new" | "in_progress" | "resolved";
/** Что разрешил пациент: не публиковать, анонимно, с подписью. */
export type PublishConsent = "private" | "anonymous" | "named";
export type PublicationStatus = "pending" | "published" | "hidden";
/** Фильтр списка: queue — пациент разрешил, ещё не проверено. */
export type PublicationFilter = "queue" | "published" | "hidden";
export type StaffGroup = "doctor" | "registrar" | "cashier";

export interface MapLink {
  platform: MapPlatform;
  url: string;
}

/** Элемент списка отзывов. */
export interface Review {
  id: number;
  appointmentId: number;
  patientName: string | null;
  doctorName: string | null;
  rating: number;
  comment: string | null;
  sentiment: ReviewSentiment;
  channel: ReviewChannel;
  ratedAt: string;
  status: ReviewRequestStatus;
  doctorRating: number | null;
  registryRating: number | null;
  tags: string[];
  commentEdited: boolean;
  branchId: number | null;
  branchName: string | null;
  patientPhone: string | null;
  caseStatus: CaseStatus;
  caseNote: string;
  caseAssigneeId: number | null;
  mapsOffered: boolean;
  mapClicks: MapPlatform[];
  publishConsent: PublishConsent;
  publicName: string;
  publicationStatus: PublicationStatus;
  publishedAt: string | null;
}

export interface ReviewsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Review[];
}

/** Статистика дашборда. Доли и средние — строки. */
export interface ReviewStats {
  sent: number;
  answered: number;
  /** answered / sent, строка с 2 знаками, напр. "0.73". */
  responseRate: string;
  avgRating: string;
  byRating: Record<string, number>;
  negativeCount: number;
  promoterCount: number;
  /** Сколько отзывов с переходом в карты. */
  redirectedTo2Gis: number;
  deliveredWhatsapp: number;
  deliveredSms: number;
  avgDoctorRating: string | null;
  avgRegistryRating: string | null;
  mapClicks: number;
  confirmedPublicReviews: number;
  openCases: number;
}

/** Запрос отзыва по приёму. */
export interface ReviewRequest {
  id: number;
  appointmentId: number;
  patientName: string | null;
  doctorName: string | null;
  channel: ReviewChannel;
  status: ReviewRequestStatus;
  attempt: number;
  rating: number | null;
  sentAt: string | null;
  createdAt: string;
  branchId: number | null;
  deliveredChannel: "whatsapp" | "sms" | null;
  error: string | null;
}

export interface BranchMaps {
  branchId: number;
  branchName: string;
  maps: MapLink[];
}

/** Настройки модуля. */
export interface ReviewSettings {
  organizationId: number;
  enabled: boolean;
  channel: ReviewChannel;
  delayMinutes: number;
  expireHours: number;
  negativeThreshold: number;
  gisUrl: string;
  templateInvite: string;
  templateAskComment: string;
  templateThanks5: string;
  templateThanksLow: string;
  variables: string[];
  /** "HH:MM" */
  quietFrom: string;
  quietTo: string;
  minDaysBetween: number;
  positiveTags: string[];
  negativeTags: string[];
  /** Глобальный флаг авторассылки на платформе. */
  platformEnabled: boolean;
  branchMaps: BranchMaps[];
}

/** Частичное обновление настроек (шлём только меняемые поля). */
export interface ReviewSettingsPatch {
  enabled?: boolean;
  delayMinutes?: number;
  expireHours?: number;
  quietFrom?: string;
  quietTo?: string;
  minDaysBetween?: number;
  positiveTags?: string[];
  negativeTags?: string[];
  /** Суперадмин может адресовать чужую организацию. */
  organizationId?: number;
}

/** Контекст публичной страницы отзыва. */
export interface RateContext {
  token: string;
  status: ReviewRequestStatus;
  patientName: string;
  doctorName: string | null;
  hasDoctor: boolean;
  clinicName: string;
  answered: boolean;
  rating: number | null;
  doctorRating: number | null;
  registryRating: number | null;
  tags: string[];
  comment: string;
  publishConsent: PublishConsent;
  publicName: string;
  publicationStatus: PublicationStatus | null;
  positiveTags: string[];
  negativeTags: string[];
  canEdit: boolean;
  maps: MapLink[];
}

export interface RateSubmit {
  rating: number;
  doctorRating?: number | null;
  registryRating?: number | null;
  tags?: string[];
  comment?: string;
  publishConsent?: PublishConsent;
  publicName?: string;
}

export interface StaffStatsRow {
  id: number;
  name: string;
  sent: number;
  answered: number;
  avgRating: string | null;
  /** Оценка врача (врачи) / регистратуры (регистраторы); у кассиров null. */
  avgSubRating: string | null;
  negative: number;
  promoter: number;
  topTags: string[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Confirmation {
  id: number;
  reviewId: number | null;
  platform: MapPlatform;
  status: "confirmed" | "not_found";
  source: "manual" | "parser" | "api";
  url: string;
  note: string;
  updatedAt: string;
}

export interface MapClickRow {
  reviewId: number;
  patientName: string | null;
  patientPhone: string | null;
  branchName: string | null;
  rating: number;
  ratedAt: string;
  clicks: { platform: MapPlatform; clickedAt: string }[];
  confirmations: Confirmation[];
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReviewStatsFilters {
  /** YYYY-MM-DD — фильтр по дате запроса отзыва. */
  from: string;
  to: string;
  branchId?: number;
  organizationId?: number;
}

export interface ReviewsFilters extends ReviewStatsFilters {
  rating?: number;
  sentiment?: ReviewSentiment;
  doctorId?: number;
  caseStatus?: "open" | CaseStatus;
  publication?: PublicationFilter;
  page?: number;
  pageSize?: number;
}

function periodQuery(f: ReviewStatsFilters): URLSearchParams {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.branchId != null) q.set("branchId", String(f.branchId));
  if (f.organizationId != null)
    q.set("organizationId", String(f.organizationId));
  return q;
}

// ── API functions (под авторизацией) ────────────────────────────────────────

export function getReviews(
  filters: ReviewsFilters,
  signal?: AbortSignal
): Promise<ReviewsResponse> {
  const q = periodQuery(filters);
  if (filters.rating != null) q.set("rating", String(filters.rating));
  if (filters.sentiment) q.set("sentiment", filters.sentiment);
  if (filters.doctorId != null) q.set("doctorId", String(filters.doctorId));
  if (filters.caseStatus) q.set("caseStatus", filters.caseStatus);
  if (filters.publication) q.set("publication", filters.publication);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return apiRequest<ReviewsResponse>(`/reviews/?${q.toString()}`, { signal });
}

export function getReviewStats(
  filters: ReviewStatsFilters,
  signal?: AbortSignal
): Promise<ReviewStats> {
  return apiRequest<ReviewStats>(
    `/reviews/stats/?${periodQuery(filters).toString()}`,
    { signal }
  );
}

export function getStaffStats(
  filters: ReviewStatsFilters & { group: StaffGroup },
  signal?: AbortSignal
): Promise<{ group: StaffGroup; results: StaffStatsRow[] }> {
  const q = periodQuery(filters);
  q.set("group", filters.group);
  return apiRequest(`/reviews/staff-stats/?${q.toString()}`, { signal });
}

export function getTagStats(
  filters: ReviewStatsFilters,
  signal?: AbortSignal
): Promise<{ positive: TagCount[]; negative: TagCount[] }> {
  return apiRequest(`/reviews/tag-stats/?${periodQuery(filters).toString()}`, {
    signal,
  });
}

export function getMapClicks(
  filters: ReviewStatsFilters & { page?: number },
  signal?: AbortSignal
): Promise<{
  count: number;
  next: string | null;
  previous: string | null;
  results: MapClickRow[];
}> {
  const q = periodQuery(filters);
  if (filters.page != null) q.set("page", String(filters.page));
  return apiRequest(`/reviews/map-clicks/?${q.toString()}`, { signal });
}

export function updateCase(
  reviewId: number,
  body: {
    status?: CaseStatus;
    assigneeUserId?: number;
    clearAssignee?: boolean;
    note?: string;
  }
): Promise<Review> {
  return apiRequest<Review>(`/reviews/${reviewId}/case/`, {
    method: "PATCH",
    body,
  });
}

/** PATCH /api/reviews/<id>/publication/ — опубликовать на сайте, скрыть или вернуть на проверку. */
export function setPublication(
  reviewId: number,
  status: PublicationStatus
): Promise<Review> {
  return apiRequest<Review>(`/reviews/${reviewId}/publication/`, {
    method: "PATCH",
    body: { status },
  });
}

export function confirmPublicReview(body: {
  reviewId: number;
  platform: MapPlatform;
  status: "confirmed" | "not_found";
  url?: string;
  note?: string;
}): Promise<Confirmation> {
  return apiRequest<Confirmation>("/reviews/confirmations/", {
    method: "POST",
    body,
  });
}

/**
 * POST /api/reviews/requests/ — инициировать / переотправить запрос.
 * Активный запрос уже есть или пациент уже ответил → 409. Ответ 201.
 */
export function createReviewRequest(
  appointmentId: number
): Promise<ReviewRequest> {
  return apiRequest<ReviewRequest>("/reviews/requests/", {
    method: "POST",
    body: { appointmentId },
  });
}

/** GET /api/reviews/requests/?appointmentId= — запросы по приёму (новые первыми). */
export function getReviewRequestsByAppointment(
  appointmentId: number,
  signal?: AbortSignal
): Promise<ReviewRequest[]> {
  const q = new URLSearchParams({ appointmentId: String(appointmentId) });
  return apiRequest<ReviewRequest[]>(`/reviews/requests/?${q.toString()}`, {
    signal,
  });
}

export function getReviewSettings(
  organizationId?: number,
  signal?: AbortSignal
): Promise<ReviewSettings> {
  const q = new URLSearchParams();
  if (organizationId != null) q.set("organizationId", String(organizationId));
  const qs = q.toString();
  return apiRequest<ReviewSettings>(`/reviews/settings/${qs ? `?${qs}` : ""}`, {
    signal,
  });
}

export function updateReviewSettings(
  patch: ReviewSettingsPatch
): Promise<ReviewSettings> {
  return apiRequest<ReviewSettings>("/reviews/settings/", {
    method: "PATCH",
    body: patch,
  });
}

// ── Публичная страница отзыва (без авторизации) ──────────────────────────────

/** GET /api/reviews/rate/<token>/ — контекст страницы. Неизвестный токен → 404. */
export function getRateContext(
  token: string,
  signal?: AbortSignal
): Promise<RateContext> {
  return apiRequest<RateContext>(
    `/reviews/rate/${encodeURIComponent(token)}/`,
    { signal }
  );
}

/** POST /api/reviews/rate/<token>/ — отправка или правка ответа. Ссылка закрыта → 409 REVIEW_CLOSED. */
export function postRate(
  token: string,
  body: RateSubmit
): Promise<RateContext> {
  return apiRequest<RateContext>(
    `/reviews/rate/${encodeURIComponent(token)}/`,
    {
      method: "POST",
      body,
    }
  );
}

/** POST /api/reviews/rate/<token>/click/ — пациент нажал «Оставить отзыв в …». */
export function postMapClick(
  token: string,
  platform: MapPlatform
): Promise<{ ok: boolean }> {
  return apiRequest(`/reviews/rate/${encodeURIComponent(token)}/click/`, {
    method: "POST",
    body: { platform },
  });
}
