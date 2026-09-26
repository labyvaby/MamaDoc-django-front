import { apiRequest } from "./client";

/** Подключение и состояние синхронизации; токены сервер наружу не отдаёт. */
export type AltegioSettings = {
  organizationId: number;
  isEnabled: boolean;
  isConnected: boolean;
  login: string;
  fallbackServiceId: number | null;
  syncFrom: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string;
  waitingStaffCount: number;
  divergedCount: number;
};

type OrgOptions = { organizationId?: number | null };

export type AltegioSettingsPatch = OrgOptions & {
  isEnabled?: boolean;
  fallbackServiceId?: number;
  clearFallbackService?: boolean;
};

export type AltegioConnectInput = OrgOptions & {
  partnerToken: string;
  login: string;
  password: string;
};

export type AltegioLocation = {
  altegioLocationId: number;
  title: string;
  branchId: number | null;
};

export type AltegioStaff = {
  altegioStaffId: number;
  name: string;
  specialization: string;
  employeeId: number | null;
  defaultServiceId: number | null;
};

export type AltegioService = {
  altegioServiceId: number;
  title: string;
  serviceId: number | null;
};

export type AltegioJournalState = "waiting_staff" | "diverged";

export type AltegioJournalItem = {
  recordId: number;
  altegioLocationId: number;
  state: string;
  startsAt: string | null;
  staffName: string;
  clientName: string;
  note: string;
  appointmentId: number | null;
  updatedAt: string;
};

export type AltegioList<T> = { organizationId: number; items: T[] };

function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getAltegioSettings(signal?: AbortSignal, options?: OrgOptions): Promise<AltegioSettings> {
  return apiRequest<AltegioSettings>(
    withQuery("/altegio/settings/", { organizationId: options?.organizationId }),
    { signal },
  );
}

export function updateAltegioSettings(patch: AltegioSettingsPatch): Promise<AltegioSettings> {
  return apiRequest<AltegioSettings>("/altegio/settings/", { method: "PATCH", body: patch });
}

export function connectAltegio(input: AltegioConnectInput): Promise<AltegioSettings> {
  return apiRequest<AltegioSettings>("/altegio/connect/", { method: "POST", body: input });
}

export function disconnectAltegio(options?: OrgOptions): Promise<AltegioSettings> {
  return apiRequest<AltegioSettings>("/altegio/disconnect/", {
    method: "POST",
    body: { organizationId: options?.organizationId ?? null },
  });
}

export function getAltegioLocations(
  signal?: AbortSignal,
  options?: OrgOptions,
): Promise<AltegioList<AltegioLocation>> {
  return apiRequest<AltegioList<AltegioLocation>>(
    withQuery("/altegio/locations/", { organizationId: options?.organizationId }),
    { signal },
  );
}

export function linkAltegioLocation(input: AltegioLocation & OrgOptions): Promise<AltegioLocation> {
  return apiRequest<AltegioLocation>("/altegio/locations/", { method: "POST", body: input });
}

export function getAltegioStaff(
  altegioLocationId: number,
  signal?: AbortSignal,
  options?: OrgOptions,
): Promise<AltegioList<AltegioStaff>> {
  return apiRequest<AltegioList<AltegioStaff>>(
    withQuery("/altegio/staff/", { altegioLocationId, organizationId: options?.organizationId }),
    { signal },
  );
}

export function linkAltegioStaff(
  input: OrgOptions & Omit<AltegioStaff, "specialization">,
): Promise<AltegioStaff> {
  return apiRequest<AltegioStaff>("/altegio/staff/", { method: "POST", body: input });
}

export function getAltegioServices(
  altegioLocationId: number,
  signal?: AbortSignal,
  options?: OrgOptions,
): Promise<AltegioList<AltegioService>> {
  return apiRequest<AltegioList<AltegioService>>(
    withQuery("/altegio/services/", { altegioLocationId, organizationId: options?.organizationId }),
    { signal },
  );
}

export function linkAltegioService(input: AltegioService & OrgOptions): Promise<AltegioService> {
  return apiRequest<AltegioService>("/altegio/services/", { method: "POST", body: input });
}

export function getAltegioJournal(
  signal?: AbortSignal,
  options?: OrgOptions & { state?: AltegioJournalState },
): Promise<AltegioList<AltegioJournalItem>> {
  return apiRequest<AltegioList<AltegioJournalItem>>(
    withQuery("/altegio/journal/", {
      organizationId: options?.organizationId,
      state: options?.state,
    }),
    { signal },
  );
}

/** Слова ФИО или названия: без регистра и разницы «ё/е», однобуквенные не в счёт. */
function words(name: string): Set<string> {
  return new Set(
    name
      .toLocaleLowerCase("ru")
      .replace(/ё/g, "е")
      .split(/\s+/)
      .filter((word) => word.length > 1),
  );
}

/**
 * Подсказка для связки: кандидат с наибольшим числом общих слов с названием
 * из Altegio. Только предлагает — связывает всё равно человек.
 */
export function suggestByName<T>(
  name: string,
  candidates: readonly T[],
  nameOf: (candidate: T) => string,
): T | null {
  const wanted = words(name);
  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    let score = 0;
    for (const word of words(nameOf(candidate))) {
      if (wanted.has(word)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
