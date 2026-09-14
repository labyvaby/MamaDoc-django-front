import { apiRequest } from "../../api/client";

export type ClientSectionKey = "identity" | "company" | "finance" | "note";
export type ClientTabKey = "purchases" | "contacts";

export type ClientLayoutSettings = {
  sections: Record<ClientSectionKey, boolean>;
  tabs: ClientTabKey[];
};

export const defaultClientLayoutSettings: ClientLayoutSettings = {
  sections: {
    identity: true,
    company: true,
    finance: true,
    note: true,
  },
    tabs: ["purchases", "contacts"],
};

export function normalizeClientLayoutSettings(value: unknown): ClientLayoutSettings {
  if (!value || typeof value !== "object") return defaultClientLayoutSettings;
  const raw = value as { sections?: unknown; tabs?: unknown };
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs
        .map((tab) => (tab === "history" ? "purchases" : tab))
        .filter((tab): tab is ClientTabKey => tab === "purchases" || tab === "contacts")
    : [...defaultClientLayoutSettings.tabs];
  return {
    sections: {
      ...defaultClientLayoutSettings.sections,
      ...(raw.sections && typeof raw.sections === "object" ? raw.sections : {}),
    },
    tabs,
  };
}

const clientLayoutPath = (organizationId: number) =>
  `/v2/person-form/client-layout/?organizationId=${organizationId}`;

export function getClientLayoutSettings(organizationId: number, signal?: AbortSignal) {
  return apiRequest<ClientLayoutSettings>(clientLayoutPath(organizationId), {
    signal,
    headers: { "X-Organization-Id": String(organizationId) },
  }).then(normalizeClientLayoutSettings);
}

export function updateClientLayoutSettings(
  organizationId: number,
  value: ClientLayoutSettings,
) {
  return apiRequest<ClientLayoutSettings>(clientLayoutPath(organizationId), {
    method: "PATCH",
    headers: { "X-Organization-Id": String(organizationId) },
    body: value,
  }).then(normalizeClientLayoutSettings);
}
