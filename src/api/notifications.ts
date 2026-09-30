import { apiRequest } from "./client";

export interface NotificationRule {
  notificationType: string;
  typeLabel: string;
  enabled: boolean;
  channel: string;
  body: string;
  offsetMinutes: number;
}

export interface NotificationSettings {
  organizationId: number;
  branchId: number | null;
  enabled: boolean;
  branchEnabled: boolean;
  variables: string[];
  rules: NotificationRule[];
  credentials: MessagingCredentials;
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
}

export interface NotificationRuleInput {
  notificationType: string;
  enabled: boolean;
  channel: string;
  body: string;
  offsetMinutes: number;
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
  ravenApiKey?: string;
  ravenApiKeyClear?: boolean;
  smsLogin?: string;
  smsPassword?: string;
  smsSender?: string;
  smsPasswordClear?: boolean;
  whatsappLogin?: string;
  whatsappPassword?: string;
  whatsappPasswordClear?: boolean;
}

/** Один филиал организации и его переключатель отправки. */
export interface BranchSwitch {
  id: number;
  name: string;
  /** Строки на бэке нет — филиал ни разу не включали, читается как false. */
  enabled: boolean;
}

/**
 * Переключатели отправки без правил конструктора — то, что редактирует
 * экран «Автоматизация». `platformEnabled` — флаг деплоя: при false
 * переключатели организации ничего не меняют.
 */
export interface NotificationSwitches {
  organizationId: number;
  enabled: boolean;
  platformEnabled: boolean;
  branches: BranchSwitch[];
}

export interface BranchSwitchInput {
  id: number;
  enabled: boolean;
}

/** PUT /switches/: филиалы, которых нет в списке, остаются как были. */
export interface NotificationSwitchesInput {
  enabled: boolean;
  branches: BranchSwitchInput[];
  organizationId?: number;
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

export function getNotificationSwitches(
  params: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationSwitches> {
  const q = new URLSearchParams();
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<NotificationSwitches>(
    `/notifications/switches/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function saveNotificationSwitches(
  input: NotificationSwitchesInput,
  signal?: AbortSignal,
): Promise<NotificationSwitches> {
  return apiRequest<NotificationSwitches>("/notifications/switches/", {
    method: "PUT",
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
