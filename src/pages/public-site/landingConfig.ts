/**
 * Оформление лендинга `/site` — то, чего нет в данных CRM.
 *
 * Лендинг собирается из уже существующих публичных данных (организация,
 * филиалы, услуги, специалисты, отзывы) и работает без единой настройки: пустой
 * конфиг — это рабочий сайт. Здесь живёт только то, что из CRM не вывести:
 * слоган, текст «о нас», часы работы, соцсети, набор и порядок блоков.
 *
 * Значение приходит из двух мест и в обоих случаях это **пользовательский
 * ввод**, а не контракт бэка:
 *   • публичное поле `organization.landing` (владелец сохранил в CRM);
 *   • `sessionStorage` — превью из конструктора настроек, до сохранения.
 * Поэтому любое значение проходит через `parseLandingConfig`: неизвестные поля
 * отбрасываются, строки режутся по длине, ссылки — только http(s). Иначе мусор
 * из чужого `themeConfig` (или опечатка владельца) уронил бы публичную
 * страницу, которую открывают по ссылке из мессенджера.
 */

/**
 * Блоки лендинга в порядке показа. Hero и подвал не отключаются — без них
 * страница перестаёт быть страницей; всё остальное владелец может убрать
 * (например, скрыть цены или отзывы).
 */
export const LANDING_BLOCKS = [
  "about",
  "directions",
  "services",
  "specialists",
  "branches",
  "reviews",
  "cta",
] as const;

export type LandingBlock = (typeof LANDING_BLOCKS)[number];

/** Соцсети и мессенджеры в подвале. Ключ — вид ссылки, значение — как ввели. */
export const LANDING_SOCIALS = [
  "instagram",
  "whatsapp",
  "telegram",
  "facebook",
  "tiktok",
  "youtube",
  "website",
] as const;

export type LandingSocial = (typeof LANDING_SOCIALS)[number];

export interface LandingConfig {
  /** Подзаголовок первого экрана; пусто — берём текст по вертикали. */
  tagline: string;
  /** Абзац «о нас»; пусто — блок не рисуем, даже если он включён. */
  about: string;
  /** Часы работы свободной строкой: «Пн–Сб 08:00–20:00, Вс — выходной». */
  workHours: string;
  /** Акцент кнопок и заголовков (hex); null — цвет витрины записи. */
  accentColor: string | null;
  socials: Record<LandingSocial, string>;
  /** Показывать блок. Ключ отсутствует в сохранённом JSON — блок включён. */
  blocks: Record<LandingBlock, boolean>;
}

/** Ограничения на длину: лендинг — витрина, а не статья. */
const LIMITS: Record<"tagline" | "about" | "workHours" | "social", number> = {
  tagline: 160,
  about: 1200,
  workHours: 120,
  social: 200,
};

const EMPTY_SOCIALS = Object.fromEntries(LANDING_SOCIALS.map((k) => [k, ""])) as Record<
  LandingSocial,
  string
>;

const ALL_BLOCKS_ON = Object.fromEntries(LANDING_BLOCKS.map((k) => [k, true])) as Record<
  LandingBlock,
  boolean
>;

/** Пустой конфиг — сайт целиком из данных CRM. */
export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  tagline: "",
  about: "",
  workHours: "",
  accentColor: null,
  socials: EMPTY_SOCIALS,
  blocks: ALL_BLOCKS_ON,
};

function readString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Цвет принимаем только как hex: он уходит в CSS, подстановки не место. */
function readColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Разбор сохранённого оформления. Принимает что угодно (включая `undefined` и
 * весь `themeConfig` целиком) и всегда возвращает рабочий конфиг.
 */
export function parseLandingConfig(raw: unknown): LandingConfig {
  if (!isRecord(raw)) return DEFAULT_LANDING_CONFIG;

  const socialsRaw = isRecord(raw.socials) ? raw.socials : {};
  const socials = { ...EMPTY_SOCIALS };
  for (const key of LANDING_SOCIALS) {
    socials[key] = readString(socialsRaw[key], LIMITS.social);
  }

  const blocksRaw = isRecord(raw.blocks) ? raw.blocks : {};
  const blocks = { ...ALL_BLOCKS_ON };
  for (const key of LANDING_BLOCKS) {
    // Выключен только явным false: незнакомое значение — это «как было».
    if (blocksRaw[key] === false) blocks[key] = false;
  }

  return {
    tagline: readString(raw.tagline, LIMITS.tagline),
    about: readString(raw.about, LIMITS.about),
    workHours: readString(raw.workHours, LIMITS.workHours),
    accentColor: readColor(raw.accentColor),
    socials,
    blocks,
  };
}

/**
 * Обратная операция для сохранения в CRM: пустые значения не пишем, чтобы в
 * `themeConfig` не накапливались `""` и `blocks` со всеми `true`.
 */
export function serializeLandingConfig(config: LandingConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (config.tagline) out.tagline = config.tagline;
  if (config.about) out.about = config.about;
  if (config.workHours) out.workHours = config.workHours;
  if (config.accentColor) out.accentColor = config.accentColor;

  const socials = Object.fromEntries(
    LANDING_SOCIALS.filter((k) => config.socials[k]).map((k) => [k, config.socials[k]]),
  );
  if (Object.keys(socials).length) out.socials = socials;

  const hidden = Object.fromEntries(
    LANDING_BLOCKS.filter((k) => !config.blocks[k]).map((k) => [k, false]),
  );
  if (Object.keys(hidden).length) out.blocks = hidden;

  return out;
}

// ── Ссылки соцсетей ──────────────────────────────────────────────────────────

const SOCIAL_HOSTS: Record<Exclude<LandingSocial, "whatsapp" | "website">, string> = {
  instagram: "https://instagram.com/",
  telegram: "https://t.me/",
  facebook: "https://facebook.com/",
  tiktok: "https://tiktok.com/@",
  youtube: "https://youtube.com/@",
};

/**
 * Ссылка для иконки в подвале. Владелец вводит как удобно — «@mamadoc»,
 * «mamadoc» или полный адрес, — а в разметку попадает только http(s): иначе
 * строка вида `javascript:…` из настроек стала бы кликабельной на публичной
 * странице.
 */
export function socialHref(kind: LandingSocial, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  if (kind === "whatsapp") {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 9 ? `https://wa.me/${digits}` : null;
  }
  if (kind === "website") {
    // Домен без схемы — самый частый ввод («mamadoc.kg»).
    return /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw) ? `https://${raw}` : null;
  }

  const handle = raw.replace(/^@+/, "");
  return /^[\w.-]+$/.test(handle) ? `${SOCIAL_HOSTS[kind]}${handle}` : null;
}

// ── Превью из конструктора ───────────────────────────────────────────────────

/**
 * Превью правок до сохранения (и до того, как бэк начнёт отдавать `landing`
 * гостю). Живёт в `sessionStorage` осознанно: передавать конфиг через ссылку
 * нельзя — кто угодно собрал бы адрес витрины клиники с подменённым текстом и
 * чужим телефоном. Ключ в sessionStorage может записать только тот, кто уже
 * открыл настройки CRM в этой вкладке.
 */
const PREVIEW_PREFIX = "mamadoc:landingPreview:";

/** Имя query-параметра, включающего режим превью. */
export const LANDING_PREVIEW_PARAM = "preview";

export function writeLandingPreview(orgSlug: string, config: LandingConfig): void {
  try {
    window.sessionStorage.setItem(
      `${PREVIEW_PREFIX}${orgSlug}`,
      JSON.stringify(serializeLandingConfig(config)),
    );
  } catch {
    // Приватный режим или переполненное хранилище: превью не критично.
  }
}

export function readLandingPreview(orgSlug: string): LandingConfig | null {
  try {
    const raw = window.sessionStorage.getItem(`${PREVIEW_PREFIX}${orgSlug}`);
    return raw ? parseLandingConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
