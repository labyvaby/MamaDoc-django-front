/** Общее для вкладок «Кухни»: единицы продуктов и правила полей. */
import type { FieldRules } from "./formRules";

/** Единицы, которые принимает бэк (IngredientUnit). */
export const INGREDIENT_UNITS = [
  { value: "kg", label: "кг" },
  { value: "g", label: "г" },
  { value: "l", label: "л" },
  { value: "pcs", label: "шт" },
] as const;

const UNIT_RU: Record<string, string> = {
  kg: "кг",
  g: "г",
  gr: "г",
  l: "л",
  ml: "мл",
  pcs: "шт",
  pc: "шт",
  piece: "шт",
  pieces: "шт",
  pack: "уп",
  bunch: "пучок",
};

/** «kg» → «кг»: справочник ингредиентов хранит единицы латиницей. */
export const unitRu = (unit: string) => UNIT_RU[unit.trim().toLowerCase()] ?? unit;

/** Количество — с десятыми (0,5 кг), цена — с копейками; остаток может быть нулём. */
export const KITCHEN_RULES = {
  qty: { kind: "decimal", required: true, min: 0.01, max: 100_000, maxDecimals: 2 },
  price: { kind: "decimal", required: true, min: 0, max: 10_000_000, maxDecimals: 2 },
  stock: { kind: "decimal", required: true, min: 0, max: 100_000, maxDecimals: 2 },
  /** Порций на гостя: 0,9 — девять из десяти гостей берут блюдо. Бэк: до 999.99. */
  portions: { kind: "decimal", required: true, min: 0.01, max: 999.99, maxDecimals: 2 },
  /** На порцию: 0,015 кг зелени — бэк хранит до трёх знаков. */
  perPortion: { kind: "decimal", required: true, min: 0.001, max: 100_000, maxDecimals: 3 },
  name: { required: true, maxLength: 120 },
} satisfies Record<string, FieldRules>;

/** "0.900" → "0,9" — без лишних нулей, с запятой. */
export const formatQty = (value: string | number) => Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 3 });
