import { apiRequest } from "./client";

/**
 * Настройки «диалог Chatwoot → сделка в воронке» (per-org).
 *
 * Бэкенд: `/api/chatwoot/lead-integration/` (+ `rotate-secret/`, `test/`),
 * право `chatwoot.manage`. Контракт — `server/apps/chatwoot/api/payloads.py`
 * в MamaDoc-backend и `chatwoot-crm-lead-integration-CHATWOOT-SIDE.md`.
 *
 * API-токен Chatwoot в ответах не приходит никогда — только флаг
 * `apiTokenConfigured`; в PUT пустая строка означает «не менять», снять —
 * отдельным флагом `chatwootApiTokenClear` (та же конвенция, что у паролей
 * SMS/WhatsApp в настройках уведомлений).
 */

/** Как инбокс определяет человека: WA — по телефону, IG/TG — по contact id. */
export type ChatwootInboxIdentity = "phone" | "username";

/** Канал сделки (`Deal.channel`); пусто — «другое». */
export type ChatwootInboxChannel =
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "web"
  | "phone"
  | "other"
  | "";

export interface ChatwootInboxRule {
  /** Имя источника сделки («WhatsApp»); несуществующий создаётся на бэке. */
  source: string;
  identity: ChatwootInboxIdentity;
  channel: ChatwootInboxChannel;
  /** Филиал, куда заводится новая сделка из инбокса; null — общая (видна на всех досках). */
  branchId?: number | null;
}

/** Ключи — id инбоксов Chatwoot строкой (JSON-объект). */
export type ChatwootInboxMap = Record<string, ChatwootInboxRule>;

export interface ChatwootLeadSettings {
  enabled: boolean;
  /** Аккаунт Chatwoot организации (из подключения «Чаты»); null — не настроен. */
  accountId: number | null;
  /** Раздел «Чаты» (встроенный Chatwoot) включён для организации. */
  chatsEnabled: boolean;
  /** Готовая ссылка приёмника с секретом; пустая, пока настройки ни разу не сохранены. */
  webhookUrl: string;
  apiTokenConfigured: boolean;
  pipelineCode: string;
  reopenStageCode: string;
  defaultAssigneeId: number | null;
  inboxMap: ChatwootInboxMap;
  inboxWhitelist: number[];
}

export interface ChatwootLeadSettingsInput {
  enabled: boolean;
  /** Раздел «Чаты» и аккаунт: не передавать — не трогать. */
  chatsEnabled?: boolean;
  accountId?: number | null;
  chatwootApiToken: string;
  chatwootApiTokenClear: boolean;
  pipelineCode: string;
  reopenStageCode: string;
  defaultAssigneeId: number | null;
  inboxMap: ChatwootInboxMap;
  inboxWhitelist: number[];
  organizationId?: number;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  /** `Channel::Api` (WA через Evolution), `Channel::Whatsapp`, `Channel::Instagram`… */
  channelType: string;
  phoneNumber: string | null;
}

export interface ChatwootTestConnection {
  ok: boolean;
  inboxes: ChatwootInbox[];
  error: string | null;
}

export interface ChatwootLeadSecret {
  webhookUrl: string;
}

function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

export function getChatwootLeadSettings(
  signal?: AbortSignal,
  opts?: { organizationId?: number },
): Promise<ChatwootLeadSettings> {
  return apiRequest<ChatwootLeadSettings>(
    withOrg("/chatwoot/lead-integration/", opts?.organizationId),
    { signal },
  );
}

export function saveChatwootLeadSettings(
  input: ChatwootLeadSettingsInput,
): Promise<ChatwootLeadSettings> {
  return apiRequest<ChatwootLeadSettings>("/chatwoot/lead-integration/", {
    method: "PUT",
    body: input,
  });
}

/** Новый секрет — прежняя ссылка в Chatwoot перестаёт действовать сразу. */
export function rotateChatwootLeadSecret(opts?: {
  organizationId?: number;
}): Promise<ChatwootLeadSecret> {
  return apiRequest<ChatwootLeadSecret>(
    withOrg("/chatwoot/lead-integration/rotate-secret/", opts?.organizationId),
    { method: "POST" },
  );
}

/**
 * «Проверить связь»: перечисляет инбоксы аккаунта. Токен из формы проверяется
 * до сохранения; пустой — берётся сохранённый, а затем токен подключения «Чаты».
 */
export function testChatwootLeadConnection(input: {
  chatwootApiToken?: string;
  organizationId?: number;
}): Promise<ChatwootTestConnection> {
  return apiRequest<ChatwootTestConnection>("/chatwoot/lead-integration/test/", {
    method: "POST",
    body: {
      chatwootApiToken: input.chatwootApiToken ?? "",
      ...(input.organizationId != null ? { organizationId: input.organizationId } : {}),
    },
  });
}

/**
 * Подсказка правила по типу инбокса — только предзаполнение, решает
 * пользователь. WhatsApp через Evolution/GOWA приходит как `Channel::Api`.
 */
export function suggestInboxRule(inbox: ChatwootInbox): ChatwootInboxRule {
  const type = inbox.channelType;
  if (type === "Channel::Instagram" || type === "Channel::FacebookPage") {
    return { source: "Instagram", identity: "username", channel: "instagram" };
  }
  if (type === "Channel::Telegram") {
    return { source: "Telegram", identity: "username", channel: "telegram" };
  }
  if (type === "Channel::Whatsapp" || type === "Channel::Api") {
    return { source: "WhatsApp", identity: "phone", channel: "whatsapp" };
  }
  if (type === "Channel::WebWidget") {
    return { source: "Сайт", identity: "username", channel: "web" };
  }
  return { source: inbox.name, identity: "phone", channel: "" };
}

/** Сотрудник CRM ↔ агент Chatwoot (по email); agentId null — в «Чаты» не попадёт. */
export interface ChatwootAgentStatus {
  employeeId: number;
  fullName: string;
  email: string;
  agentId: number | null;
  agentName: string;
  linked: boolean;
}

export interface ChatwootAgentsStatus {
  ok: boolean;
  error: string;
  agentsTotal: number;
  results: ChatwootAgentStatus[];
}

export function getChatwootAgentsStatus(
  signal?: AbortSignal,
  opts?: { organizationId?: number },
): Promise<ChatwootAgentsStatus> {
  const qs = opts?.organizationId != null ? `?organizationId=${opts.organizationId}` : "";
  return apiRequest<ChatwootAgentsStatus>(`/chatwoot/agents-status/${qs}`, { signal });
}
