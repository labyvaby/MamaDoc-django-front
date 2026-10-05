/** Only public clinic catalogues belong here; calendars/slots/bookings stay live. */
const CATALOG_TTL_MS = 5 * 60_000;

export function createCatalogCache(ttlMs = CATALOG_TTL_MS) {
  const entries = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();
  return function load<T>(key: string, fetchValue: () => Promise<T>): Promise<T> {
    const cached = entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise as Promise<T>;
    const entry = { promise: Promise.resolve() as Promise<unknown>, expiresAt: Infinity };
    entry.promise = Promise.resolve().then(fetchValue).then(
      (value) => { entry.expiresAt = Date.now() + ttlMs; return value; },
      (error) => { if (entries.get(key) === entry) entries.delete(key); throw error; },
    );
    entries.set(key, entry);
    return entry.promise as Promise<T>;
  };
}

export const loadCatalog = createCatalogCache();
