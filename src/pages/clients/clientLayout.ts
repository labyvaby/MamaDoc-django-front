import { apiRequest } from "../../api/client";

export type ClientSectionKey = "identity" | "company" | "finance" | "note";

export type ClientLayoutSettings = {
  sections: Record<ClientSectionKey, boolean>;
};

export const defaultClientLayoutSettings: ClientLayoutSettings = {
  sections: {
    identity: true,
    company: true,
    finance: true,
    note: true,
  },
};

export function normalizeClientLayoutSettings(value: unknown): ClientLayoutSettings {
  if (!value || typeof value !== "object") return defaultClientLayoutSettings;
  const raw = value as { sections?: unknown };
  return {
    sections: {
      ...defaultClientLayoutSettings.sections,
      ...(raw.sections && typeof raw.sections === "object" ? raw.sections : {}),
    },
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
    // Older servers still require the retired tabs field. Newer servers
    // ignore it, so this keeps the shared card-section settings writable
    // throughout the rollout.
    body: { ...value, tabs: ["purchases"] },
  }).then(normalizeClientLayoutSettings);
}
