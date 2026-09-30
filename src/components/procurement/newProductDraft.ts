import type { GoodsReceiptNewProductInput, RecognizedLine } from "../../api/procurement";
import type { DjangoProductAttribute, DjangoProductCategoryNode, DjangoUnitOfMeasure } from "../../api/warehouse";

/**
 * Новый товар прямо в строке накладной: товара нет в каталоге — строка несёт
 * черновик карточки, и бэк заводит её вместе с приходом (`newProduct`, право
 * `procurement.receipts.create_products`). Количество строки сразу становится
 * остатком: партия и движение создаются тем же проведением.
 *
 * Здесь — только чистая логика черновика: имя будущей карточки, вариант
 * «модель × цвет × размер», тело запроса и подготовка из распознанной строки.
 */

/** Поля черновика — как в форме, всё строками. */
export interface NewProductDraft {
  /** Название товара; у варианта — название модели. */
  name: string;
  categoryId: number | null;
  /** Категория строкой — у организаций без справочника категорий (клиника). */
  category: string;
  unitId: number | null;
  /** Цена продажи, сом. */
  price: string;
  barcode: string;
  sku: string;
  color: string;
  size: string;
  /** Свойство «Бренд»; пусто — бренд по умолчанию из карточки поставщика. */
  brand: string;
}

export const emptyDraft = (name = ""): NewProductDraft => ({
  name,
  categoryId: null,
  category: "",
  unitId: null,
  price: "",
  barcode: "",
  sku: "",
  color: "",
  size: "",
  brand: "",
});

/**
 * Значения свойства «Бренд» организации — подсказки к полю: выбирая из уже
 * заведённых, не плодим «Zara» / «ZARA» / «Zara » и находим товары поиском.
 */
export function brandOptions(attributes: DjangoProductAttribute[]): string[] {
  const brand = attributes.find((a) => a.isActive && a.role === "generic" && /^(бренд|brand)$/i.test(a.name.trim()));
  return (brand?.values ?? [])
    .filter((v) => v.isActive)
    .map((v) => v.value)
    .sort((a, b) => a.localeCompare(b, "ru"));
}

/** Категория, в которой товар живёт вариантами: её форма несёт и цвет, и размер. */
export interface CategoryOption {
  id: number;
  /** Путь в дереве: «Одежда / Платья». */
  label: string;
  matrix: boolean;
  /** Подсказки для осей варианта — активные значения цвета и размера категории. */
  colors: string[];
  sizes: string[];
}

/**
 * Активные категории списком с путём в дереве. Вариантная — та, чья форма
 * товара несёт активные свойства и цвета, и размера (как в карточке товара).
 */
export function buildCategoryOptions(
  nodes: DjangoProductCategoryNode[],
  attributes: DjangoProductAttribute[],
): CategoryOption[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const attributeById = new Map(attributes.filter((a) => a.isActive).map((a) => [a.id, a]));
  const pathOf = (node: DjangoProductCategoryNode): string => {
    const names: string[] = [];
    const seen = new Set<number>();
    let current: DjangoProductCategoryNode | undefined = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = current.parentId != null ? byId.get(current.parentId) : undefined;
    }
    return names.join(" / ");
  };
  return nodes
    .filter((node) => node.isActive)
    .map((node) => {
      const form = node.attributeIds.map((id) => attributeById.get(id)).filter((a): a is DjangoProductAttribute => Boolean(a));
      const color = form.find((a) => a.role === "color");
      const size = form.find((a) => a.role === "size");
      const values = (attribute?: DjangoProductAttribute) =>
        (attribute?.values ?? [])
          .filter((v) => v.isActive)
          .sort((a, b) => a.position - b.position)
          .map((v) => v.value);
      return {
        id: node.id,
        label: pathOf(node),
        matrix: Boolean(color && size),
        colors: values(color),
        sizes: values(size),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

/** Вариант модели — только в вариантной категории и когда заданы обе оси. */
export const isVariantDraft = (draft: NewProductDraft, category: CategoryOption | null | undefined): boolean =>
  Boolean(category?.matrix && draft.color.trim() && draft.size.trim());

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[\s,.;:·/()]+/)
    .filter(Boolean);

/** Уже названо в имени: длинное — подстрокой, короткое («S», «42») — целым словом. */
const mentions = (name: string, part: string): boolean => {
  const needle = part.trim().toLowerCase();
  if (!needle) return true;
  if (needle.length >= 3 && name.toLowerCase().includes(needle)) return true;
  return tokens(name).includes(needle);
};

/**
 * Имя будущей карточки — как у генератора матрицы: «Модель, цвет, размер».
 * Цвет и размер, уже названные в имени, второй раз не дописываются.
 */
export function draftProductName(draft: NewProductDraft): string {
  const name = draft.name.trim();
  const extras = [draft.color, draft.size].map((part) => part.trim()).filter((part) => part && !mentions(name, part));
  return [name, ...extras].filter(Boolean).join(", ");
}

const toAmount = (raw: string): number => {
  const n = Number(String(raw).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Тело `newProduct` для бэка. Вариант уходит осями (имя — модель, артикул
 * выдаёт генератор матрицы); обычный товар — готовым именем, в которое
 * цвет и размер вписаны, чтобы размеры одной вещи не слиплись в одну карточку.
 */
export function newProductInput(draft: NewProductDraft, category: CategoryOption | null | undefined): GoodsReceiptNewProductInput {
  const variant = isVariantDraft(draft, category);
  const input: GoodsReceiptNewProductInput = {
    name: variant ? draft.name.trim() : draftProductName(draft),
    price: String(toAmount(draft.price)),
  };
  if (draft.categoryId != null) input.categoryId = draft.categoryId;
  else if (draft.category.trim()) input.category = draft.category.trim();
  if (draft.unitId != null) input.unitId = draft.unitId;
  if (draft.barcode.trim()) input.barcode = draft.barcode.trim();
  if (draft.brand.trim()) input.brand = draft.brand.trim();
  if (variant) {
    input.color = draft.color.trim();
    input.size = draft.size.trim();
  } else if (draft.sku.trim()) {
    input.sku = draft.sku.trim();
  }
  return input;
}

/** Единица из документа («шт», «Шт.», «pcs» — нет) → строка справочника, если совпала. */
export function matchUnit(units: DjangoUnitOfMeasure[], raw: string | null | undefined): DjangoUnitOfMeasure | null {
  const norm = (text: string) => text.trim().toLowerCase().replace(/\.$/, "");
  const wanted = raw ? norm(raw) : "";
  if (!wanted) return null;
  return units.find((unit) => unit.isActive && (norm(unit.shortName) === wanted || norm(unit.name) === wanted)) ?? null;
}

/**
 * Черновик из распознанной строки: название, оси варианта, штрихкод и
 * единица — как в документе. Артикул поставщика берётся, только если в
 * накладной он у одной строки: у размеров одной модели он общий, а артикул
 * карточки уникален.
 */
export function draftFromRecognized(
  line: Pick<RecognizedLine, "name" | "color" | "size" | "barcode" | "sku" | "unit" | "productName" | "brand">,
  options: { units: DjangoUnitOfMeasure[]; skuIsUnique: boolean; brands?: string[] },
): NewProductDraft {
  const brand = line.brand?.trim() ?? "";
  return {
    ...emptyDraft((line.productName || line.name).trim()),
    color: line.color?.trim() ?? "",
    size: line.size?.trim() ?? "",
    // Уже заведённое написание («Zara», а не «ZARA» из документа) — одно
    // значение свойства на бренд, иначе фильтр найдёт только часть товаров.
    brand: options.brands?.find((known) => known.toLowerCase() === brand.toLowerCase()) ?? brand,
    barcode: line.barcode?.trim() ?? "",
    sku: options.skuIsUnique ? line.sku?.trim() ?? "" : "",
    unitId: matchUnit(options.units, line.unit)?.id ?? null,
  };
}

/** Что не так с черновиком — текст для строки, либо null. */
export function draftProblem(
  draft: NewProductDraft,
  options: { categoryRequired: boolean; category: CategoryOption | null | undefined },
): string | null {
  if (!draft.name.trim()) return "Укажите название товара";
  if (options.categoryRequired && draft.categoryId == null) return "Выберите категорию";
  if (options.category?.matrix && Boolean(draft.color.trim()) !== Boolean(draft.size.trim())) {
    return "Для варианта нужны и цвет, и размер";
  }
  return null;
}
