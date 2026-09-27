/**
 * Журнал действий (Audit Trail) — `/api/v2/audit/` на бэке.
 *
 * Только чтение: события пишет сам бэк из сервисного слоя. Организация
 * запроса — заголовок `X-Organization-Id` (как в procurement/pos), фильтр
 * её расширить не может. Подписи кодов событий приходят из `/catalog/`,
 * поэтому огромного `switch(action)` во фронте нет: неизвестный код
 * показывается как есть.
 */
import { API_BASE, apiRequest } from "./client";

export type AuditActorType =
  | "user"
  | "platform_admin"
  | "customer"
  | "system"
  | "integration"
  | "anonymous";

export type AuditOutcome = "success" | "failure" | "denied";

/** `{"поле": {"old": …, "new": …}}`; секреты приходят как `{"changed": true}`. */
export type AuditChange =
  | { old?: unknown; new?: unknown }
  | { changed: true; length?: number };

export interface AuditEvent {
  id: number;
  occurredAt: string;
  organizationId: number | null;
  branchId: number | null;
  branchName: string | null;
  actor: { type: AuditActorType; name: string; userId: number | null };
  action: string;
  actionLabel: string | null;
  category: string;
  outcome: AuditOutcome;
  source: string;
  resource: { type: string; id: string; label: string };
  changes: Record<string, AuditChange>;
  metadata: Record<string, unknown>;
  requestId: string;
  traceId: string;
  /** Полный IP — только с правом безопасности; иначе маска `192.168.*.*`. */
  ipAddress: string | null;
  /** Сырой User-Agent — только с правом безопасности. */
  userAgent: string | null;
  /** Грубая подпись «Chrome · Windows», видна всегда. */
  device: string | null;
  httpMethod: string;
  path: string;
  statusCode: number | null;
  authMethod: string;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

export interface AuditCatalog {
  categories: { code: string; label: string }[];
  actions: { code: string; label: string; category: string }[];
  canViewSecurity: boolean;
  canExport: boolean;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  category?: string;
  action?: string;
  actorId?: number;
  branchId?: number;
  outcome?: AuditOutcome;
  search?: string;
}

export interface AuditScope {
  organizationId?: number;
}

const BASE = "/v2/audit";
const PAGE_SIZE = 50;

const orgHeaders = (scope?: AuditScope): Record<string, string> =>
  scope?.organizationId != null
    ? { "X-Organization-Id": String(scope.organizationId) }
    : {};

/** Query string без пустых значений. */
export function auditQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function getAuditEvents(
  filters: AuditFilters,
  cursor: string | null,
  scope?: AuditScope,
  signal?: AbortSignal,
): Promise<AuditPage> {
  return apiRequest<AuditPage>(
    `${BASE}/events/${auditQuery({ ...filters, cursor, pageSize: PAGE_SIZE })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function getAuditCatalog(
  scope?: AuditScope,
  signal?: AbortSignal,
): Promise<AuditCatalog> {
  return apiRequest<AuditCatalog>(`${BASE}/catalog/`, {
    headers: orgHeaders(scope),
    signal,
  });
}

/**
 * CSV-выгрузка. Файл отдаётся потоком, поэтому берём Blob через fetch:
 * ссылка `<a href>` не донесла бы заголовок `X-Organization-Id`.
 */
export async function downloadAuditCsv(
  filters: AuditFilters,
  scope?: AuditScope,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}${BASE}/events/export/${auditQuery({ ...filters })}`,
    { credentials: "include", headers: orgHeaders(scope) },
  );
  if (!response.ok) {
    let message = "Не удалось выгрузить журнал.";
    try {
      const body = await response.json();
      message = body?.error?.message ?? message;
    } catch {
      /* тело не JSON — оставляем общее сообщение */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-${filters.from ?? ""}-${filters.to ?? ""}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
