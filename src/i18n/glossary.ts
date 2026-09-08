import clinicGlossary from "../locales/glossary/clinic.json";
import beautyGlossary from "../locales/glossary/beauty.json";
import {
  applyGlossaryOverrides,
  type GlossaryOverrides,
} from "./glossaryOverrides";
import { DEFAULT_VERTICAL, type Glossary, type TermForms, type Vertical } from "./types";

const retailTerm = (
  gender: TermForms["gender"],
  nom: string,
  gen: string,
  dat: string,
  acc: string,
  ins: string,
  pre: string,
  nomPl: string,
  genPl: string,
  datPl: string,
  accPl: string,
  insPl: string,
  prePl: string
): TermForms => ({ gender, nom, gen, dat, acc, ins, pre, nomPl, genPl, datPl, accPl, insPl, prePl });

const retailGlossary: Glossary = {
  ...(beautyGlossary as Glossary),
  specialist: retailTerm("m", "продавец", "продавца", "продавцу", "продавца", "продавцом", "продавце", "продавцы", "продавцов", "продавцам", "продавцов", "продавцами", "продавцах"),
  assistant: retailTerm("m", "кассир", "кассира", "кассиру", "кассира", "кассиром", "кассире", "кассиры", "кассиров", "кассирам", "кассиров", "кассирами", "кассирах"),
  org: retailTerm("m", "магазин", "магазина", "магазину", "магазин", "магазином", "магазине", "магазины", "магазинов", "магазинам", "магазины", "магазинами", "магазинах"),
  room: retailTerm("m", "торговый зал", "торгового зала", "торговому залу", "торговый зал", "торговым залом", "торговом зале", "торговые залы", "торговых залов", "торговым залам", "торговые залы", "торговыми залами", "торговых залах"),
};

/**
 * Реестр терминологических профилей.
 * Ключ — код вертикали, который бэкенд отдаёт в activeOrganization.vertical.
 */
const PROFILES: Record<Vertical, Glossary> = {
  clinic: clinicGlossary as Glossary,
  beauty: beautyGlossary as Glossary,
  retail: retailGlossary,
};

/** Список поддерживаемых вертикалей — для настроек и валидации. */
export const SUPPORTED_VERTICALS = Object.keys(PROFILES) as Vertical[];

/** Человекочитаемые названия вертикалей (для UI настроек). */
export const VERTICAL_LABELS: Record<Vertical, string> = {
  clinic: "Медицинская клиника",
  beauty: "Салон красоты",
  retail: "Магазин / ритейл",
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
 * Глоссарий вертикали с терминологией организации поверх него — то, что
 * реально видит пользователь. Оверрайды приходят из themeConfig организации
 * (см. glossaryOverrides.ts) и могут отсутствовать: тогда это чистый профиль.
 */
export const resolveGlossary = (
  vertical: Vertical | null | undefined,
  overrides?: GlossaryOverrides | null,
): Glossary => applyGlossaryOverrides(getGlossary(vertical), overrides);

/**
 * Текущий глоссарий как модульный синглтон — для кода вне React
 * (api/*, утилиты, форматтеры), где хук useT() недоступен.
 * В компонентах используйте useT(), он реактивен к смене организации.
 */
let currentGlossary: Glossary = PROFILES[DEFAULT_VERTICAL];

export const setCurrentGlossary = (
  vertical: Vertical | null | undefined,
  overrides?: GlossaryOverrides | null,
): void => {
  currentGlossary = resolveGlossary(vertical, overrides);
};

export const getCurrentGlossary = (): Glossary => currentGlossary;
