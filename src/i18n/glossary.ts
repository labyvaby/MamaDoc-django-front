import clinicGlossary from "../locales/glossary/clinic.json";
import beautyGlossary from "../locales/glossary/beauty.json";
import { DEFAULT_VERTICAL, type Glossary, type Vertical } from "./types";

/**
 * Реестр терминологических профилей.
 * Ключ — код вертикали, который бэкенд отдаёт в activeOrganization.vertical.
 */
const PROFILES: Record<Vertical, Glossary> = {
  clinic: clinicGlossary as Glossary,
  beauty: beautyGlossary as Glossary,
};

/** Список поддерживаемых вертикалей — для настроек и валидации. */
export const SUPPORTED_VERTICALS = Object.keys(PROFILES) as Vertical[];

/** Человекочитаемые названия вертикалей (для UI настроек). */
export const VERTICAL_LABELS: Record<Vertical, string> = {
  clinic: "Медицинская клиника",
  beauty: "Салон красоты",
};

/** Проверка, что строка с бэкенда — известная нам вертикаль. */
export const isVertical = (value: unknown): value is Vertical =>
  typeof value === "string" && (SUPPORTED_VERTICALS as string[]).includes(value);

/**
 * Глоссарий для вертикали. Неизвестная вертикаль (бэкенд завёл новый тип
 * раньше фронта) молча откатывается на клинику, чтобы UI не сломался.
 */
export const getGlossary = (vertical: Vertical | null | undefined): Glossary =>
  PROFILES[vertical ?? DEFAULT_VERTICAL] ?? PROFILES[DEFAULT_VERTICAL];

/**
 * Текущий глоссарий как модульный синглтон — для кода вне React
 * (api/*, утилиты, форматтеры), где хук useT() недоступен.
 * В компонентах используйте useT(), он реактивен к смене организации.
 */
let currentGlossary: Glossary = PROFILES[DEFAULT_VERTICAL];

export const setCurrentGlossary = (vertical: Vertical | null | undefined): void => {
  currentGlossary = getGlossary(vertical);
};

export const getCurrentGlossary = (): Glossary => currentGlossary;
