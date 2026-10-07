import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Настройки» застройщика (AIVIO): роли и права, справочники, интеграции и 1С,
 * аудит — `/api/v2/integrations/`. Гайд бэка `frontend-settings.md` (05.10.2026).
 * - матрица «модуль × роль» — адаптер над rbac: уровень ячейки меняет коды прав роли;
 *   следующий уровень по кругу считает фронт (`nextLevel`), системную роль бэк не даёт менять (400);
 * - чтение — `integrations.view`, любая кнопка — `integrations.manage` (+ `rbac.*` у ролей и пользователей);
 * - внешних вызовов у интеграций нет: «Проверить» смотрит только настройки, «Обмен» помечает очередь
 *   выгруженной; секреты наружу не отдаются, секрет вебхука показывается один раз — в ответе создания;
 * - журнал аудита общий на организацию, только добавляется.
 */

const API = "/v2/integrations";

export const MATRIX_LEVELS = ["none", "view", "edit", "approve"] as const;
export type MatrixLevel = (typeof MATRIX_LEVELS)[number];

/** Клик по ячейке: none → view → edit → approve → none. */
export function nextLevel(level: string): MatrixLevel {
  const i = MATRIX_LEVELS.indexOf(level as MatrixLevel);
  return MATRIX_LEVELS[(i + 1) % MATRIX_LEVELS.length];
}

export interface MatrixModule {
  id: string;
  label: string;
  group: string;
  groupLabel: string;
}

export interface MatrixRole {
  id: number;
  code: string;
  label: string;
  isSystem: boolean;
  isStandard: boolean;
  usersCount: number;
  customized: boolean;
  permissions: Record<string, string>;
}

export interface RolesMatrix {
  levels: { id: string; label: string }[];
  modules: MatrixModule[];
  roles: MatrixRole[];
}

export interface OrgUser {
  id: number;
  userId: number | null;
  employeeId: number | null;
  name: string;
  email: string;
  position: string;
  roleId: number | null;
  roleCode: string;
  roleName: string;
  isOwner: boolean;
  twoFa: boolean;
  lastLogin: string | null;
  invitedAt: string | null;
  status: "active" | "blocked" | string;
}

export interface SecurityPolicy {
  code: string;
  title: string;
  description: string;
  status: "enabled" | "partial" | string;
  enforced: boolean;
}

export interface SecuritySummary {
  roles: number;
  customizedRoles: number;
  users: number;
  activeUsers: number;
  twoFaEnabled: number;
  twoFaPct: number;
  policies: SecurityPolicy[];
}

export type DictionaryItem = Record<string, unknown> & { id?: string | number };

export interface Dictionary {
  key: string;
  label: string;
  available: boolean;
  editable: boolean;
  editEndpoint: string | null;
  count: number;
  items: DictionaryItem[];
}

export interface CompanyDetails {
  configured: boolean;
  name: string;
  short: string;
  inn: string;
  okpo: string;
  address: string;
  phone: string;
  email: string;
  director: string;
  directorPosition: string;
  basis: string;
  bank: string;
  bik: string;
  account: string;
  licence: string;
}

export const COMPANY_FIELDS = ["name", "short", "inn", "okpo", "address", "phone", "email", "director", "directorPosition", "basis", "bank", "bik", "account", "licence"] as const;
export type CompanyField = (typeof COMPANY_FIELDS)[number];

export interface IntegrationsSummary {
  connected: number;
  total: number;
  queuePending: number;
  queueErrors: number;
  lastSync1C: string | null;
  webhooksActive: number;
}

export interface Connector {
  id: number;
  code: string;
  name: string;
  type: string;
  typeLabel: string;
  status: "ok" | "warn" | "off" | string;
  statusLabel: string;
  enabled: boolean;
  description: string;
  endpoint: string;
  login: string;
  schedule: string;
  secretFields: string[];
  hasSecrets: boolean;
  lastSync: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  queuePending: number;
  queueErrors: number;
}

export interface ConnectorLogEntry {
  id: number;
  at: string;
  kind: string;
  kindLabel: string;
  ok: boolean;
  title: string;
  objectsCount: number | null;
  userName: string;
}

export interface QueueItem {
  id: number;
  number: string;
  connectorId: number | null;
  connectorName: string;
  type: string;
  typeLabel: string;
  ref: string;
  status: "pending" | "sent" | "error" | string;
  statusLabel: string;
  error: string;
  attempts: number;
  at: string;
  sentAt: string | null;
}

export interface Webhook {
  id: number;
  number: string;
  url: string;
  events: string[];
  description: string;
  active: boolean;
  hasSecret: boolean;
  /** Только в ответе создания и «Новый секрет» — показать один раз. */
  secret: string | null;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
}

export interface WebhookEvent {
  code: string;
  label: string;
}

export interface WebhookDelivery {
  id: number;
  event: string;
  status: string;
  at: string;
  simulated: boolean;
  responseCode: number | null;
}

export interface AuditEntry {
  id: number;
  ts: string;
  user: string;
  userId: number | null;
  role: string;
  action: string;
  target: string;
  details: string;
  module: string;
  moduleLabel: string;
  hash: string;
}

export interface AuditSummary {
  total: number;
  today: number;
  activeRoles: number;
  byRole: { role: string; count: number }[];
  integrityOk: boolean;
  integrityChecked: number;
  integrityBrokenId: number | null;
  lastHash: string;
  retention: string;
}

export interface AuditParams {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
const rows = (raw: any): any[] => (Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);

const fromRawRole = (r: any): MatrixRole => ({
  id: num(r.id),
  code: str(r.code),
  label: str(r.label || r.name || r.code),
  isSystem: Boolean(r.isSystem),
  isStandard: Boolean(r.isStandard),
  usersCount: num(r.usersCount),
  customized: Boolean(r.customized),
  permissions: r.permissions && typeof r.permissions === "object" ? r.permissions : {},
});

export const fromRawMatrix = (raw: any): RolesMatrix => ({
  levels: rows(raw?.levels).map((l) => ({ id: str(l.id), label: str(l.label) })),
  modules: rows(raw?.modules).map((m) => ({ id: str(m.id), label: str(m.label), group: str(m.group), groupLabel: str(m.groupLabel) })),
  // Стандартные роли (роли макета) — первыми, порядок внутри — как пришёл.
  roles: rows(raw?.roles)
    .map(fromRawRole)
    .sort((a, b) => Number(b.isStandard) - Number(a.isStandard)),
});

export const fromRawUser = (u: any): OrgUser => ({
  id: num(u.id),
  userId: numOrNull(u.userId),
  employeeId: numOrNull(u.employeeId),
  name: str(u.name),
  email: str(u.email),
  position: str(u.position),
  roleId: numOrNull(u.role ?? u.roleId),
  roleCode: str(u.roleCode),
  roleName: str(u.roleName),
  isOwner: Boolean(u.isOwner),
  twoFa: Boolean(u.twoFa),
  lastLogin: u.lastLogin || null,
  invitedAt: u.invitedAt || null,
  status: str(u.status) || "active",
});

const fromRawSecurity = (raw: any): SecuritySummary => ({
  roles: num(raw?.roles),
  customizedRoles: num(raw?.customizedRoles),
  users: num(raw?.users),
  activeUsers: num(raw?.activeUsers),
  twoFaEnabled: num(raw?.twoFaEnabled),
  twoFaPct: num(raw?.twoFaPct),
  policies: rows(raw?.policies).map((p) => ({ code: str(p.code), title: str(p.title), description: str(p.description), status: str(p.status), enforced: Boolean(p.enforced) })),
});

export const fromRawDictionary = (d: any): Dictionary => ({
  key: str(d.key),
  label: str(d.label || d.key),
  available: d.available !== false,
  editable: Boolean(d.editable),
  editEndpoint: d.editEndpoint || null,
  count: d.count != null ? num(d.count) : rows(d.items).length,
  items: rows(d.items),
});

export const fromRawCompany = (raw: any): CompanyDetails => {
  const out = { configured: raw?.configured !== false } as CompanyDetails;
  for (const field of COMPANY_FIELDS) out[field] = str(raw?.[field]);
  return out;
};

export const fromRawConnector = (c: any): Connector => ({
  id: num(c.id),
  code: str(c.code),
  name: str(c.name),
  type: str(c.type),
  typeLabel: str(c.typeLabel),
  status: str(c.status) || "off",
  statusLabel: str(c.statusLabel),
  enabled: Boolean(c.enabled),
  description: str(c.description),
  endpoint: str(c.endpoint),
  login: str(c.login),
  schedule: str(c.schedule),
  secretFields: Array.isArray(c.secretFields) ? c.secretFields.map(String) : [],
  hasSecrets: Boolean(c.hasSecrets),
  lastSync: c.lastSync || null,
  lastTestAt: c.lastTestAt || null,
  lastTestOk: c.lastTestOk == null ? null : Boolean(c.lastTestOk),
  lastTestMessage: str(c.lastTestMessage),
  queuePending: num(c.queuePending),
  queueErrors: num(c.queueErrors),
});

const fromRawQueue = (q: any): QueueItem => ({
  id: num(q.id),
  number: str(q.number),
  connectorId: numOrNull(q.connectorId),
  connectorName: str(q.connectorName),
  type: str(q.type),
  typeLabel: str(q.typeLabel || q.type),
  ref: str(q.ref),
  status: str(q.status),
  statusLabel: str(q.statusLabel || q.status),
  error: str(q.error),
  attempts: num(q.attempts),
  at: str(q.at),
  sentAt: q.sentAt || null,
});

export const fromRawWebhook = (w: any): Webhook => ({
  id: num(w.id),
  number: str(w.number) || `WH-${w.id}`,
  url: str(w.url),
  events: Array.isArray(w.events) ? w.events.map(String) : [],
  description: str(w.description),
  active: Boolean(w.active),
  hasSecret: Boolean(w.hasSecret),
  secret: w.secret || null,
  lastDeliveryAt: w.lastDeliveryAt || null,
  lastDeliveryStatus: w.lastDeliveryStatus || null,
});

/** События формы вебхука: бэк может отдать строками или объектами `{code|id, label|name}`. */
const fromRawEvent = (e: any): WebhookEvent =>
  typeof e === "string" ? { code: e, label: e } : { code: str(e.code ?? e.id ?? e.event), label: str(e.label ?? e.name ?? e.code ?? e.id) };

const fromRawDelivery = (d: any): WebhookDelivery => ({
  id: num(d.id),
  event: str(d.event),
  status: str(d.status),
  at: str(d.at ?? d.createdAt ?? d.deliveredAt),
  simulated: Boolean(d.simulated),
  responseCode: numOrNull(d.responseCode ?? d.statusCode),
});

const fromRawAudit = (a: any): AuditEntry => ({
  id: num(a.id),
  ts: str(a.ts),
  user: str(a.user),
  userId: numOrNull(a.userId),
  role: str(a.role),
  action: str(a.action),
  target: str(a.target),
  details: str(a.details),
  module: str(a.module),
  moduleLabel: str(a.moduleLabel || a.module),
  hash: str(a.hash),
});

const fromRawAuditSummary = (raw: any): AuditSummary => ({
  total: num(raw?.total),
  today: num(raw?.today),
  activeRoles: num(raw?.activeRoles),
  byRole: rows(raw?.byRole).map((r) => ({ role: str(r.role), count: num(r.count) })),
  integrityOk: raw?.integrityOk !== false,
  integrityChecked: num(raw?.integrityChecked),
  integrityBrokenId: numOrNull(raw?.integrityBrokenId),
  lastHash: str(raw?.lastHash),
  retention: str(raw?.retention),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const call = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });
const post = <T>(scope: RealtyScope | undefined, path: string, body: unknown = {}) => call<T>(scope, path, { method: "POST", body });
const patch = <T>(scope: RealtyScope | undefined, path: string, body: unknown) => call<T>(scope, path, { method: "PATCH", body });

export function settingsQuery(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") p.set(key, String(value));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

// ── Роли и права ────────────────────────────────────────────────────────────

export async function getRolesMatrix(scope?: RealtyScope, signal?: AbortSignal): Promise<RolesMatrix> {
  return fromRawMatrix(await call(scope, "/roles-matrix/", { signal }));
}

export async function setRoleLevel(roleId: number, module: string, level: MatrixLevel, scope?: RealtyScope): Promise<MatrixRole> {
  return fromRawRole(await patch(scope, `/roles-matrix/${roleId}/`, { permissions: { [module]: level } }));
}

/** Без `roleId` — все роли. */
export async function resetRolesMatrix(roleId: number | null, scope?: RealtyScope): Promise<void> {
  await post(scope, "/roles-matrix/reset/", roleId != null ? { roleId } : {});
}

export async function getSecuritySummary(scope?: RealtyScope, signal?: AbortSignal): Promise<SecuritySummary> {
  return fromRawSecurity(await call(scope, "/security/summary/", { signal }));
}

export async function getOrgUsers(status: "all" | "active" | "blocked", scope?: RealtyScope, signal?: AbortSignal): Promise<OrgUser[]> {
  return rows(await call(scope, `/users/${settingsQuery({ status: status === "all" ? null : status })}`, { signal })).map(fromRawUser);
}

export type InviteInput = { employeeId: number; roleId: number; twoFa: boolean } | { email: string; name: string; roleId: number; twoFa: boolean };

export async function inviteUser(input: InviteInput, scope?: RealtyScope): Promise<OrgUser> {
  return fromRawUser(await post(scope, "/users/invite/", input));
}

export async function updateOrgUser(id: number, body: { status?: "active" | "blocked"; roleId?: number; twoFa?: boolean }, scope?: RealtyScope): Promise<OrgUser> {
  return fromRawUser(await patch(scope, `/users/${id}/`, body));
}

// ── Справочники и реквизиты ─────────────────────────────────────────────────

export async function getDictionaries(scope?: RealtyScope, signal?: AbortSignal): Promise<Dictionary[]> {
  return rows(await call(scope, "/dictionaries/", { signal })).map(fromRawDictionary);
}

export async function getCompany(scope?: RealtyScope, signal?: AbortSignal): Promise<CompanyDetails> {
  return fromRawCompany(await call(scope, "/company/", { signal }));
}

/** Частичное обновление: шлём только изменённые поля. */
export async function updateCompany(body: Partial<Record<CompanyField, string>>, scope?: RealtyScope): Promise<CompanyDetails> {
  return fromRawCompany(await patch(scope, "/company/", body));
}

// ── Интеграции и 1С ─────────────────────────────────────────────────────────

export async function getIntegrationsSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<IntegrationsSummary> {
  const raw = await call<Record<string, unknown>>(scope, "/summary/", { signal });
  return {
    connected: num(raw?.connected),
    total: num(raw?.total),
    queuePending: num(raw?.queuePending),
    queueErrors: num(raw?.queueErrors),
    lastSync1C: (raw?.lastSync1C as string) || null,
    webhooksActive: num(raw?.webhooksActive),
  };
}

export async function getConnectors(scope?: RealtyScope, signal?: AbortSignal): Promise<Connector[]> {
  return rows(await call(scope, "/connectors/", { signal })).map(fromRawConnector);
}

export async function getConnectorLog(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ConnectorLogEntry[]> {
  return rows(await call(scope, `/connectors/${id}/log/?limit=50`, { signal })).map((l) => ({
    id: num(l.id),
    at: str(l.at),
    kind: str(l.kind),
    kindLabel: str(l.kindLabel || l.kind),
    ok: l.ok !== false,
    title: str(l.title),
    objectsCount: numOrNull(l.objectsCount),
    userName: str(l.userName),
  }));
}

export async function connectConnector(id: number, body: { endpoint: string; login: string; token: string }, scope?: RealtyScope): Promise<Connector> {
  const payload: Record<string, string> = { endpoint: body.endpoint.trim(), login: body.login.trim() };
  if (body.token) payload.token = body.token;
  return fromRawConnector(await post(scope, `/connectors/${id}/connect/`, payload));
}

export async function testConnector(id: number, scope?: RealtyScope): Promise<{ ok: boolean; message: string }> {
  const raw = await post<{ ok?: boolean; message?: string }>(scope, `/connectors/${id}/test/`);
  return { ok: Boolean(raw?.ok), message: str(raw?.message) };
}

export async function syncConnector(id: number, scope?: RealtyScope): Promise<{ exported: number; documentsExported: number }> {
  const raw = await post<{ exported?: number; documentsExported?: number }>(scope, `/connectors/${id}/sync/`);
  return { exported: num(raw?.exported), documentsExported: num(raw?.documentsExported) };
}

export async function setConnectorEnabled(id: number, enabled: boolean, scope?: RealtyScope): Promise<Connector> {
  return fromRawConnector(await post(scope, `/connectors/${id}/${enabled ? "enable" : "disable"}/`));
}

/** Настройки коннектора: секреты — только в `secrets`, иначе 400 у `settings`. */
export async function updateConnector(id: number, body: { endpoint?: string; login?: string; schedule?: string; secrets?: Record<string, string> }, scope?: RealtyScope): Promise<Connector> {
  return fromRawConnector(await patch(scope, `/connectors/${id}/`, body));
}

export async function getSyncQueue(params: { status?: string; search?: string }, scope?: RealtyScope, signal?: AbortSignal): Promise<QueueItem[]> {
  return rows(await call(scope, `/sync-queue/${settingsQuery({ connector: "1c", status: params.status === "all" ? null : params.status, search: params.search?.trim() })}`, { signal })).map(fromRawQueue);
}

export async function retryAllQueue(scope?: RealtyScope): Promise<number> {
  return num((await post<{ count?: number }>(scope, "/sync-queue/retry-all/"))?.count);
}

export async function retryQueueItem(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/sync-queue/${id}/retry/`);
}

export async function resolveQueueItem(id: number, note: string, scope?: RealtyScope): Promise<void> {
  await post(scope, `/sync-queue/${id}/resolve/`, { note });
}

export async function getWebhooks(scope?: RealtyScope, signal?: AbortSignal): Promise<Webhook[]> {
  return rows(await call(scope, "/webhooks/", { signal })).map(fromRawWebhook);
}

export async function getWebhookEvents(scope?: RealtyScope, signal?: AbortSignal): Promise<WebhookEvent[]> {
  const raw = await call<unknown>(scope, "/webhooks/events/", { signal });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- форма ответа не зафиксирована гайдом
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.events) ? (raw as any).events : [];
  return list.map(fromRawEvent).filter((e) => e.code);
}

export async function getWebhookDeliveries(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<WebhookDelivery[]> {
  return rows(await call(scope, `/webhooks/${id}/deliveries/`, { signal })).map(fromRawDelivery);
}

/** «a.b, c.d ,» → ["a.b", "c.d"]: строку поля делим по запятой (гайд §4.2). */
export const splitEvents = (value: string) => [...new Set(value.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean))];

export async function createWebhook(body: { url: string; events: string[]; description?: string }, scope?: RealtyScope): Promise<Webhook> {
  return fromRawWebhook(await post(scope, "/webhooks/", body));
}

export async function setWebhookActive(id: number, active: boolean, scope?: RealtyScope): Promise<Webhook> {
  return fromRawWebhook(await patch(scope, `/webhooks/${id}/`, { active }));
}

export async function testWebhook(id: number, scope?: RealtyScope): Promise<WebhookDelivery> {
  return fromRawDelivery(await post(scope, `/webhooks/${id}/test/`));
}

export async function rotateWebhookSecret(id: number, scope?: RealtyScope): Promise<string | null> {
  const raw = await post<{ secret?: string | null }>(scope, `/webhooks/${id}/rotate-secret/`);
  return raw?.secret || null;
}

export async function deleteWebhook(id: number, scope?: RealtyScope): Promise<void> {
  await call(scope, `/webhooks/${id}/`, { method: "DELETE" });
}

// ── Аудит ───────────────────────────────────────────────────────────────────

export async function getAudit(params: AuditParams, scope?: RealtyScope, signal?: AbortSignal): Promise<AuditEntry[]> {
  return rows(await call(scope, `/audit/${settingsQuery({ limit: params.limit ?? 150, offset: params.offset, search: params.search?.trim(), role: params.role })}`, { signal })).map(fromRawAudit);
}

export async function getAuditSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<AuditSummary> {
  return fromRawAuditSummary(await call(scope, "/audit/summary/", { signal }));
}

/** CSV журнала на клиенте (гайд §5.1): `;` и BOM — чтобы Excel открыл кириллицу. */
export function auditCsv(entries: AuditEntry[], headers: string[]): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = entries.map((e) => [e.ts, e.user, e.role, e.action, e.target, e.details, e.moduleLabel].map(esc).join(";"));
  return `\uFEFF${[headers.map(esc).join(";"), ...lines].join("\n")}`;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const estateSettingsKeys = {
  all: ["django", "estate-settings"] as const,
  scoped: (scope: RealtyScope | undefined) => [...estateSettingsKeys.all, ...scopeKey(scope)] as const,
  matrix: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "matrix"] as const,
  security: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "security"] as const,
  users: (scope: RealtyScope | undefined, status: string) => [...estateSettingsKeys.scoped(scope), "users", status] as const,
  dictionaries: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "dictionaries"] as const,
  company: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "company"] as const,
  summary: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "summary"] as const,
  connectors: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "connectors"] as const,
  connectorLog: (scope: RealtyScope | undefined, id: number) => [...estateSettingsKeys.scoped(scope), "connector-log", id] as const,
  queue: (scope: RealtyScope | undefined, params: Record<string, unknown>) => [...estateSettingsKeys.scoped(scope), "queue", params] as const,
  webhooks: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "webhooks"] as const,
  webhookEvents: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "webhook-events"] as const,
  deliveries: (scope: RealtyScope | undefined, id: number) => [...estateSettingsKeys.scoped(scope), "deliveries", id] as const,
  audit: (scope: RealtyScope | undefined, params: Record<string, unknown>) => [...estateSettingsKeys.scoped(scope), "audit", params] as const,
  auditSummary: (scope: RealtyScope | undefined) => [...estateSettingsKeys.scoped(scope), "audit-summary"] as const,
};
