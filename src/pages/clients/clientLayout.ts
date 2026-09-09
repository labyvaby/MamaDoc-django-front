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

const storageKey = (organizationId: number) => `mamadoc:clients:layout:${organizationId}`;

export function readClientLayoutSettings(organizationId: number | null): ClientLayoutSettings {
  if (!organizationId || typeof window === "undefined") return defaultClientLayoutSettings;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(organizationId)) ?? "null") as (Partial<ClientLayoutSettings> & { tabs?: string[] }) | null;
    const savedTabs: string[] = Array.isArray(parsed?.tabs) ? parsed.tabs : [...defaultClientLayoutSettings.tabs];
    return {
      sections: { ...defaultClientLayoutSettings.sections, ...(parsed?.sections ?? {}) },
      tabs: savedTabs.map((tab) => tab === "history" ? "purchases" : tab).filter(
        (tab): tab is ClientTabKey => tab === "purchases" || tab === "contacts",
      ),
    };
  } catch {
    return defaultClientLayoutSettings;
  }
}

export function writeClientLayoutSettings(organizationId: number | null, value: ClientLayoutSettings): void {
  if (!organizationId || typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(organizationId), JSON.stringify(value));
}
