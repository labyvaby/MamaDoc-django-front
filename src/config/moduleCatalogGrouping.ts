import type { CatalogModule } from "../api/tenancy";

/**
 * Чистая логика группировки каталога модулей (без React/MUI), чтобы её можно
 * было юнит-тестировать так же, как остальные логические тесты проекта.
 */

/** Порядок групп каталога (по PlatformModule.category). */
export const CATEGORY_ORDER: string[] = [
  "operations",
  "commerce",
  "finance",
  "communication",
  "integrations",
  "clinical",
  "hr",
  "analytics",
];

/** Русские заголовки групп. */
export const CATEGORY_LABELS: Record<string, string> = {
  operations: "Операционные",
  commerce: "Продажи и клиенты",
  finance: "Деньги и лояльность",
  communication: "Коммуникации",
  integrations: "Интеграции",
  clinical: "Клинические",
  hr: "Персонал",
  analytics: "Аналитика",
};

/**
 * Группирует модули по категории: сначала известные категории в порядке
 * CATEGORY_ORDER, затем неизвестные по алфавиту.
 */
export function groupByCategory(items: CatalogModule[]): [string, CatalogModule[]][] {
  const byCat = new Map<string, CatalogModule[]>();
  for (const m of items) {
    const list = byCat.get(m.category) ?? [];
    list.push(m);
    byCat.set(m.category, list);
  }
  const known = CATEGORY_ORDER.filter((c) => byCat.has(c));
  const rest = [...byCat.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...rest].map((c) => [c, byCat.get(c) as CatalogModule[]]);
}
