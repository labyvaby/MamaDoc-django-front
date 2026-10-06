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
  /** Свойство «Сезон» («Осень-зима 2026», «FW26»); пусто — не задаётся. */
  season: string;
  /** Описание карточки: по умолчанию — всё, что о строке сказано в накладной. */
  description: string;
  /**
   * Категории ещё нет в справочнике — её имя («Пальто»); форма заведёт её
   * при проведении. Взаимоисключающе с `categoryId`.
   */
  newCategory: string;
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
  season: "",
  description: "",
  newCategory: "",
});

/** Категория справочника по имени — полным путём или последним звеном («Пальто»). */
export function matchCategory(options: CategoryOption[], name: string | null | undefined): CategoryOption | null {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    options.find((o) => o.label.toLowerCase() === wanted) ??
    options.find((o) => o.label.split(" / ").pop()?.trim().toLowerCase() === wanted) ??
    null
  );
}

/**
 * Описание новой карточки из распознанной строки: полное название из
 * документа и все его колонки — чтобы ничего из накладной не потерялось,
 * даже то, чему в карточке нет отдельного поля.
 */
export function describeRecognized(line: {
  name: string;
  sourceName?: string | null;
  description?: string | null;
  modelCode?: string | null;
  sku?: string | null;
  color?: string | null;
  size?: string | null;
  sizes?: Array<{ size: string; quantity: string | null }>;
  season?: string | null;
  barcode?: string | null;
  details?: Array<{ label: string; value: string }>;
}): string {
  const rows: string[] = [];
  const title = (line.sourceName || line.name || "").trim();
  if (title) rows.push(`Из накладной: ${title}`);
  if (line.description?.trim()) rows.push(line.description.trim());
  const pairs: Array<[string, string | null | undefined]> = [
    ["Артикул", line.sku],
    ["Код модели", line.modelCode],
    ["Цвет", line.color],
    ["Размер", line.size],
    ["Размеры", line.sizes?.length ? line.sizes.map((s) => (s.quantity ? `${s.size} — ${Number(s.quantity)}` : s.size)).join(", ") : null],
    ["Сезон", line.season],
    ["Штрихкод", line.barcode],
    ...(line.details ?? []).map((d): [string, string] => [d.label, d.value]),
  ];
  pairs.forEach(([label, value]) => {
    if (value?.trim()) rows.push(`${label}: ${value.trim()}`);
  });
  return rows.join("\n");
}

/**
 * Значения свойства «Бренд» организации — подсказки к полю: выбирая из уже
 * заведённых, не плодим «Zara» / «ZARA» / «Zara » и находим товары поиском.
 */
export function brandOptions(attributes: DjangoProductAttribute[]): string[] {
  return genericValues(attributes, /^(бренд|brand)$/i).sort((a, b) => a.localeCompare(b, "ru"));
}

/** Значения свойства «Сезон» — в порядке справочника, как их расставила организация. */
export function seasonOptions(attributes: DjangoProductAttribute[]): string[] {
  return genericValues(attributes, /^(сезон|season)$/i);
}

function genericValues(attributes: DjangoProductAttribute[], name: RegExp): string[] {
  const found = attributes.find((a) => a.isActive && a.role === "generic" && name.test(a.name.trim()));
  return (found?.values ?? [])
    .filter((v) => v.isActive)
    .sort((a, b) => a.position - b.position)
    .map((v) => v.value);
}

/** Уже заведённое написание значения («Осень-зима 2026», а не «осень-зима 2026»). */
const knownSpelling = (options: string[] | undefined, raw: string): string =>
  options?.find((known) => known.toLowerCase() === raw.toLowerCase()) ?? raw;

/** Цвет варианта, когда в документе только размер, — как у импорта из 1С. */
export const NO_COLOR = "Без цвета";

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

/**
 * Вариант модели — только в вариантной категории и когда задан размер.
 * Цвета может не быть (обувь, однотонное пальто): бэк ставит «Без цвета».
 */
export const isVariantDraft = (draft: NewProductDraft, category: CategoryOption | null | undefined): boolean =>
  Boolean(category?.matrix && draft.size.trim());

/** Имя варианта, как его соберёт генератор матрицы: «Модель, цвет, размер». */
export const variantName = (draft: NewProductDraft): string =>
  `${draft.name.trim()}, ${draft.color.trim() || NO_COLOR}, ${draft.size.trim()}`;

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
  if (draft.season.trim()) input.season = draft.season.trim();
  if (draft.description.trim()) input.description = draft.description.trim();
  if (variant) {
    if (draft.color.trim()) input.color = draft.color.trim();
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
  line: Pick<RecognizedLine, "name" | "color" | "size" | "barcode" | "sku" | "unit" | "productName" | "brand"> &
    Partial<Pick<RecognizedLine, "category" | "sourceName" | "description" | "modelCode" | "details" | "sizes" | "season">>,
  options: {
    units: DjangoUnitOfMeasure[];
    skuIsUnique: boolean;
    brands?: string[];
    seasons?: string[];
    /** Справочник категорий (розница); пусто — категория свободной строкой. */
    categories?: CategoryOption[];
  },
): NewProductDraft {
  const brand = line.brand?.trim() ?? "";
  const kind = line.category?.trim() ?? "";
  const categories = options.categories ?? [];
  // Вид товара из документа («Пальто»): есть в справочнике — берём его,
  // нет — предлагаем завести такую категорию при проведении.
  const known = matchCategory(categories, kind);
  return {
    ...emptyDraft((line.productName || line.name).trim()),
    color: line.color?.trim() ?? "",
    size: line.size?.trim() ?? "",
    // Уже заведённое написание («Zara», а не «ZARA» из документа) — одно
    // значение свойства на бренд, иначе фильтр найдёт только часть товаров.
    brand: knownSpelling(options.brands, brand),
    season: knownSpelling(options.seasons, line.season?.trim() ?? ""),
    barcode: line.barcode?.trim() ?? "",
    sku: options.skuIsUnique ? line.sku?.trim() ?? "" : "",
    unitId: matchUnit(options.units, line.unit)?.id ?? null,
    categoryId: known?.id ?? null,
    newCategory: categories.length > 0 && !known ? kind : "",
    category: categories.length === 0 ? kind : "",
    description: describeRecognized(line),
  };
}

/** Что не так с черновиком — текст для строки, либо null. */
export function draftProblem(
  draft: NewProductDraft,
  options: { categoryRequired: boolean; category: CategoryOption | null | undefined },
): string | null {
  if (!draft.name.trim()) return "Укажите название товара";
  if (options.categoryRequired && draft.categoryId == null && !draft.newCategory.trim()) return "Выберите категорию";
  if (options.category?.matrix && draft.color.trim() && !draft.size.trim()) {
    return "Для варианта с цветом нужен размер";
  }
  return null;
}

/** Размер строки накладной и сколько штук его пришло. */
export interface SizeQuantity {
  size: string;
  /** Количество строкой, как в поле. */
  quantity: string;
}

/** Штук по всем размерам — это и есть количество строки («верхнее» поле). */
export const sizesTotal = (sizes: SizeQuantity[]): number =>
  Math.round(sizes.reduce((sum, row) => sum + toAmount(row.quantity), 0) * 1000) / 1000;

/** Что не так с разбивкой по размерам — текст для строки, либо null. */
export function sizesProblem(sizes: SizeQuantity[]): string | null {
  const seen = new Set<string>();
  for (const row of sizes) {
    const size = row.size.trim();
    if (!size) return "Укажите размер в каждой строке разбивки";
    if (seen.has(size.toLowerCase())) return `Размер ${size} указан дважды`;
    seen.add(size.toLowerCase());
    if (toAmount(row.quantity) <= 0) return `Укажите количество размера ${size}`;
  }
  return null;
}

/**
 * Новая карточка, разложенная по размерам: на каждый размер — своя строка
 * прихода со своим количеством. В вариантной категории это клетки одной
 * модели; в обычной — отдельные карточки «Название, 38». Штрихкод у
 * размеров не общий — его выдаст сервер; артикул получает суффикс размера.
 */
export function sizeLineInputs(
  draft: NewProductDraft,
  category: CategoryOption | null | undefined,
  sizes: SizeQuantity[],
): Array<{ newProduct: GoodsReceiptNewProductInput; quantity: string }> {
  return sizes.map((row) => {
    const size = row.size.trim();
    const sku = draft.sku.trim();
    const perSize: NewProductDraft = { ...draft, size, barcode: "", sku: sku ? `${sku}-${size}` : "" };
    return { newProduct: newProductInput(perSize, category), quantity: String(toAmount(row.quantity)) };
  });
}
