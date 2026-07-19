/**
 * Подсказки адресов при вводе на данных OpenStreetMap.
 *
 * Используется Geoapify (бесплатный тариф) или явно настроенный Nominatim-совместимый геокодер. Для КР/русского
 * accept-language=ru локализует названия в русский, а countrycodes отсекает
 * зарубежный мусор.
 *
 * Публичный nominatim.openstreetmap.org здесь намеренно НЕ используется: его
 * policy запрещает клиентский autocomplete. Если URL не задан или указывает на
 * публичный сервер, подсказки отключены и поле остаётся обычным ручным вводом.
 *
 * Настройка через env:
 *   VITE_GEOAPIFY_API_KEY — ключ Geoapify (3000 запросов/день бесплатно;
 *                           ограничьте ключ по origin в кабинете Geoapify)
 *   VITE_OSM_NOMINATIM_URL — базовый URL собственного сервиса (обязателен для
 *                            включения подсказок)
 *   VITE_OSM_COUNTRYCODES  — ISO-коды стран через запятую, по умолч. "kg"
 *                            (пусто = без ограничения по стране)
 *   VITE_OSM_LANG          — язык подписей, по умолч. "ru"
 *   VITE_OSM_VIEWBOX       — "lonMin,latMin,lonMax,latMax" мягкий приоритет
 *                            области (напр. Бишкек)
 *   VITE_OSM_EMAIL         — контактный email (вежливость к Nominatim при
 *                            заметной нагрузке)
 *
 * Док: https://nominatim.org/release-docs/latest/api/Search/
 */

const NOMINATIM_URL =
  (import.meta.env.VITE_OSM_NOMINATIM_URL as string | undefined)?.trim().replace(/\/+$/, "") ||
  "";
const COUNTRYCODES =
  import.meta.env.VITE_OSM_COUNTRYCODES !== undefined
    ? (import.meta.env.VITE_OSM_COUNTRYCODES as string)
    : "kg";
const OSM_LANG = (import.meta.env.VITE_OSM_LANG as string | undefined) || "ru";
const OSM_VIEWBOX = (import.meta.env.VITE_OSM_VIEWBOX as string | undefined) || "";
const OSM_EMAIL = (import.meta.env.VITE_OSM_EMAIL as string | undefined) || "";
const GEOAPIFY_API_KEY =
  (import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined)?.trim() || "";
const GEOAPIFY_URL = "https://api.geoapify.com/v1/geocode/autocomplete";

const PUBLIC_NOMINATIM_HOSTS = new Set([
  "nominatim.openstreetmap.org",
  "www.nominatim.openstreetmap.org",
]);

function isPublicNominatimUrl(value: string): boolean {
  if (!value) return false;
  try {
    return PUBLIC_NOMINATIM_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const NOMINATIM_ENABLED = NOMINATIM_URL.length > 0 && !isPublicNominatimUrl(NOMINATIM_URL);
const ADDRESS_SUGGEST_ENABLED = Boolean(GEOAPIFY_API_KEY) || NOMINATIM_ENABLED;

/** После 429 не отправляем новые запросы до Retry-After (или 30 секунд). */
let rateLimitedUntil = 0;

/** Небольшой session-cache не повторяет одинаковые поиски при открытии формы. */
const suggestionCache = new Map<string, AddressSuggestion[]>();
const MAX_CACHE_ENTRIES = 100;

/** Минимальная длина запроса, при которой имеет смысл дёргать API. */
export const ADDRESS_SUGGEST_MIN_LEN = 3;

export interface AddressSuggestion {
  /** Готовая строка адреса — её показываем и сохраняем в поле пациента. */
  value: string;
  /** Короткая подпись (улица/дом) для первой строки варианта. */
  title: string;
  /** Уточнение (район/город/область) для второй строки, если отличается. */
  subtitle?: string;
  /** Тип объекта OSM: highway | place | building | ... */
  type?: string;
}

/** Подсказки включены только для явно настроенного непубличного сервиса. */
export function isAddressSuggestEnabled(): boolean {
  return ADDRESS_SUGGEST_ENABLED;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  house_number?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
}

interface NominatimItem {
  display_name?: string;
  name?: string;
  type?: string;
  class?: string;
  address?: NominatimAddress;
}

interface GeoapifyProperties {
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  district?: string;
  state?: string;
  country?: string;
  result_type?: string;
}

interface GeoapifyResponse {
  results?: GeoapifyProperties[];
  features?: Array<{ properties?: GeoapifyProperties }>;
}

/** Убирает пустые и повторяющиеся части адреса, сохраняя порядок. */
function dedupe(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

function toSuggestion(it: NominatimItem): AddressSuggestion | null {
  const a = it.address ?? {};
  const road = a.road || a.pedestrian || a.footway || "";
  const streetLine = road
    ? a.house_number
      ? `${road}, ${a.house_number}`
      : road
    : it.name || "";
  const locality = a.city || a.town || a.village || a.municipality || "";
  const district =
    a.suburb || a.city_district || a.district || a.quarter || a.neighbourhood || "";
  const region = a.state || a.region || "";

  const contextParts = dedupe([district, locality, region].filter(Boolean));
  const parts = dedupe([streetLine, ...contextParts].filter(Boolean));
  const value = parts.join(", ") || it.display_name || "";
  if (!value) return null;

  const title = streetLine || locality || it.name || value;
  const context = contextParts.join(", ");
  const subtitle =
    streetLine && context ? context : value !== title ? value : undefined;
  return { value, title, subtitle, type: it.type || it.class };
}

function toGeoapifySuggestion(it: GeoapifyProperties): AddressSuggestion | null {
  const street = it.street || "";
  const streetLine = street
    ? it.housenumber
      ? `${street}, ${it.housenumber}`
      : street
    : it.address_line1 || it.name || "";
  const locality = it.city || it.town || it.village || "";
  const context = dedupe([it.suburb || "", it.district || "", locality, it.state || ""]);
  const value = it.formatted || dedupe([streetLine, ...context]).join(", ");
  if (!value) return null;
  const title = streetLine || locality || value;
  const subtitle = title !== value ? value : undefined;
  return { value, title, subtitle, type: it.result_type };
}

/**
 * Запрашивает подсказки адресов по строке ввода.
 * Бросает AbortError при отмене; любые другие сбои (сеть, CORS, не-200)
 * гасятся в пустой список, чтобы поле оставалось работоспособным.
 */
export async function suggestAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (!ADDRESS_SUGGEST_ENABLED || q.length < ADDRESS_SUGGEST_MIN_LEN) return [];

  const cacheKey = q.toLocaleLowerCase(OSM_LANG);
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;
  if (Date.now() < rateLimitedUntil) return [];

  const useGeoapify = Boolean(GEOAPIFY_API_KEY);
  const params = useGeoapify
    ? new URLSearchParams({
        text: q,
        format: "json",
        limit: "8",
        lang: OSM_LANG,
        apiKey: GEOAPIFY_API_KEY,
      })
    : new URLSearchParams({
        q,
        format: "jsonv2",
        addressdetails: "1",
        limit: "8",
        "accept-language": OSM_LANG,
      });
  if (COUNTRYCODES) params.set(useGeoapify ? "filter" : "countrycodes", useGeoapify ? `countrycode:${COUNTRYCODES.split(",")[0].trim()}` : COUNTRYCODES);
  if (!useGeoapify && OSM_VIEWBOX) params.set("viewbox", OSM_VIEWBOX);
  if (!useGeoapify && OSM_EMAIL) params.set("email", OSM_EMAIL);

  let res: Response;
  try {
    res = await fetch(`${useGeoapify ? GEOAPIFY_URL : `${NOMINATIM_URL}/search`}?${params.toString()}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return []; // сеть/CORS — тихо деградируем до ручного ввода
  }
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get("Retry-After") || "", 10);
    rateLimitedUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : 30_000);
    return [];
  }
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as NominatimItem[] | GeoapifyResponse | null;
  const items = useGeoapify
    ? (Array.isArray(data) ? [] : data?.results || data?.features?.map((feature) => feature.properties || {}) || [])
    : Array.isArray(data) ? data : [];

  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const it of items) {
    const s = useGeoapify
      ? toGeoapifySuggestion(it as GeoapifyProperties)
      : toSuggestion(it as NominatimItem);
    if (!s || seen.has(s.value)) continue;
    seen.add(s.value);
    out.push(s);
  }
  if (suggestionCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = suggestionCache.keys().next().value;
    if (oldestKey !== undefined) suggestionCache.delete(oldestKey);
  }
  suggestionCache.set(cacheKey, out);
  return out;
}
