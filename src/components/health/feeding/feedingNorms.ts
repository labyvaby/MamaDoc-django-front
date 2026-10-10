import type { FeedingType, FoodGroup } from "../../../api/health";
import type { FoodProduct } from "./feedingCatalog";

/**
 * Нормы прикорма (ТЗ 2026-10-04-book-feeding §3.4–3.5): порции на день по
 * табл. 5.1 программы РФ 2019 и «Как кормить» по возрасту. Своей таблицы
 * граммов у МЗ КР нет; проект 4-го издания программы РФ (2024) не утверждён —
 * его цифр здесь нет.
 */

export type NormColumn = "4-5" | "6" | "7" | "8" | "9-12";

export const NORM_COLUMNS: ReadonlyArray<{ key: NormColumn; label: string; short: string }> = [
  { key: "4-5", label: "4–5 мес", short: "4–5" },
  { key: "6", label: "6 мес", short: "6" },
  { key: "7", label: "7 мес", short: "7" },
  { key: "8", label: "8 мес", short: "8" },
  { key: "9-12", label: "9–12 мес", short: "9–12" },
];

/**
 * Столбец табл. 5.1 по полным месяцам: 4 и 5 → «4–5», 6/7/8 — свои, 9–11 →
 * «9–12»; с года — «после года» (`after`), до 4 мес таблицы нет (null).
 */
export function normColumn(months: number | null): NormColumn | "after" | null {
  if (months == null || months < 4) return null;
  if (months < 6) return "4-5";
  if (months === 6) return "6";
  if (months === 7) return "7";
  if (months === 8) return "8";
  if (months < 12) return "9-12";
  return "after";
}

export type NormKey =
  | "vegetables"
  | "cereals"
  | "meat"
  | "fruits"
  | "yolk"
  | "cottage"
  | "fish"
  | "kefir"
  | "biscuit"
  | "bread"
  | "oil"
  | "butter";

type Values = Record<NormColumn, string | null>;

const values = (v45: string | null, v6: string | null, v7: string | null, v8: string | null, v912: string | null): Values => ({
  "4-5": v45,
  "6": v6,
  "7": v7,
  "8": v8,
  "9-12": v912,
});

export interface NormRow {
  key: NormKey;
  label: string;
  unit: "г" | "мл" | "шт.";
  values: Values;
  /** Отварное мясо — вторые числа строки «Мясное пюре». */
  alt?: { label: string; genitive: string; values: Values };
  /** Примечание источника: «в овощное пюре», «не первым прикормом». */
  note?: string;
  /** Статус строки — по продуктам этих групп… */
  groups?: ReadonlyArray<FoodGroup>;
  /** …или этих кодов каталога. */
  codes?: ReadonlyArray<string>;
}

/** Табл. 5.1 программы РФ 2019, г или мл в сутки; строки сока нет — сок не предлагаем. */
export const NORM_ROWS: ReadonlyArray<NormRow> = [
  { key: "vegetables", label: "Овощное пюре", unit: "г", values: values("10–150", "150", "150", "150", "150"), groups: ["vegetables"] },
  { key: "cereals", label: "Каша", unit: "г", values: values("10–150", "150", "150", "180", "200"), groups: ["cereals"] },
  {
    key: "meat",
    label: "Мясное пюре",
    unit: "г",
    values: values(null, "5–30", "40–50", "60–70", "80–100"),
    alt: { label: "отварное мясо", genitive: "отварного мяса", values: values(null, "3–15", "20–30", "30–35", "40–50") },
    note: "промышленное / отварное мясо, без овощей и круп",
    groups: ["meat"],
  },
  {
    key: "fruits",
    label: "Фруктовое пюре",
    unit: "г",
    values: values("5–50", "60", "70", "80", "90–100"),
    note: "не первым прикормом",
    groups: ["fruits"],
  },
  { key: "yolk", label: "Желток", unit: "шт.", values: values(null, null, "¼", "½", "½"), codes: ["egg_yolk"] },
  {
    key: "cottage",
    label: "Творог",
    unit: "г",
    values: values(null, null, null, "10–40", "50"),
    note: "по показаниям — с 6 мес",
    codes: ["cottage_cheese"],
  },
  { key: "fish", label: "Рыбное пюре", unit: "г", values: values(null, null, null, "5–30", "30–60"), groups: ["fish"] },
  {
    key: "kefir",
    label: "Кефир, йогурт",
    unit: "мл",
    values: values(null, null, null, "200", "200"),
    note: "и другие детские кисломолочные напитки",
    codes: ["kefir", "yogurt", "ayran"],
  },
  { key: "biscuit", label: "Печенье детское", unit: "г", values: values(null, "3", "5", "5", "5"), codes: ["baby_biscuit"] },
  { key: "bread", label: "Хлеб, сухари", unit: "г", values: values(null, null, null, "5", "10"), codes: ["bread"] },
  {
    key: "oil",
    label: "Растительное масло",
    unit: "мл",
    values: values("1–3", "5", "5", "6", "6"),
    note: "в овощное пюре",
    codes: ["vegetable_oil"],
  },
  { key: "butter", label: "Сливочное масло", unit: "г", values: values("1–3", "4", "4", "5", "5"), note: "в кашу", codes: ["butter"] },
];

/** Под таблицей (п. 9 справки). */
export const NORM_FOOTNOTE = "Новый продукт начинают с ½ ч. л. и доводят до нормы за 5–7 дней. Больше нормы не давать.";

/** После года таблица свёрнута, сверху — общий ориентир. */
export function afterYearNorm(months: number): string {
  return months < 18
    ? "1000–1200 г еды в сутки, не больше 300–350 мл за приём (РФ)"
    : "Граммов на день в программах нет: 3–4 приёма и 1–2 перекуса, ¾–1 чашки за приём (ВОЗ, ЮНИСЕФ)";
}

/** Строка табл. 5.1 продукта: по коду, иначе по группе. */
export function normRowOf(product: Pick<FoodProduct, "code" | "group">): NormRow | null {
  return (
    NORM_ROWS.find((row) => row.codes?.includes(product.code)) ??
    NORM_ROWS.find((row) => !row.codes && row.groups?.includes(product.group)) ??
    null
  );
}

/** «10–40 г», «½ желтка», «40–50 г (отварного мяса — 20–30 г)»; в столбце нет числа — null. */
export function normAmount(row: NormRow, column: NormColumn): string | null {
  const value = row.values[column];
  if (!value) return null;
  if (row.unit === "шт.") return `${value} желтка`;
  const alt = row.alt?.values[column];
  return alt && row.alt ? `${value} ${row.unit} (${row.alt.genitive} — ${alt} ${row.unit})` : `${value} ${row.unit}`;
}

/** Ячейка таблицы: «60–70 / 30–35», «½ шт.»; нет числа — null. */
export function normCell(row: NormRow, column: NormColumn): string | null {
  const value = row.values[column];
  if (!value) return null;
  const alt = row.alt?.values[column];
  if (alt) return `${value} / ${alt}`;
  return row.unit === "шт." ? `${value} шт.` : value;
}

// ── Как кормить (§3.5) ──────────────────────────────────────────────────────

export type HowToColumn = "4-5" | "6-8" | "9-11" | "12-23";

/** Столбец «Как кормить» по полным месяцам; до 4 мес и с 2 лет — нет. */
export function howToColumn(months: number | null): HowToColumn | null {
  if (months == null || months < 4 || months >= 24) return null;
  if (months < 6) return "4-5";
  if (months < 9) return "6-8";
  if (months < 12) return "9-11";
  return "12-23";
}

export const HOW_TO_CAPTION: Record<HowToColumn, string> = {
  "4-5": "4–5 мес, только программа РФ",
  "6-8": "6–8 мес · ВОЗ, ЮНИСЕФ, РФ",
  "9-11": "9–11 мес · ВОЗ, ЮНИСЕФ, РФ",
  "12-23": "1–2 года · ВОЗ, ЮНИСЕФ, РФ",
};

type HowToKey = "meals" | "portion" | "texture" | "breast" | "formula" | "water";

const HOW_TO: Record<HowToKey, { label: string; values: Record<HowToColumn, string | null> }> = {
  meals: {
    label: "Приёмов прикорма",
    values: {
      "4-5": "1, затем 2",
      "6-8": "2–3 и 1–2 перекуса; без грудного — 4",
      "9-11": "3–4 и 1–2 перекуса; без грудного — 4–5",
      "12-23": "3–4 и 1–2 перекуса; РФ — 5 (3 основных и 2)",
    },
  },
  portion: {
    label: "За приём",
    values: {
      "4-5": "от ½ ч. л. до нормы за неделю",
      "6-8": "сначала 2–3 ложки дважды в день, затем ½ чашки (около 125 мл)",
      "9-11": "½ чашки",
      "12-23": "¾–1 чашки; РФ — до 300–350 мл",
    },
  },
  texture: {
    label: "Какая еда",
    values: {
      "4-5": "однородное пюре",
      "6-8": "пюре, размятое, густая каша; кусочки — к 8 мес",
      "9-11": "мелко рубленое, еда руками",
      "12-23": "с общего стола, при нужде измельчённое",
    },
  },
  breast: {
    label: "Грудь",
    values: {
      "4-5": "после каждого прикорма",
      "6-8": "по требованию, не меньше прежнего",
      "9-11": "около 3 молочных кормлений",
      "12-23": "до 2 лет и дольше; РФ — 1–2 раза в день",
    },
  },
  formula: {
    label: "Смесь",
    values: {
      "4-5": "не больше 1000 мл в сутки после 5 мес",
      "6-8": "около 600 мл в сутки (7–9 мес)",
      "9-11": "около 400 мл в сутки (10–12 мес)",
      "12-23": "РФ — 200 мл перед сном",
    },
  },
  water: {
    label: "Вода",
    values: {
      "4-5": null,
      "6-8": "150–200 мл в сутки между кормлениями, глотками из чашки",
      "9-11": "150–200 мл в сутки между кормлениями, глотками из чашки",
      "12-23": null,
    },
  },
};

export interface HowToItem {
  key: string;
  /** «За приём»; пусто — фраза целиком. */
  label: string;
  text: string;
  /** Жёлтая приписка: «пора кусочки…» в 9–11 мес (п. 10). */
  alert?: string;
}

/** С начала прикорма — всегда. */
export const HOW_TO_ALWAYS: ReadonlyArray<HowToItem> = [
  {
    key: "interval",
    label: "",
    text: "Новый продукт — раз в 3 дня, в группе риска — раз в 7; аллергикам каждый продукт вводят 7–10 дней (РФ)",
  },
  { key: "signals", label: "", text: "Кормить по сигналам голода и сытости (ВОЗ)" },
  {
    key: "variety",
    label: "",
    text: "Разнообразие: каждый день мясо, рыба или яйца, овощи и фрукты, часто — бобовые; цель — 5 и более групп продуктов в день (ВОЗ)",
  },
];

export const READINESS_TEXT =
  "Признаки готовности: сидит сам или с поддержкой и держит голову; тянет еду в рот; глотает, а не выталкивает. Не признаки: грызёт кулачки, чаще просыпается ночью.";

export const NORMAL_THINGS: ReadonlyArray<string> = [
  "Давится от новой консистенции — это не удушье",
  "Отказывается от продукта — бывает нужно 10–15 попыток",
  "Стул меняет цвет и плотность",
  "При запоре — овощи с маслом; не помогло — фруктовое пюре",
];

export const WHOLE_MILK_TEXT =
  "цельное пастеризованное напитком — с 12 мес; ВОЗ последующие смеси не советует, РФ допускает «третьи формулы»";

export interface HowToFeed {
  column: HowToColumn;
  caption: string;
  items: HowToItem[];
  /** С начала прикорма — всегда. */
  always: ReadonlyArray<HowToItem>;
  /** С 4 мес, пока прикорма нет. */
  readiness: string | null;
}

/**
 * «Как кормить сейчас»: столбец по возрасту; «Грудь» — при грудном и
 * смешанном, «Смесь» — при смешанном и искусственном (вид неизвестен — обе);
 * на общем столе после года — строка о молоке вместо них.
 */
export function howToFeed(months: number | null, feedingType: FeedingType | null, started: boolean): HowToFeed | null {
  const column = howToColumn(months);
  if (!column) return null;
  const showBreast = feedingType == null || feedingType === "breast" || feedingType === "mixed";
  const showFormula = feedingType == null || feedingType === "mixed" || feedingType === "formula";
  const items: HowToItem[] = [];
  const push = (key: HowToKey, extra?: Partial<HowToItem>) => {
    const text = HOW_TO[key].values[column];
    if (text) items.push({ key, label: HOW_TO[key].label, text, ...extra });
  };
  push("meals");
  push("portion");
  push("texture", column === "9-11" ? { alert: "пора кусочки: комковатое — не позже 8–10 мес" } : undefined);
  if (showBreast) push("breast");
  if (showFormula) push("formula");
  if (feedingType === "general" && column === "12-23") items.push({ key: "milk", label: "Молоко", text: WHOLE_MILK_TEXT });
  push("water");
  return {
    column,
    caption: HOW_TO_CAPTION[column],
    items,
    always: started ? HOW_TO_ALWAYS : [],
    readiness: started ? null : READINESS_TEXT,
  };
}
