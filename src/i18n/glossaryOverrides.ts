/**
 * Терминология конкретной организации — оверрайды поверх профиля вертикали.
 *
 * Готовых профилей всего два (клиника, салон), а бизнесов больше: ветклиника
 * говорит «питомец», учебный центр — «ученик» и «занятие». Вместо того чтобы
 * плодить профили в коде под каждую организацию, конструктор терминологии
 * даёт заменить отдельные термины и хранит результат у самой организации.
 *
 * Хранение — `organization.themeConfig.glossary` (тем же приёмом, что
 * `themeConfig.landing` у генератора сайта): поле уже приходит в /auth/me/,
 * поэтому оверрайды доезжают до фронта без отдельного запроса и без тикета
 * бэкенду. Обратная сторона — writer'ы themeConfig обязаны мержить, а не
 * перезаписывать объект целиком (см. buildGlossaryThemeConfig).
 *
 * Данные считаются недоверенными: организация могла сохранить их старой
 * версией фронта, а поле themeConfig на бэке — свободный JSON. Поэтому всё,
 * что не проходит валидацию, молча отбрасывается, а не роняет интерфейс.
 */
import {
  FORM_KEYS,
  TERM_KEYS,
  type Gender,
  type Glossary,
  type TermForms,
  type TermKey,
} from "./types";

/** Ключ внутри themeConfig, под которым живёт терминология организации. */
export const GLOSSARY_CONFIG_KEY = "glossary";

/** Термины, переопределённые организацией. Остальные берутся из профиля. */
export type GlossaryOverrides = Partial<Record<TermKey, TermForms>>;

const GENDERS: Gender[] = ["m", "f", "n"];

const isTermKey = (value: string): value is TermKey =>
  (TERM_KEYS as readonly string[]).includes(value);

/**
 * Термин принимается только целиком: 12 непустых словоформ и род. Половинчатая
 * запись хуже отсутствующей — на месте недостающей формы в интерфейсе окажется
 * пустая строка («Карточка » вместо «Карточка пациента»).
 */
export const isValidTermForms = (value: unknown): value is TermForms => {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  if (!GENDERS.includes(raw.gender as Gender)) return false;
  return FORM_KEYS.every(
    (key) => typeof raw[key] === "string" && (raw[key] as string).trim() !== "",
  );
};

/** Оставляет только известные ключи и валидные формы, обрезая пробелы. */
export const sanitizeGlossaryOverrides = (value: unknown): GlossaryOverrides => {
  if (!value || typeof value !== "object") return {};
  const result: GlossaryOverrides = {};
  for (const [key, term] of Object.entries(value as Record<string, unknown>)) {
    if (!isTermKey(key) || !isValidTermForms(term)) continue;
    const trimmed = { gender: term.gender } as TermForms;
    for (const formKey of FORM_KEYS) trimmed[formKey] = term[formKey].trim();
    result[key] = trimmed;
  }
  return result;
};

/** Достаёт терминологию организации из её themeConfig. */
export const readGlossaryOverrides = (
  themeConfig: Record<string, unknown> | null | undefined,
): GlossaryOverrides =>
  sanitizeGlossaryOverrides(themeConfig?.[GLOSSARY_CONFIG_KEY]);

/** Профиль вертикали плюс термины организации поверх него. */
export const applyGlossaryOverrides = (
  base: Glossary,
  overrides: GlossaryOverrides | null | undefined,
): Glossary => {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
};

/** Термины, отличающиеся от профиля — для чипа «изменено» в конструкторе. */
export const changedTermKeys = (
  base: Glossary,
  overrides: GlossaryOverrides | null | undefined,
): TermKey[] => {
  if (!overrides) return [];
  return TERM_KEYS.filter((key) => {
    const term = overrides[key];
    if (!term) return false;
    const original = base[key];
    return (
      term.gender !== original.gender ||
      FORM_KEYS.some((formKey) => term[formKey] !== original[formKey])
    );
  });
};

/**
 * Патч themeConfig для PATCH /organization/<id>/.
 *
 * Бэкенд принимает themeConfig целиком, а в нём же лежат палитра CRM и
 * настройки лендинга — поэтому патч всегда строится поверх текущего значения,
 * иначе сохранение терминологии сотрёт тему организации.
 */
export const buildGlossaryThemeConfig = (
  themeConfig: Record<string, unknown> | null | undefined,
  overrides: GlossaryOverrides,
): Record<string, unknown> => {
  const next = { ...(themeConfig ?? {}) };
  if (Object.keys(overrides).length === 0) {
    delete next[GLOSSARY_CONFIG_KEY];
    return next;
  }
  next[GLOSSARY_CONFIG_KEY] = overrides;
  return next;
};
