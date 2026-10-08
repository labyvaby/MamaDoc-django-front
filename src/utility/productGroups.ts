/**
 * Группы товаров для выбора «пачкой»: категория, бренд, сезон.
 *
 * Бренд и сезон — generic-свойства товара «Бренд»/«Сезон» (так их заводят
 * импорт из 1С и строка накладной), отдельных полей у товара нет. Значения
 * сравниваются без учёта регистра и пробелов по краям, подпись берётся у
 * первого встреченного варианта.
 */

export type ProductGroupKind = "category" | "brand" | "season";

export const PRODUCT_GROUP_LABELS: Record<ProductGroupKind, string> = {
  category: "Категория",
  brand: "Бренд",
  season: "Сезон",
};

type AttributeLike = { attributeName: string; role: string; value: string };

/** Минимум, по которому строку списка можно отнести к группе. */
export type GroupableItem = {
  id: number;
  category?: string | null;
  attributes?: readonly AttributeLike[] | null;
};

export type ProductGroup = {
  kind: ProductGroupKind;
  /** Ключ сравнения (нижний регистр). */
  key: string;
  label: string;
  ids: number[];
};

const ATTRIBUTE_NAMES: Record<Exclude<ProductGroupKind, "category">, RegExp> = {
  brand: /^(бренд|brand)$/i,
  season: /^(сезон|season)$/i,
};

export function productGroupValue(item: GroupableItem, kind: ProductGroupKind): string | null {
  if (kind === "category") {
    const value = item.category?.trim();
    return value ? value : null;
  }
  const pattern = ATTRIBUTE_NAMES[kind];
  const attr = (item.attributes ?? []).find(
    (a) => a.role === "generic" && pattern.test(a.attributeName.trim()) && a.value.trim(),
  );
  return attr ? attr.value.trim() : null;
}

/** Группы каждого вида по алфавиту; строки без значения в группы не входят. */
export function buildProductGroups(
  items: readonly GroupableItem[],
): Record<ProductGroupKind, ProductGroup[]> {
  const result = {} as Record<ProductGroupKind, ProductGroup[]>;
  for (const kind of Object.keys(PRODUCT_GROUP_LABELS) as ProductGroupKind[]) {
    const byKey = new Map<string, ProductGroup>();
    for (const item of items) {
      const value = productGroupValue(item, kind);
      if (!value) continue;
      const key = value.toLowerCase();
      const group = byKey.get(key);
      if (group) {
        if (!group.ids.includes(item.id)) group.ids.push(item.id);
      } else {
        byKey.set(key, { kind, key, label: value, ids: [item.id] });
      }
    }
    result[kind] = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }
  return result;
}

/**
 * Клик по группе: выбрана целиком — снимается, иначе добавляется к выбору
 * (уже отмеченные строки других групп остаются).
 */
export function toggleGroup(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const next = new Set(selected);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}
