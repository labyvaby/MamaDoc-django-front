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
  enabled: boolean;
  variables: string[];
  rules: NotificationRule[];
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
  rules: NotificationRuleInput[];
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
  params: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationSettings> {
  const q = new URLSearchParams();
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
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

export function getNotificationHistory(
  params: { page?: number; pageSize?: number; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationHistory> {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.pageSize != null) q.set("pageSize", String(params.pageSize));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<NotificationHistory>(
    `/notifications/history/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
