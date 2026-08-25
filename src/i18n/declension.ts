/**
 * Автосклонение русских существительных — движок конструктора терминологии.
 *
 * Термин глоссария хранится в 12 словоформах (6 падежей × 2 числа). Заставлять
 * владельца организации заполнять 12 полей на каждый из 18 терминов — верный
 * способ получить пустой или кривой профиль, поэтому формы выводятся из
 * именительного падежа по правилам школьной морфологии, а UI показывает
 * результат и даёт поправить любую форму руками.
 *
 * Движок сознательно неполный: чередования в корне («сестра» → «сестёр»),
 * нестандартное множественное («мастер» → «мастера»), ударение (оно решает
 * «врачом» против «товарищем») по одному написанию слова не восстанавливаются.
 * Такие случаи помечаются `warnings`, а не угадываются молча — предупреждение
 * в интерфейсе честнее, чем уверенно неправильная форма.
 *
 * Одушевлённость (винительный: «добавить пациента», но «добавить приём») из
 * написания не выводится вообще — она приходит параметром: конструктор берёт
 * её у заменяемого термина базового профиля.
 */
import type { Gender, TermForms } from "./types";

/** Гласные — нужны для поиска кластеров согласных и беглых гласных. */
const VOWELS = "аеёиоуыэюя";
/** Шипящие: после них «и» вместо «ы», «ей» в родительном множественного. */
const HUSHING = "жчшщ";
/** Заднеязычные: после них тоже «и» вместо «ы» (клиники, услуги). */
const VELAR = "гкх";

const isVowel = (ch: string): boolean => VOWELS.includes(ch);
const isConsonant = (ch: string): boolean =>
  !!ch && !isVowel(ch) && ch !== "ь" && ch !== "й";
const endsWith = (word: string, ...suffixes: string[]): boolean =>
  suffixes.some((s) => word.endsWith(s));

/** Последняя буква основы — от неё зависит выбор «ы/и» и «ов/ей». */
const lastOf = (stem: string): string => stem.slice(-1);

export type DeclensionOptions = {
  /** Род. По умолчанию определяется по окончанию (см. guessGender). */
  gender?: Gender;
  /** Одушевлённость — решает винительный падеж. По умолчанию неодушевлённое. */
  animate?: boolean;
};

/** Коды предупреждений; тексты — в locales/ru/settings.json. */
export type DeclensionWarning =
  | "hushing" // шипящая/ц в основе: ударение решает «-ом/-ем», мы его не знаем
  | "cluster" // кластер согласных: возможна беглая гласная («сестра» → «сестёр»)
  | "yo" // «ё» в основе: возможно чередование по формам
  | "indeclinable" // похоже на несклоняемое («такси», «пальто»)
  | "phrase" // словосочетание: согласование прилагательного проверяем глазами
  | "pluralA" // у части слов на -ор/-ер множественное на -а («директора»)
  | "short"; // слишком короткое слово, эвристики ненадёжны

export type DeclensionResult = {
  forms: TermForms;
  /**
   * Причины, по которым формам нельзя доверять на глаз. Пустой массив —
   * слово укладывается в регулярное склонение.
   */
  warnings: DeclensionWarning[];
};

type CaseKey = "nom" | "gen" | "dat" | "acc" | "ins" | "pre";

const CASES: CaseKey[] = ["nom", "gen", "dat", "acc", "ins", "pre"];

// ── Разбор словосочетания ────────────────────────────────────────────────────
//
// Термин может быть не одним словом: «рабочее место», «медицинская карта».
// Главное слово — последнее, остальные склоняются как прилагательные, если
// похожи на них по окончанию (иначе остаются как есть: «карта пациента»).

const ADJ_ENDINGS = ["ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые", "ие"];

const splitWords = (phrase: string): string[] =>
  phrase.trim().split(/\s+/).filter(Boolean);

const headWord = (phrase: string): string => {
  const words = splitWords(phrase);
  return words[words.length - 1] ?? "";
};

const looksLikeAdjective = (word: string): boolean =>
  word.length > 3 && ADJ_ENDINGS.some((e) => word.toLowerCase().endsWith(e));

/**
 * Род по окончанию именительного падежа.
 * Мужские на -а/-я («папа», «дядя») и женские на -ь без словаря не различить —
 * берём частотный вариант, в конструкторе род переключается вручную.
 */
export const guessGender = (word: string): Gender => {
  const head = headWord(word).toLowerCase();
  if (endsWith(head, "а", "я")) return "f";
  if (endsWith(head, "о", "е", "ё")) return "n";
  if (endsWith(head, "ь")) return "f";
  return "m";
};

// ── Склонение прилагательного ────────────────────────────────────────────────

/** Твёрдый, мягкий и заднеязычный типы: «новый», «рабочий», «маленький». */
type AdjType = "hard" | "soft" | "velar";

const adjType = (stem: string): AdjType => {
  const last = lastOf(stem);
  if (HUSHING.includes(last)) return "soft";
  if (VELAR.includes(last)) return "velar";
  return "hard";
};

const ADJ_TABLE: Record<
  AdjType,
  Record<Gender | "pl", Record<CaseKey, string>>
> = {
  hard: {
    m: { nom: "ый", gen: "ого", dat: "ому", acc: "ый", ins: "ым", pre: "ом" },
    f: { nom: "ая", gen: "ой", dat: "ой", acc: "ую", ins: "ой", pre: "ой" },
    n: { nom: "ое", gen: "ого", dat: "ому", acc: "ое", ins: "ым", pre: "ом" },
    pl: { nom: "ые", gen: "ых", dat: "ым", acc: "ые", ins: "ыми", pre: "ых" },
  },
  // После шипящих: «рабочее место», «рабочего места», «рабочими местами».
  soft: {
    m: { nom: "ий", gen: "его", dat: "ему", acc: "ий", ins: "им", pre: "ем" },
    f: { nom: "ая", gen: "ей", dat: "ей", acc: "ую", ins: "ей", pre: "ей" },
    n: { nom: "ее", gen: "его", dat: "ему", acc: "ее", ins: "им", pre: "ем" },
    pl: { nom: "ие", gen: "их", dat: "им", acc: "ие", ins: "ими", pre: "их" },
  },
  // После г/к/х склонение твёрдое, но по орфографии «ы» переходит в «и»:
  // «маленький / маленьким / маленькими».
  velar: {
    m: { nom: "ий", gen: "ого", dat: "ому", acc: "ий", ins: "им", pre: "ом" },
    f: { nom: "ая", gen: "ой", dat: "ой", acc: "ую", ins: "ой", pre: "ой" },
    n: { nom: "ое", gen: "ого", dat: "ому", acc: "ое", ins: "им", pre: "ом" },
    pl: { nom: "ие", gen: "их", dat: "им", acc: "ие", ins: "ими", pre: "их" },
  },
};

const declineAdjective = (
  word: string,
  gender: Gender,
  plural: boolean,
  caseKey: CaseKey,
  animate: boolean,
): string => {
  const stem = word.slice(0, -2);
  const table = ADJ_TABLE[adjType(stem)];
  const row = plural ? table.pl : table[gender];
  // Ударное окончание «-ой» отличается от «-ый» только в именительном
  // мужского рода: «зубной врач», но «зубного врача», «зубная щётка».
  const stressed = word.toLowerCase().endsWith("ой");
  if (stressed && !plural && gender === "m") {
    if (caseKey === "nom" || (caseKey === "acc" && !animate)) return word;
  }
  // Винительный повторяет родительный у одушевлённых (муж. род и мн. число)
  // и именительный у остальных: «нового врача», но «новый кабинет».
  const effective: CaseKey =
    caseKey === "acc" && animate && (plural || gender === "m") ? "gen" : caseKey;
  return stem + row[effective];
};

// ── Беглая гласная в родительном множественного ──────────────────────────────

/**
 * «карточка» → «карточек», «прививка» → «прививок», «окно» → «окон».
 * Вставляем только в надёжном случае — кластер из двух согласных, вторая из
 * которых «к» или «н». Остальные кластеры («сестра» → «сестёр») отдаём как
 * есть с предупреждением: там чередование в корне, а не просто вставка.
 */
const insertFleetingVowel = (stem: string, soft: boolean): string | null => {
  const a = stem.slice(-2, -1);
  const b = lastOf(stem);
  if (!isConsonant(a) || !isConsonant(b)) return null;
  if (b !== "к" && b !== "н") return null;
  const vowel = soft || HUSHING.includes(a) || a === "й" ? "е" : "о";
  return `${stem.slice(0, -1)}${vowel}${b}`;
};

// ── Склонение существительного ───────────────────────────────────────────────

type NounForms = Record<CaseKey, string> & { pl: Record<CaseKey, string> };

const build = (
  single: Record<CaseKey, string>,
  plural: Record<CaseKey, string>,
): NounForms => ({ ...single, pl: plural });

// ── Словарные исключения ─────────────────────────────────────────────────────
//
// То, что из написания не выводится в принципе. Список намеренно короткий:
// сюда попадают только слова, реально претендующие на роль термина вертикали.
// Всё остальное правится руками в конструкторе.

type IrregularEntry = {
  /** Совпадение по концу слова: «медсестра» ловится правилом «сестра». */
  suffix: string;
  /** Формы единственного числа, перекрывающие регулярные. */
  single?: Partial<Record<CaseKey, (word: string) => string>>;
  /** Формы множественного числа. */
  plural?: Partial<Record<CaseKey, (word: string) => string>>;
};

/** Профессии с множественным на -а: «мастера», «повара», а не «мастеры». */
const PLURAL_A_PROFESSIONS = [
  "мастер",
  "доктор",
  "директор",
  "повар",
  "профессор",
  "сторож",
];

const IRREGULARS: IrregularEntry[] = [
  ...PLURAL_A_PROFESSIONS.map((suffix) => ({
    suffix,
    plural: { nom: (w: string) => `${w}а` },
  })),
  // «учитель» → «учителя», а не «учители».
  { suffix: "учитель", plural: { nom: (w) => `${w.slice(0, -1)}я` } },
  // «сестра» → «сёстры / сестёр»: чередование в корне плюс беглая гласная.
  {
    suffix: "сестра",
    plural: {
      nom: (w) => w.replace(/сестра$/i, "сёстры"),
      gen: (w) => w.replace(/сестра$/i, "сестёр"),
      dat: (w) => w.replace(/сестра$/i, "сёстрам"),
      acc: (w) => w.replace(/сестра$/i, "сестёр"),
      ins: (w) => w.replace(/сестра$/i, "сёстрами"),
      pre: (w) => w.replace(/сестра$/i, "сёстрах"),
    },
  },
];

const findIrregular = (word: string): IrregularEntry | undefined => {
  const lower = word.toLowerCase();
  return IRREGULARS.find((entry) => lower.endsWith(entry.suffix));
};

/**
 * Накладывает словарные формы на регулярные. Винительный множественного
 * пересчитывается после патча: если словарь поменял именительный, «добавить
 * мастеров» должно опираться на новый родительный, а «открыть кабинеты» — на
 * новый именительный.
 */
const applyIrregular = (
  word: string,
  forms: NounForms,
  animate: boolean,
): NounForms => {
  const entry = findIrregular(word);
  if (!entry) return forms;

  const patched: NounForms = {
    ...forms,
    pl: { ...forms.pl },
  };
  for (const caseKey of CASES) {
    const single = entry.single?.[caseKey];
    if (single) patched[caseKey] = single(word);
    const plural = entry.plural?.[caseKey];
    if (plural) patched.pl[caseKey] = plural(word);
  }
  if (entry.plural?.nom && !entry.plural.acc) {
    patched.pl.acc = animate ? patched.pl.gen : patched.pl.nom;
  }
  return patched;
};

const declineNounRegular = (
  word: string,
  gender: Gender,
  animate: boolean,
  warnings: Set<DeclensionWarning>,
): NounForms => {
  const lower = word.toLowerCase();
  const last = lower.slice(-1);

  const withAnimacy = (
    forms: Record<Exclude<CaseKey, "acc">, string>,
    accAnimate: string,
    accInanimate: string,
  ): Record<CaseKey, string> => ({
    ...forms,
    acc: animate ? accAnimate : accInanimate,
  });

  // Существительные на -ия: «история», «процедура» склоняются по-разному,
  // «-ия» — отдельный тип, иначе получится «историы» и «историй» мимо кассы.
  if (lower.endsWith("ия")) {
    const stem = word.slice(0, -2);
    const single = withAnimacy(
      {
        nom: word,
        gen: `${stem}ии`,
        dat: `${stem}ии`,
        ins: `${stem}ией`,
        pre: `${stem}ии`,
      },
      `${stem}ию`,
      `${stem}ию`,
    );
    const plural = withAnimacy(
      {
        nom: `${stem}ии`,
        gen: `${stem}ий`,
        dat: `${stem}иям`,
        ins: `${stem}иями`,
        pre: `${stem}иях`,
      },
      `${stem}ий`,
      `${stem}ии`,
    );
    return build(single, plural);
  }

  // Средний род на -ие/-ье: «заключение», «состояние», «пожелание».
  if (lower.endsWith("ие") || lower.endsWith("ье")) {
    const stem = word.slice(0, -1);
    const base = word.slice(0, -2);
    const ie = lower.endsWith("ие");
    const single = withAnimacy(
      {
        nom: word,
        gen: `${stem}я`,
        dat: `${stem}ю`,
        // «заключением» = «заключен» + «ием»; у слов на -ье мягкий знак
        // остаётся: «здоровьем».
        ins: ie ? `${base}ием` : `${stem}ем`,
        pre: ie ? `${base}ии` : word,
      },
      `${stem}я`,
      word,
    );
    const plural = withAnimacy(
      {
        nom: `${stem}я`,
        gen: `${base}ий`,
        dat: `${stem}ям`,
        ins: `${stem}ями`,
        pre: `${stem}ях`,
      },
      `${base}ий`,
      `${stem}я`,
    );
    return build(single, plural);
  }

  // Женский род на -а/-я: «клиника», «смена», «неделя».
  if (last === "а" || last === "я") {
    const stem = word.slice(0, -1);
    const stemLast = lastOf(stem.toLowerCase());
    const hard = last === "а";
    const genEnding =
      hard && !VELAR.includes(stemLast) && !HUSHING.includes(stemLast)
        ? "ы"
        : "и";
    const insEnding = hard ? "ой" : "ей";
    if (HUSHING.includes(stemLast) || stemLast === "ц") warnings.add("hushing");

    // Родительный множественного — нулевое окончание с возможной беглой:
    // «смен», «карточек», «прививок», «недель».
    const fleeting = insertFleetingVowel(stem, !hard);
    let genPl: string;
    if (hard) {
      genPl = fleeting ?? stem;
      if (
        !fleeting &&
        isConsonant(stemLast) &&
        isConsonant(stem.slice(-2, -1))
      ) {
        warnings.add("cluster");
      }
    } else {
      genPl = isVowel(stemLast) ? `${stem}й` : `${fleeting ?? stem}ь`;
    }

    const accSingle = `${stem}${hard ? "у" : "ю"}`;
    const single = withAnimacy(
      {
        nom: word,
        gen: stem + genEnding,
        dat: `${stem}е`,
        ins: stem + insEnding,
        pre: `${stem}е`,
      },
      accSingle,
      accSingle,
    );
    const nomPl = stem + genEnding;
    const plural = withAnimacy(
      {
        nom: nomPl,
        gen: genPl,
        dat: `${stem}${hard ? "ам" : "ям"}`,
        ins: `${stem}${hard ? "ами" : "ями"}`,
        pre: `${stem}${hard ? "ах" : "ях"}`,
      },
      genPl,
      nomPl,
    );
    return build(single, plural);
  }

  // Средний род на -о/-е: «место», «поле».
  if (last === "о" || last === "е") {
    const stem = word.slice(0, -1);
    const hard = last === "о";
    const fleeting = insertFleetingVowel(stem, !hard);
    const genPl = hard ? (fleeting ?? stem) : `${stem}ей`;
    if (
      hard &&
      !fleeting &&
      isConsonant(lastOf(stem)) &&
      isConsonant(stem.slice(-2, -1))
    ) {
      // «место» → «мест» без вставки — норма, но «окно» → «окон» с ней.
      // Отличить можно только по словарю, поэтому просим проверить глазами.
      warnings.add("cluster");
    }
    const single: Record<CaseKey, string> = {
      nom: word,
      gen: `${stem}${hard ? "а" : "я"}`,
      dat: `${stem}${hard ? "у" : "ю"}`,
      acc: word,
      ins: `${stem}${hard ? "ом" : "ем"}`,
      pre: `${stem}е`,
    };
    const nomPl = `${stem}${hard ? "а" : "я"}`;
    const plural: Record<CaseKey, string> = {
      nom: nomPl,
      gen: genPl,
      dat: `${stem}${hard ? "ам" : "ям"}`,
      acc: animate ? genPl : nomPl,
      ins: `${stem}${hard ? "ами" : "ями"}`,
      pre: `${stem}${hard ? "ах" : "ях"}`,
    };
    return build(single, plural);
  }

  // Мягкий знак: женский род 3-го склонения («запись») или мужской («рубль»).
  if (last === "ь") {
    const stem = word.slice(0, -1);
    if (gender === "f") {
      const single = withAnimacy(
        {
          nom: word,
          gen: `${stem}и`,
          dat: `${stem}и`,
          ins: `${stem}ью`,
          pre: `${stem}и`,
        },
        `${stem}и`,
        word,
      );
      const plural = withAnimacy(
        {
          nom: `${stem}и`,
          gen: `${stem}ей`,
          dat: `${stem}ям`,
          ins: `${stem}ями`,
          pre: `${stem}ях`,
        },
        `${stem}ей`,
        `${stem}и`,
      );
      return build(single, plural);
    }
    const single = withAnimacy(
      {
        nom: word,
        gen: `${stem}я`,
        dat: `${stem}ю`,
        ins: `${stem}ем`,
        pre: `${stem}е`,
      },
      `${stem}я`,
      word,
    );
    const plural = withAnimacy(
      {
        nom: `${stem}и`,
        gen: `${stem}ей`,
        dat: `${stem}ям`,
        ins: `${stem}ями`,
        pre: `${stem}ях`,
      },
      `${stem}ей`,
      `${stem}и`,
    );
    return build(single, plural);
  }

  // Мужской род на -й: «случай», «санаторий».
  if (last === "й") {
    const stem = word.slice(0, -1);
    const iy = lower.endsWith("ий");
    const single = withAnimacy(
      {
        nom: word,
        gen: `${stem}я`,
        dat: `${stem}ю`,
        ins: `${stem}ем`,
        pre: iy ? `${stem}и` : `${stem}е`,
      },
      `${stem}я`,
      word,
    );
    const plural = withAnimacy(
      {
        nom: `${stem}и`,
        gen: `${stem}ев`,
        dat: `${stem}ям`,
        ins: `${stem}ями`,
        pre: `${stem}ях`,
      },
      `${stem}ев`,
      `${stem}и`,
    );
    return build(single, plural);
  }

  // Мужской род на согласную: «пациент», «врач», «приём».
  // Слова на -ец теряют беглую гласную во всех формах, кроме именительного:
  // «питомец» → «питомца», «конец» → «конца».
  const stem = /[бвгджзклмнпрстфхцчшщ]ец$/.test(lower)
    ? `${word.slice(0, -2)}ц`
    : word;
  const stemLast = lastOf(stem.toLowerCase());
  const hushing = HUSHING.includes(stemLast);
  const tsy = stemLast === "ц";
  if (hushing || tsy) warnings.add("hushing");

  const nomPl = `${stem}${VELAR.includes(stemLast) || hushing ? "и" : "ы"}`;
  const genPl = hushing ? `${stem}ей` : tsy ? `${stem}ев` : `${stem}ов`;
  const single = withAnimacy(
    {
      nom: word,
      gen: `${stem}а`,
      dat: `${stem}у`,
      // «врачом» ударное против «товарищем» безударного — ударение из
      // написания не восстановить, берём частотный для терминов вариант.
      ins: `${stem}${tsy ? "ем" : "ом"}`,
      pre: `${stem}е`,
    },
    `${stem}а`,
    word,
  );
  const plural = withAnimacy(
    {
      nom: nomPl,
      gen: genPl,
      dat: `${stem}ам`,
      ins: `${stem}ами`,
      pre: `${stem}ах`,
    },
    genPl,
    nomPl,
  );
  return build(single, plural);
};

const declineNoun = (
  word: string,
  gender: Gender,
  animate: boolean,
  warnings: Set<DeclensionWarning>,
): NounForms => {
  const regular = declineNounRegular(word, gender, animate, warnings);
  const irregular = findIrregular(word);
  // Часть слов на -ор/-ер образует множественное на -а («директора»), часть —
  // регулярно («инженеры»). Что из этого перед нами, решает словарь; для
  // незнакомых слов честнее попросить проверить, чем угадать.
  if (!irregular && gender === "m" && /(ор|ер)$/i.test(word)) {
    warnings.add("pluralA");
  }
  return applyIrregular(word, regular, animate);
};

// ── Публичный вход ───────────────────────────────────────────────────────────

const EMPTY_FORM_KEYS = [
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

/**
 * Склоняет термин, заданный именительным падежом единственного числа.
 * Словосочетание («рабочее место») склоняется целиком: главное слово —
 * последнее, предшествующие прилагательные согласуются с ним.
 */
export const declineTerm = (
  nominative: string,
  options: DeclensionOptions = {},
): DeclensionResult => {
  const warnings = new Set<DeclensionWarning>();
  const words = splitWords(nominative);
  const head = words[words.length - 1] ?? "";
  const gender = options.gender ?? guessGender(head);
  const animate = options.animate ?? false;

  if (!head) {
    const empty = Object.fromEntries(
      EMPTY_FORM_KEYS.map((k) => [k, ""]),
    ) as Omit<TermForms, "gender">;
    return { forms: { gender, ...empty }, warnings: [] };
  }

  if (head.length <= 2) warnings.add("short");
  if (head.includes("ё")) warnings.add("yo");
  if (words.length > 1) warnings.add("phrase");
  // Заимствованные несклоняемые: «такси», «меню», «кафе». Формальный признак —
  // конечная гласная, нетипичная для русского склонения. Склонять их не нужно:
  // все двенадцать форм совпадают с исходной.
  if (/[уиэю]$/i.test(head)) {
    warnings.add("indeclinable");
    const fixed = Object.fromEntries(
      EMPTY_FORM_KEYS.map((k) => [k, nominative.trim()]),
    ) as Omit<TermForms, "gender">;
    return { forms: { gender, ...fixed }, warnings: [...warnings] };
  }

  const nounForms = declineNoun(head, gender, animate, warnings);

  const compose = (caseKey: CaseKey, plural: boolean): string => {
    const headForm = plural ? nounForms.pl[caseKey] : nounForms[caseKey];
    const prefix = words
      .slice(0, -1)
      .map((w) =>
        looksLikeAdjective(w)
          ? declineAdjective(w, gender, plural, caseKey, animate)
          : w,
      );
    return [...prefix, headForm].join(" ");
  };

  const forms = { gender } as TermForms;
  for (const caseKey of CASES) {
    forms[caseKey] = compose(caseKey, false);
    const plKey = `${caseKey}Pl` as keyof Omit<TermForms, "gender">;
    forms[plKey] = compose(caseKey, true);
  }

  return { forms, warnings: [...warnings] };
};
