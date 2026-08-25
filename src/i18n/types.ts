/**
 * Типы терминологического слоя (глоссария).
 *
 * Глоссарий — это НЕ перевод на другой язык, а параметризация терминологии
 * под вертикаль бизнеса: одна и та же CRM для клиники говорит «пациент»,
 * для салона красоты — «клиент». Язык интерфейса при этом остаётся русским.
 *
 * Русский язык склоняется, поэтому термин хранится не строкой, а набором
 * словоформ: 6 падежей × 2 числа. Плоская подмена «пациент» → «клиент»
 * ломает фразы вида «Карта пациента» → «Карта клиент».
 */

/** Код вертикали бизнеса. Приходит с бэкенда в activeOrganization.vertical. */
export type Vertical = "clinic" | "beauty";

/** Вертикаль по умолчанию, когда бэкенд поле не прислал. */
export const DEFAULT_VERTICAL: Vertical = "clinic";

/** Грамматический род термина — нужен для согласования (см. formatters.ts). */
export type Gender = "m" | "f" | "n";

/** Падежные формы одного термина. */
export type TermForms = {
  gender: Gender;
  /** Именительный: «пациент» — кто? что? */
  nom: string;
  /** Родительный: «пациента» — кого? чего? */
  gen: string;
  /** Дательный: «пациенту» — кому? чему? */
  dat: string;
  /** Винительный: «пациента» — кого? что? */
  acc: string;
  /** Творительный: «пациентом» — кем? чем? */
  ins: string;
  /** Предложный: «пациенте» — о ком? о чём? */
  pre: string;
  /** Множественное число, те же падежи. */
  nomPl: string;
  genPl: string;
  datPl: string;
  accPl: string;
  insPl: string;
  prePl: string;
};

/**
 * Ключи глоссария. Добавляя термин, добавьте его во ВСЕ файлы
 * src/locales/glossary/*.json — иначе строка отрендерится как «{{term.nom}}».
 * Полноту профилей стережёт тест-скрипт `npm run i18n:check`.
 */
export const TERM_KEYS = [
  "patient",
  "visit",
  "specialist",
  "assistant",
  "org",
  "branch",
  "room",
  "card",
  "conclusion",
  "diagnosis",
  "procedure",
  "service",
  "record",
  "complaint",
  "anamnesis",
  "vaccine",
  "employee",
  "shift",
] as const;

export type TermKey = (typeof TERM_KEYS)[number];

/** Словоформы термина без грамматического рода — 6 падежей × 2 числа. */
export const FORM_KEYS = [
  "nom",
  "gen",
  "dat",
  "acc",
  "ins",
  "pre",
  "nomPl",
  "genPl",
  "datPl",
  "accPl",
  "insPl",
  "prePl",
] as const;

export type FormKey = (typeof FORM_KEYS)[number];

export type Glossary = Record<TermKey, TermForms>;
