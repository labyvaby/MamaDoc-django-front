import { apiRequest } from "./client";

/**
 * Обращения в поддержку платформы (бэкенд: server/apps/support, `/api/support/`).
 *
 * Контракт — docs/support-module-contract.md бэкенда. Коротко:
 *  - право для создания и просмотра СВОИХ обращений не нужно (канал связи
 *    есть у каждого сотрудника);
 *  - `support.view_all` / владелец — видит обращения организации и филиалов;
 *  - разработчик (суперпользователь) видит все организации;
 *  - скриншот и вложения видит автор и разработчик, технический снимок —
 *    только разработчик; удалить обращение нельзя, только аннулировать.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type TicketCategory = "bug" | "idea" | "question";

export type TicketStatus =
  | "new"
  | "in_progress"
  | "needs_info"
  | "planned"
  | "resolved"
  | "rejected"
  | "voided";

export type TicketImpact = "blocked" | "degraded" | "minor";

export type TicketEventKind = "created" | "status" | "voided" | "reopened";

export interface SupportTicket {
  id: number;
  /** `SUP-1042` — человекочитаемый номер. */
  number: string;
  category: TicketCategory;
  status: TicketStatus;
  /** Пусто у пожеланий и вопросов. */
  impact: TicketImpact | "";
  title: string;
  preview: string;
  authorName: string;
  authorRole: string;
  organizationId: number;
  organizationName: string;
  branchId: number | null;
  branchName: string | null;
  pagePath: string;
  /** Автор — текущий пользователь. */
  mine: boolean;
  /** Автору: есть новый ответ. Разработчику: обращение ждёт реакции. */
  unread: boolean;
  awaitingStaff: boolean;
  commentsCount: number;
  hasScreenshot: boolean;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface SupportTicketsPage {
  results: SupportTicket[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface SupportComment {
  id: number;
  /** Для не-разработчика ответ поддержки всегда «Поддержка MamaDoc». */
  authorName: string;
  isSupport: boolean;
  /** Внутренняя заметка — видна только разработчикам. */
  internal: boolean;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface SupportEvent {
  id: number;
  kind: TicketEventKind;
  actorName: string;
  isSupport: boolean;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  reason: string;
  createdAt: string;
}

export interface SupportAttachment {
  id: number;
  kind: "screenshot" | "file";
  name: string;
  contentType: string;
  size: number;
  purged: boolean;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  description: string;
  steps: string;
  expected: string;
  comments: SupportComment[];
  events: SupportEvent[];
  attachments: SupportAttachment[];
  canComment: boolean;
  canVoid: boolean;
  canReopen: boolean;
  canChangeStatus: boolean;
  canAttach: boolean;
  reopenUntil: string | null;
  /** Только разработчику. */
  hasDiagnostics: boolean;
  traceIds: string[] | null;
  errorSignature: string | null;
  /** Сколько ещё обращений с той же ошибкой — только разработчику. */
  similarCount: number | null;
}

export interface SupportAttachmentFile {
  id: number;
  contentType: string;
  size: number;
  dataUrl: string;
}

export interface SupportDiagnostics {
  appVersion: string;
  userAgent: string;
  screen: string;
  route: string;
  traceIds: string[];
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SupportSummary {
  isStaff: boolean;
  canViewAll: boolean;
  /** Мои обращения с новым ответом. */
  unread: number;
  /** Мои открытые обращения. */
  open: number;
  total?: number | null;
  scopeOpen?: number | null;
  /** Очередь разработчика (или руководителя): ждут реакции. */
  needsAttention?: number | null;
  byStatus?: Record<TicketStatus, number> | null;
  byCategory?: Record<TicketCategory, number> | null;
}

export interface SupportFilterOptions {
  organizations: { id: number; name: string; count: number }[];
  branches: { id: number; name: string; organizationId: number; count: number }[];
}

export interface SupportListParams {
  status?: TicketStatus[];
  category?: TicketCategory | "";
  search?: string;
  mine?: boolean;
  open?: boolean;
  needsAttention?: boolean;
  organizationId?: number | null;
  branchId?: number | null;
  ordering?: "activity" | "created" | "attention";
  page?: number;
  pageSize?: number;
}

export interface CreateTicketInput {
  category: TicketCategory;
  title: string;
  description?: string;
  steps?: string;
  expected?: string;
  impact?: TicketImpact | "";
  pagePath?: string;
  /** data URL изображения (JPEG/PNG/WebP). */
  screenshot?: string | null;
  /** Технический снимок — собирает recorder, пользователю не показывается. */
  diagnostics?: Record<string, unknown> | null;
  appVersion?: string;
  userAgent?: string;
  screen?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = "/support";

function buildQuery(params: SupportListParams): string {
  const q = new URLSearchParams();
  if (params.status?.length) q.set("status", params.status.join(","));
  if (params.category) q.set("category", params.category);
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.mine) q.set("mine", "1");
  if (params.open) q.set("open", "1");
  if (params.needsAttention) q.set("needsAttention", "1");
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.ordering) q.set("ordering", params.ordering);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? 20));
  return q.toString();
}

/**
 * Организацию запроса бэк берёт из `X-Organization-Id`. Обычному сотруднику
 * заголовок не нужен (организация выводится из сессии), а при создании
 * обращения разработчиком он обязателен — иначе у обращения не будет тенанта.
 */
function orgHeaders(organizationId?: number | null): Record<string, string> {
  return organizationId != null ? { "X-Organization-Id": String(organizationId) } : {};
}

// ── API ────────────────────────────────────────────────────────────────────

export const listSupportTickets = (params: SupportListParams = {}, signal?: AbortSignal) =>
  apiRequest<SupportTicketsPage>(`${BASE}/tickets/?${buildQuery(params)}`, { signal });

export const getSupportTicket = (id: number, signal?: AbortSignal) =>
  apiRequest<SupportTicketDetail>(`${BASE}/tickets/${id}/`, { signal });

export const createSupportTicket = (input: CreateTicketInput, organizationId?: number | null) =>
  apiRequest<SupportTicketDetail>(`${BASE}/tickets/`, {
    method: "POST",
    body: input,
    headers: orgHeaders(organizationId),
  });

export const addSupportComment = (id: number, body: string, internal = false) =>
  apiRequest<SupportComment>(`${BASE}/tickets/${id}/comments/`, {
    method: "POST",
    body: { body, internal },
  });

export const changeSupportStatus = (id: number, status: TicketStatus, comment = "") =>
  apiRequest<SupportTicketDetail>(`${BASE}/tickets/${id}/status/`, {
    method: "POST",
    body: { status, comment },
  });

export const voidSupportTicket = (id: number, reason: string) =>
  apiRequest<SupportTicketDetail>(`${BASE}/tickets/${id}/void/`, {
    method: "POST",
    body: { reason },
  });

export const reopenSupportTicket = (id: number, comment: string) =>
  apiRequest<SupportTicketDetail>(`${BASE}/tickets/${id}/reopen/`, {
    method: "POST",
    body: { comment },
  });

export const markSupportTicketRead = (id: number) =>
  apiRequest<SupportSummary>(`${BASE}/tickets/${id}/read/`, { method: "POST", body: {} });

export const uploadSupportAttachment = (id: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<SupportAttachment>(`${BASE}/tickets/${id}/attachments/`, {
    method: "POST",
    formData,
  });
};

export const getSupportAttachment = (id: number, signal?: AbortSignal) =>
  apiRequest<SupportAttachmentFile>(`${BASE}/attachments/${id}/`, { signal });

export const getSupportDiagnostics = (id: number, signal?: AbortSignal) =>
  apiRequest<SupportDiagnostics>(`${BASE}/tickets/${id}/diagnostics/`, { signal });

export const getSupportSummary = (signal?: AbortSignal) =>
  apiRequest<SupportSummary>(`${BASE}/summary/`, { signal });

export const getSupportFilters = (signal?: AbortSignal) =>
  apiRequest<SupportFilterOptions>(`${BASE}/filters/`, { signal });
