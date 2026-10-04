import type { FoodGroup, FoodReaction, FoodReactionSeverity } from "../../../api/health";
import type { Option } from "../healthMeta";

/**
 * Каталог прикорма (ТЗ 2026-10-04-book-feeding §3.2–3.3): группы, продукты со
 * сроками и пометками, «Не давать». Сервер хранит только код и название —
 * сроки и правила живут здесь, в одном месте: перейти, например, на яйцо и
 * рыбу с 6 мес (EAACI, NHS) — правка этого файла.
 */

export interface FoodGroupInfo {
  code: FoodGroup;
  /** «Овощи». */
  label: string;
  /** «овощи» — в строке журнала. */
  lower: string;
  /** Срок группы по умолчанию, мес.: до него строка ленты серая. */
  from: number;
}

/** Порядок групп — порядок введения: строки ленты, разнообразие, чипы окна. */
export const FOOD_GROUPS: ReadonlyArray<FoodGroupInfo> = [
  { code: "vegetables", label: "Овощи", lower: "овощи", from: 6 },
  { code: "cereals", label: "Каши", lower: "каши", from: 6 },
  { code: "meat", label: "Мясо", lower: "мясо", from: 6 },
  { code: "fruits", label: "Фрукты", lower: "фрукты", from: 7 },
  { code: "egg", label: "Яйцо", lower: "яйцо", from: 7 },
  { code: "dairy", label: "Молочные", lower: "молочные", from: 8 },
  { code: "fish", label: "Рыба", lower: "рыба", from: 8 },
  { code: "other", label: "Прочее", lower: "прочее", from: 6 },
];

export const FOOD_GROUP_OPTIONS: ReadonlyArray<Option<FoodGroup>> = FOOD_GROUPS.map((group) => ({
  value: group.code,
  label: group.label,
}));

export function groupInfo(code: FoodGroup): FoodGroupInfo {
  return FOOD_GROUPS.find((group) => group.code === code) ?? FOOD_GROUPS[FOOD_GROUPS.length - 1];
}

/** Условие «можно» сверх срока: каши с глютеном — после безглютеновой, талкан — после каши с глютеном. */
export type FoodCondition = "glutenFreeCereal" | "glutenCereal";

export const CONDITION_TEXT: Record<FoodCondition, string> = {
  glutenFreeCereal: "после безглютеновой каши",
  glutenCereal: "после каши с глютеном",
};

export interface FoodProduct {
  /** Код каталога: латиница, цифры, «_» — его хранит сервер. */
  code: string;
  /** «Кабачок» — подпись чипа и название в журнале. */
  name: string;
  /** Короткая подпись на ленте: «гречневая», «раст. масло». */
  short?: string;
  group: FoodGroup;
  /** Срок по умолчанию, мес. */
  from: number;
  /** В группе риска аллергии — не раньше этого возраста (цитрусовые, клубника, киви). */
  riskFrom?: number;
  /** (М) малоаллергенный — в группе риска предлагается первым. */
  lowAllergen?: boolean;
  /** (Н) сам не предлагается в «Сегодня», только отмечается. */
  noSuggest?: boolean;
  /** (Л) местный: срок — предложение, его подтверждают врачи клиники; пока не подтвердят — не предлагается. */
  local?: boolean;
  /** А: аллерген для медкарты; нет — название продукта. */
  allergen?: string;
  /** В группе риска вводит только врач: яйцо, рыба, арахис, орехи. */
  doctorInRisk?: boolean;
  /** «Не давать» до этого возраста, мес. */
  forbiddenUntil?: number;
  /** Почему не давать — для окна: «детям раннего возраста не давать». */
  forbiddenText?: string;
  after?: FoodCondition;
  /** Подсказка к продукту: «не основа пюре», «резать, без косточек». */
  note?: string;
  /** Сроки по источникам для серой подсказки окна: «РФ — 8; ВОЗ и NHS — с 6». */
  sources?: string;
}

const M = { lowAllergen: true } as const;
const N = { noSuggest: true } as const;
const L = { local: true } as const;
const GLUTEN = "Глютен";
const COW_MILK = "Белок коровьего молока";
const HEN_EGG = "Куриное яйцо";
const FISH = "Рыба";

const fish = (code: string, name: string): FoodProduct => ({
  code,
  name,
  group: "fish",
  from: 8,
  allergen: FISH,
  doctorInRisk: true,
  note: "без костей, 2 раза в неделю вместо мяса",
  sources: "РФ; ВОЗ и NHS — с 6 мес",
});

/** Продукты в порядке предложения внутри группы (§3.2). */
export const FOOD_PRODUCTS: ReadonlyArray<FoodProduct> = [
  // Овощи — группа с 6.
  { code: "zucchini", name: "Кабачок", group: "vegetables", from: 6, ...M, note: "первым", sources: "ВОЗ и МЗ КР; РФ — с 4–5" },
  { code: "cauliflower", name: "Цветная капуста", group: "vegetables", from: 6, ...M, sources: "ВОЗ и МЗ КР; РФ — с 4–5" },
  { code: "broccoli", name: "Брокколи", group: "vegetables", from: 6, ...M, sources: "ВОЗ и МЗ КР; РФ — с 4–5" },
  { code: "pumpkin", name: "Тыква", group: "vegetables", from: 6, note: "после первых овощей" },
  { code: "carrot", name: "Морковь", group: "vegetables", from: 6, note: "после первых овощей" },
  { code: "potato", name: "Картофель", group: "vegetables", from: 6, note: "не основа пюре" },
  { code: "cabbage", name: "Белокочанная капуста", short: "капуста", group: "vegetables", from: 6 },
  { code: "pattypan", name: "Патиссон", group: "vegetables", from: 6 },
  { code: "spinach", name: "Шпинат", group: "vegetables", from: 6 },
  { code: "beetroot", name: "Свёкла", group: "vegetables", from: 7, sources: "срок 7–8 мес — предложение справки" },
  { code: "tomato", name: "Томат", group: "vegetables", from: 7, sources: "срок 7–8 мес — предложение справки" },

  // Каши — с 6.
  { code: "buckwheat", name: "Гречневая каша", short: "гречневая", group: "cereals", from: 6, note: "без глютена и молока" },
  { code: "rice", name: "Рисовая каша", short: "рисовая", group: "cereals", from: 6, note: "без глютена и молока" },
  { code: "corn", name: "Кукурузная каша", short: "кукурузная", group: "cereals", from: 6, note: "без глютена и молока" },
  {
    code: "oat",
    name: "Овсяная каша",
    short: "овсяная",
    group: "cereals",
    from: 6,
    allergen: GLUTEN,
    after: "glutenFreeCereal",
    note: "с глютеном — малыми порциями",
    sources: "РФ — после безглютеновых; международные — 4–12 мес",
  },
  {
    code: "wheat",
    name: "Пшеничная каша",
    short: "пшеничная",
    group: "cereals",
    from: 6,
    allergen: GLUTEN,
    after: "glutenFreeCereal",
    note: "с глютеном — малыми порциями",
    sources: "РФ — после безглютеновых; международные — 4–12 мес",
  },
  {
    code: "semolina",
    name: "Манная каша",
    short: "манная",
    group: "cereals",
    from: 6,
    allergen: GLUTEN,
    after: "glutenFreeCereal",
    note: "с глютеном — малыми порциями",
    sources: "РФ — после безглютеновых; международные — 4–12 мес",
  },
  {
    code: "multigrain",
    name: "Многозерновая каша",
    short: "многозерновая",
    group: "cereals",
    from: 6,
    allergen: GLUTEN,
    after: "glutenFreeCereal",
    note: "с глютеном — малыми порциями",
    sources: "РФ — после безглютеновых; международные — 4–12 мес",
  },
  { code: "millet", name: "Пшённая каша", short: "пшённая", group: "cereals", from: 7, sources: "срок 7–8 мес — предложение справки" },
  {
    code: "talkan",
    name: "Талкан",
    group: "cereals",
    from: 6,
    ...L,
    allergen: GLUTEN,
    after: "glutenCereal",
    note: "только кашей",
  },

  // Мясо — с 6.
  { code: "turkey", name: "Индейка", group: "meat", from: 6, ...M },
  { code: "rabbit", name: "Кролик", group: "meat", from: 6, ...M },
  { code: "horse", name: "Конина", group: "meat", from: 6, ...M, note: "железа 3,1 мг на 100 г против 2,7 у говядины" },
  { code: "pork", name: "Свинина", group: "meat", from: 6, ...M, ...N, note: "по выбору семьи" },
  { code: "beef", name: "Говядина", group: "meat", from: 6 },
  { code: "veal", name: "Телятина", group: "meat", from: 6 },
  { code: "chicken", name: "Курица", group: "meat", from: 6 },
  { code: "lamb", name: "Баранина", group: "meat", from: 6, note: "жир и курдюк не давать" },
  { code: "liver", name: "Печень", group: "meat", from: 8, sources: "срок 8–9 мес — предложение справки" },
  {
    code: "kazy",
    name: "Казы",
    group: "meat",
    from: 12,
    ...L,
    forbiddenUntil: 12,
    forbiddenText: "не на первом году",
  },

  // Фрукты — с 7 (РФ — с 4–5, но не первым прикормом и лучше после мяса).
  { code: "apple", name: "Яблоко", group: "fruits", from: 7, ...M, sources: "РФ — с 4–5, не первым прикормом; международные — с 6" },
  { code: "pear", name: "Груша", group: "fruits", from: 7, ...M, sources: "РФ — с 4–5, не первым прикормом; международные — с 6" },
  { code: "banana", name: "Банан", group: "fruits", from: 7 },
  { code: "apricot", name: "Абрикос (урюк)", short: "абрикос", group: "fruits", from: 7 },
  { code: "plum", name: "Слива", group: "fruits", from: 7 },
  { code: "prune", name: "Чернослив", group: "fruits", from: 7 },
  { code: "grape", name: "Виноград", group: "fruits", from: 7, note: "резать на 4 части, без косточек" },
  { code: "cherry", name: "Черешня", group: "fruits", from: 7, note: "резать, без косточек" },
  { code: "citrus", name: "Цитрусовые", group: "fruits", from: 7, riskFrom: 12, ...N, allergen: "Цитрусовые", note: "частый аллерген" },
  { code: "strawberry", name: "Клубника", group: "fruits", from: 7, riskFrom: 12, ...N, note: "частый аллерген" },
  { code: "kiwi", name: "Киви", group: "fruits", from: 7, riskFrom: 12, ...N, note: "частый аллерген" },

  // Яйцо — с 7 (РФ; EAACI — 4–6, NHS — 6); в группе риска — только врач.
  {
    code: "egg_yolk",
    name: "Желток",
    group: "egg",
    from: 7,
    allergen: HEN_EGG,
    doctorInRisk: true,
    note: "¼, потом ½; варить до твёрдого",
    sources: "РФ; EAACI — 4–6 мес, NHS — 6",
  },
  {
    code: "quail_egg",
    name: "Перепелиное яйцо",
    short: "перепел. яйцо",
    group: "egg",
    from: 7,
    ...N,
    allergen: "Перепелиное яйцо",
    doctorInRisk: true,
    note: "как желток, варить до твёрдого",
    sources: "РФ; EAACI — 4–6 мес, NHS — 6",
  },
  {
    code: "egg_whole",
    name: "Яйцо целое проваренное",
    short: "яйцо целое",
    group: "egg",
    from: 12,
    allergen: HEN_EGG,
    doctorInRisk: true,
    note: "2–3 раза в неделю",
    sources: "РФ; EAACI — 4–6 мес, NHS — 6",
  },

  // Молочные — с 8 (РФ; ВОЗ и NHS — с 6); у всех аллерген — белок коровьего молока.
  { code: "milk_in_dishes", name: "Молоко в блюдах", group: "dairy", from: 6, ...N, allergen: COW_MILK, note: "например, каша на молоке" },
  {
    code: "cottage_cheese",
    name: "Творог",
    group: "dairy",
    from: 8,
    allergen: COW_MILK,
    note: "по показаниям — с 6 мес",
    sources: "РФ; ВОЗ и NHS — с 6",
  },
  { code: "kefir", name: "Кефир", group: "dairy", from: 8, allergen: COW_MILK, note: "до 200 мл в день", sources: "РФ; ВОЗ и NHS — с 6" },
  { code: "yogurt", name: "Йогурт без сахара", short: "йогурт", group: "dairy", from: 8, allergen: COW_MILK, sources: "РФ; ВОЗ и NHS — с 6" },
  { code: "cheese", name: "Сыр пастеризованный", short: "сыр", group: "dairy", from: 8, allergen: COW_MILK, sources: "в РФ срока нет; международные — с 6" },
  { code: "ayran", name: "Айран", group: "dairy", from: 8, ...L, allergen: COW_MILK, note: "как кефир, только пастеризованный" },
  {
    code: "whole_milk",
    name: "Цельное молоко напитком",
    short: "цельное молоко",
    group: "dairy",
    from: 12,
    allergen: COW_MILK,
    forbiddenUntil: 12,
    forbiddenText: "напитком — до 12 мес; в блюдах — с 6 мес",
  },
  { code: "kurut", name: "Курут", group: "dairy", from: 12, ...L, allergen: COW_MILK, forbiddenUntil: 12, forbiddenText: "не на первом году" },

  // Рыба — с 8 (РФ; ВОЗ и NHS — с 6), без костей, 2 раза в неделю вместо мяса.
  fish("cod", "Треска"),
  fish("hake", "Хек"),
  fish("pollock", "Минтай"),
  fish("pike_perch", "Судак"),
  fish("trout", "Форель"),
  fish("carp", "Сазан"),

  // Прочее.
  { code: "vegetable_oil", name: "Растительное масло", short: "раст. масло", group: "other", from: 6, note: "в овощное пюре", sources: "ВОЗ и МЗ КР; РФ — с 4–5" },
  { code: "butter", name: "Сливочное масло", short: "слив. масло", group: "other", from: 6, allergen: COW_MILK, note: "в кашу", sources: "ВОЗ и МЗ КР; РФ — с 4–5" },
  { code: "baby_biscuit", name: "Печенье детское", short: "печенье", group: "other", from: 6, allergen: GLUTEN },
  {
    code: "peanut_paste",
    name: "Арахис пастой или молотый",
    short: "арахис",
    group: "other",
    from: 6,
    ...N,
    allergen: "Арахис",
    doctorInRisk: true,
    note: "по международным источникам; целый — с 5 лет",
  },
  {
    code: "nut_paste",
    name: "Орехи пастой или молотые",
    short: "орехи",
    group: "other",
    from: 6,
    ...N,
    allergen: "Орехи",
    doctorInRisk: true,
    note: "по международным источникам; целые — с 5 лет",
  },
  { code: "bread", name: "Хлеб, сухари", short: "хлеб", group: "other", from: 8, allergen: GLUTEN },
  { code: "lentils", name: "Чечевица", group: "other", from: 9, note: "разваренная и протёртая", sources: "в РФ срока нет; международные — с 6" },
  { code: "mung", name: "Маш", group: "other", from: 9, note: "разваренный и протёртый", sources: "в РФ срока нет; международные — с 6" },
  { code: "chickpea", name: "Нут", group: "other", from: 9, note: "разваренный и протёртый", sources: "в РФ срока нет; международные — с 6" },
  { code: "beans", name: "Фасоль", group: "other", from: 9, note: "разваренная и протёртая", sources: "в РФ срока нет; международные — с 6" },
  {
    code: "juice",
    name: "Сок",
    group: "other",
    from: 12,
    ...N,
    forbiddenUntil: 12,
    forbiddenText: "до 12 мес (AAP); ВОЗ — ограничить",
    sources: "РФ — с 8–9 мес; AAP — с 12",
  },
  { code: "honey", name: "Мёд", group: "other", from: 12, ...N, allergen: "Мёд", forbiddenUntil: 12, forbiddenText: "до 12 мес — риск ботулизма" },
  { code: "boorsok", name: "Боорсок", group: "other", from: 12, ...N, ...L, forbiddenUntil: 12, forbiddenText: "не на первом году" },
  { code: "tea", name: "Чай", group: "other", from: 24, ...N, forbiddenUntil: 24, forbiddenText: "до 2 лет; чай мешает усвоению железа" },
  {
    code: "sweet_drinks",
    name: "Сладкие напитки",
    group: "other",
    from: 24,
    ...N,
    forbiddenUntil: 24,
    forbiddenText: "до 2 лет (ВОЗ: в 6–23 мес — нет)",
  },
  { code: "kymyz", name: "Кымыз", group: "other", from: 24, ...N, ...L, forbiddenUntil: 24, forbiddenText: "детям раннего возраста не давать" },
  { code: "bozo", name: "Бозо", group: "other", from: 24, ...N, ...L, forbiddenUntil: 24, forbiddenText: "детям раннего возраста не давать" },
  { code: "maksym", name: "Максым", group: "other", from: 24, ...N, ...L, forbiddenUntil: 24, forbiddenText: "детям раннего возраста не давать" },
];

const BY_CODE = new Map(FOOD_PRODUCTS.map((product) => [product.code, product]));

/** «Ё» и регистр не различаем: «Свёкла» = «свекла». */
export function normText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

const BY_NAME = new Map(FOOD_PRODUCTS.map((product) => [normText(product.name), product]));

export function productByCode(code: string | null | undefined): FoodProduct | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

/** Свой продукт с названием из каталога считаем тем же продуктом. */
export function productByName(name: string | null | undefined): FoodProduct | null {
  return name ? BY_NAME.get(normText(name)) ?? null : null;
}

/** Аллерген для медкарты: «А:» каталога или название. */
export function productAllergen(product: Pick<FoodProduct, "name" | "allergen">): string {
  return product.allergen ?? product.name;
}

/** Подпись на ленте: короткая или название строчными. */
export function productShort(product: Pick<FoodProduct, "name" | "short">): string {
  return product.short ?? product.name.toLowerCase();
}

/** Предлагается в «Сегодня»: без (Н) и без неподтверждённых местных (Л). */
export function isSuggestible(product: FoodProduct): boolean {
  return !product.noSuggest && !product.local;
}

export function productsOfGroup(group: FoodGroup): FoodProduct[] {
  return FOOD_PRODUCTS.filter((product) => product.group === group);
}

/** Код своего продукта сервер не принимает — пусто; каталожный — латиница, цифры, «_». */
export const PRODUCT_CODE_RE = /^[a-z0-9_]+$/;

// ── Не давать (§3.3) ────────────────────────────────────────────────────────

export interface NoGiveRule {
  key: string;
  /** Чип: «Мёд — до 12 мес». */
  chip: string;
  /** Полный текст в подсказке чипа. */
  text: string;
  /** До какого возраста, мес.; null — всегда. */
  until: number | null;
  source: string;
  /** Второй этап после `until`: сок — «не больше 120 мл» до 3 лет. */
  then?: { chip: string; text: string; until: number };
}

/** Порядок строк — порядок чипов на экране. */
export const NO_GIVE: ReadonlyArray<NoGiveRule> = [
  { key: "honey", chip: "Мёд — до 12 мес", text: "Мёд — до 12 мес: риск ботулизма.", until: 12, source: "ВОЗ, NHS, ESPGHAN" },
  {
    key: "milk",
    chip: "Цельное молоко напитком — до 12 мес",
    text: "Цельное коровье или козье молоко напитком — до 12 мес; в блюдах — с 6 мес.",
    until: 12,
    source: "МЗ КР, NHS, ESPGHAN",
  },
  { key: "salt", chip: "Соль и сахар — первый год", text: "Соль и сахар в еду не добавлять на первом году.", until: 12, source: "РФ, NHS, ESPGHAN" },
  {
    key: "juice",
    chip: "Сок — до 12 мес",
    text: "Сок — не раньше 12 мес (AAP); РФ допускает с 8–9 мес, ВОЗ советует ограничить.",
    until: 12,
    source: "AAP, ВОЗ",
    then: { chip: "Сок — не больше 120 мл в день", text: "Сок в 1–3 года — не больше 120 мл в день (AAP).", until: 36 },
  },
  {
    key: "nuts",
    chip: "Целые орехи — до 5 лет",
    text: "Целые орехи — до 5 лет: можно подавиться; молотые или пастой — с 6 мес.",
    until: 60,
    source: "NHS",
  },
  {
    key: "localDry",
    chip: "Курут, казы, боорсок — не на первом году",
    text: "Курут, казы, боорсок — не на первом году (местные продукты; срок подтверждают врачи клиники).",
    until: 12,
    source: "предложение справки",
  },
  {
    key: "localDrinks",
    chip: "Кымыз, бозо, максым — малышам нет",
    text: "Кымыз, бозо, максым — детям раннего возраста не давать.",
    until: 24,
    source: "предложение справки",
  },
  {
    key: "sweet",
    chip: "Сладкие напитки — до 2 лет",
    text: "Сладкие напитки и подсластители — до 2 лет (ВОЗ); сладкое — лучше до 4 лет.",
    until: 24,
    source: "ВОЗ, NHS",
    then: { chip: "Сладкое — лучше до 4 лет", text: "Сладкое лучше не давать до 4 лет (NHS).", until: 48 },
  },
  {
    key: "tea",
    chip: "Чай, кофе — до 2 лет",
    text: "Чай и кофе — до 2 лет; чай — не во время еды: мешает усвоению железа (МЗ КР).",
    until: 24,
    source: "ВОЗ, МЗ КР",
  },
  {
    key: "round",
    chip: "Круглое — резать на 4 части",
    text: "Виноград, черри и другое круглое — резать на 4 части; косточки и кости убирать — до 4–5 лет.",
    until: 60,
    source: "NHS",
  },
  {
    key: "hardRaw",
    chip: "Твёрдые сырые морковь и яблоко — первый год",
    text: "Твёрдую сырую морковь и яблоко на первом году не давать — можно подавиться.",
    until: 12,
    source: "NHS",
  },
  {
    key: "raw",
    chip: "Сырое и недоваренное — всегда",
    text: "Сырые или недоваренные яйца, мясо, моллюски; непастеризованное молоко (кипятить); сыры с плесенью.",
    until: null,
    source: "NHS",
  },
  {
    key: "mercury",
    chip: "Рыба с ртутью — всегда",
    text: "Рыба с ртутью: акула, меч-рыба, марлин, королевская макрель, большеглазый тунец, атлантический большеголов, кафельник.",
    until: null,
    source: "NHS, FDA",
  },
  {
    key: "plantDrinks",
    chip: "Растительные напитки вместо смеси — первый год",
    text: "Растительные напитки вместо смеси — нельзя на первом году.",
    until: 12,
    source: "РФ",
  },
  { key: "riceDrinks", chip: "Рисовые напитки вместо молока — до 5 лет", text: "Рисовые напитки вместо молока — до 5 лет.", until: 60, source: "NHS" },
  {
    key: "fastFood",
    chip: "Фастфуд, снеки, колбасы — всегда",
    text: "Фастфуд, снеки, колбасы, копчёности — не давать.",
    until: null,
    source: "ВОЗ",
  },
];

export interface NoGiveItem {
  key: string;
  chip: string;
  text: string;
  source: string;
}

/** Что из «Не давать» действует в этом возрасте (полных месяцев), в порядке экрана. */
export function activeNoGive(months: number): NoGiveItem[] {
  const items: NoGiveItem[] = [];
  for (const rule of NO_GIVE) {
    if (rule.until == null || months < rule.until) {
      items.push({ key: rule.key, chip: rule.chip, text: rule.text, source: rule.source });
    } else if (rule.then && months < rule.then.until) {
      items.push({ key: rule.key, chip: rule.then.chip, text: rule.then.text, source: rule.source });
    }
  }
  return items;
}

// ── Реакция (§2.1, §5) ──────────────────────────────────────────────────────

export const FOOD_REACTIONS: ReadonlyArray<Option<FoodReaction>> = [
  { value: "none", label: "Нет" },
  { value: "rash", label: "Сыпь" },
  { value: "abdomen", label: "Живот" },
  { value: "stool", label: "Стул" },
  { value: "vomiting", label: "Рвота" },
  { value: "other", label: "Другое" },
];

export const FOOD_SEVERITIES: ReadonlyArray<Option<Exclude<FoodReactionSeverity, "">>> = [
  { value: "mild", label: "Лёгкая" },
  { value: "moderate", label: "Средняя" },
  { value: "severe", label: "Тяжёлая" },
];

/** Быстрые фразы в заметку при реакции. */
export const REACTION_PHRASES: Partial<Record<FoodReaction, ReadonlyArray<string>>> = {
  rash: ["на щеках", "вокруг рта", "по телу", "зуд", "обострение экземы"],
  other: ["кашель", "свистящее дыхание", "отёк губ или лица", "вялость, бледность"],
};

/** Реакция словами для окна аллергии (§3.7); «другое» — текст заметки. */
export const REACTION_ALLERGY_TEXT: Record<Exclude<FoodReaction, "none" | "other">, string> = {
  rash: "Сыпь",
  abdomen: "Боль в животе",
  stool: "Нарушение стула",
  vomiting: "Рвота",
};
