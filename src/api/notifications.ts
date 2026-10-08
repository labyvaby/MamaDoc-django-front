import { apiRequest } from "./client";

export interface NotificationRule {
  notificationType: string;
  typeLabel: string;
  enabled: boolean;
  channel: string;
  body: string;
  offsetMinutes: number;
  whatsappTemplateId?: number | null;
}

export interface NotificationSettings {
  organizationId: number;
  branchId: number | null;
  enabled: boolean;
  branchEnabled: boolean;
  variables: string[];
  rules: NotificationRule[];
  credentials: MessagingCredentials;
  whatsappTemplates?: { id: number; title: string; notificationType: string; body: string }[];
}

export interface MessagingCredentials {
  ravenKeyConfigured: boolean;
  ravenClientId: string;
  ravenClientCreated: boolean;
  smsLogin: string;
  smsSender: string;
  smsConfigured: boolean;
  whatsappLogin: string;
  whatsappConfigured: boolean;
  chatwootSource: string;
  chatwootConfigured: boolean;
}

export interface NotificationRuleInput {
  notificationType: string;
  enabled: boolean;
  channel: string;
  body: string;
  offsetMinutes: number;
  whatsappTemplateId?: number | null;
}

export interface NotificationSettingsInput {
  enabled: boolean;
  branchEnabled: boolean;
  rules: NotificationRuleInput[];
  organizationId?: number;
  branchId?: number | null;
  credentials?: MessagingCredentialsInput;
}

export interface MessagingCredentialsInput {
  ravenClientId?: string;
  ravenApiKey?: string;
  ravenApiKeyClear?: boolean;
  smsLogin?: string;
  smsPassword?: string;
  smsSender?: string;
  smsPasswordClear?: boolean;
  whatsappLogin?: string;
  whatsappPassword?: string;
  whatsappPasswordClear?: boolean;
  chatwootSource?: string;
  chatwootToken?: string;
  chatwootTokenClear?: boolean;
}

export interface NotificationHistoryItem {
  id: number;
  notificationType: string;
  typeLabel: string;
  status: string;
  channel: string;
  recipient: string;
  patientName: string | null;
  appointmentAt: string | null;
  sentAt: string | null;
  createdAt: string;
  error: string;
}

export interface NotificationHistory {
  results: NotificationHistoryItem[];
  count: number;
  next: string | null;
  previous: string | null;
}

export function getNotificationSettings(
  params: { organizationId?: number; branchId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  const q = new URLSearchParams();
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<NotificationSettings>(
    `/notifications/settings/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function saveNotificationSettings(
  input: NotificationSettingsInput,
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  return apiRequest<NotificationSettings>("/notifications/settings/", {
    method: "PUT",
    body: input,
    signal,
  });
}

export function createRavenClient(
  input: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  return apiRequest<NotificationSettings>("/notifications/settings/raven-client/", {
    method: "POST",
    body: input,
    signal,
  });
}

export function getNotificationHistory(
  params: { page?: number; pageSize?: number; organizationId?: number; branchId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationHistory> {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.pageSize != null) q.set("pageSize", String(params.pageSize));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<NotificationHistory>(
    `/notifications/history/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export interface NotificationTemplatePreset {
  id: number;
  code: string;
  title: string;
  body: string;
  notificationType: string;
  language: string;
}

export interface WhatsAppTemplate {
  id: number;
  organizationId: number;
  name: string;
  title: string;
  body: string;
  notificationType: string;
  language: string;
  category: string;
  variableOrder: string[];
  status: string;
  metaTemplateId: string;
  ravenTemplateCode: string;
  rejectionReason: string;
  syncedAt: string | null;
  ready: boolean;
}

export interface WhatsAppTemplateLibrary {
  organizationId: number;
  presets: NotificationTemplatePreset[];
  templates: WhatsAppTemplate[];
  variableExamples: Record<string, string>;
  canSubmit: boolean;
  unavailableReason: string;
  presetCount: number;
  templateCount: number;
  page: number;
}

export interface WhatsAppTemplateInput {
  organizationId: number;
  name: string;
  title: string;
  body: string;
  notificationType: string;
  language: string;
  presetId?: number | null;
}

export function getWhatsAppTemplateLibrary(organizationId: number, signal?: AbortSignal, page = 1, search = "") {
  const query = new URLSearchParams({ organizationId: String(organizationId), page: String(page), search });
  return apiRequest<WhatsAppTemplateLibrary>(`/notifications/templates/?${query}`, { signal });
}

export function saveWhatsAppTemplate(input: WhatsAppTemplateInput, id?: number) {
  return apiRequest<WhatsAppTemplate>(id ? `/notifications/templates/${id}/` : "/notifications/templates/", {
    method: id ? "PATCH" : "POST", body: input,
  });
}

export function createNotificationTemplatePreset(input: Omit<NotificationTemplatePreset, "id">) {
  return apiRequest<NotificationTemplatePreset>("/notifications/template-presets/", { method: "POST", body: input });
}

export function submitWhatsAppTemplate(id: number, organizationId: number) {
  return apiRequest<WhatsAppTemplate>(`/notifications/templates/${id}/submit/`, { method: "POST", body: { organizationId } });
}

export function syncWhatsAppTemplate(id: number, organizationId: number) {
  return apiRequest<WhatsAppTemplate>(`/notifications/templates/${id}/sync/`, { method: "POST", body: { organizationId } });
}
