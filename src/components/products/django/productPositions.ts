import { productAvailableStock, type DjangoProduct, type DjangoProductModel } from "../../../api/warehouse";

/**
 * Сборка плоского списка товаров в позиции.
 *
 * Список с бэка приходит по одной строке на SKU: у модели одежды из двух цветов
 * и трёх размеров это шесть строк «Пальто, Бежевый, 42» подряд. Читать такой
 * список невозможно, поэтому строки склеиваются в позицию по `modelId`, а
 * различия уезжают на второй уровень.
 *
 * Ось разреза здесь НЕ «цвет и размер»: это любой атрибут, у которого внутри
 * позиции больше одного значения. Для одежды получится Цвет × Размер, для
 * аптеки — Форма × Дозировка, для мази — один Объём. Атрибут с единственным
 * значением осью не считается: он одинаковый у всех вариантов, и его место в
 * подписи позиции, а не в разрезе.
 */

export type AttributeRole = "generic" | "color" | "size";

export type PositionAxis = {
    attributeId: number;
    name: string;
    role: AttributeRole;
    /** Значения в порядке первой встречи — бэк порядок в списке товаров не отдаёт. */
    values: string[];
};

export type PositionVariant = {
    product: DjangoProduct;
    /** Значения по осям позиции, в порядке `axes`. Пусто, если осей нет. */
    values: string[];
    /** Готовая подпись варианта: «Бежевый · 42» либо хвост названия. */
    label: string;
};

export type ProductPosition = {
    /** Стабильный ключ строки: модель или одиночный товар. */
    key: string;
    modelId: number | null;
    name: string;
    category: string;
    sku: string | null;
    unit: string;
    imageUrl: string | null;
    axes: PositionAxis[];
    variants: PositionVariant[];
    /** Атрибуты, одинаковые у всех вариантов: «Бренд: Monogram». */
    constants: Array<{ name: string; role: AttributeRole; value: string }>;
    /** Одиночный товар без разреза — строка не раскрывается. */
    single: boolean;
    priceMin: number;
    priceMax: number;
    /** Сумма доступных остатков (branchStock, если известен). */
    stock: number;
    /** Сколько вариантов с нулевым остатком. */
    outCount: number;
    /** Все штрихкоды позиции — по ним же идёт поиск. */
    barcodes: string[];
};

const bucketKey = (product: DjangoProduct): string =>
    product.modelId != null ? `m${product.modelId}` : `p${product.id}`;

/** «Пальто шерстяное oversize, Бежевый, 42» → «Пальто шерстяное oversize». */
const baseName = (name: string): string => {
    const comma = name.indexOf(",");
    return comma > 0 ? name.slice(0, comma).trim() : name.trim();
};

/** Хвост названия варианта, когда атрибутов у товара нет: «Бежевый, 42». */
const nameTail = (name: string, base: string): string => {
    const rest = name.startsWith(base) ? name.slice(base.length) : "";
    return rest.replace(/^\s*,\s*/, "").trim();
};

function buildPosition(
    products: DjangoProduct[],
    modelNames: Map<number, string>,
): ProductPosition {
    const first = products[0];
    const modelId = first.modelId ?? null;
    const name =
        (modelId != null ? modelNames.get(modelId) : undefined) ?? baseName(first.name);

    // Собираем значения каждого атрибута по всем вариантам позиции.
    const seen = new Map<number, { name: string; role: AttributeRole; values: string[] }>();
    for (const product of products) {
        for (const attribute of product.attributes ?? []) {
            const entry = seen.get(attribute.attributeId) ?? {
                name: attribute.attributeName,
                role: attribute.role,
                values: [],
            };
            if (!entry.values.includes(attribute.value)) entry.values.push(attribute.value);
            seen.set(attribute.attributeId, entry);
        }
    }

    const axes: PositionAxis[] = [];
    const constants: ProductPosition["constants"] = [];
    for (const [attributeId, entry] of seen) {
        if (entry.values.length > 1) {
            axes.push({ attributeId, name: entry.name, role: entry.role, values: entry.values });
        } else if (entry.values.length === 1) {
            constants.push({ name: entry.name, role: entry.role, value: entry.values[0] });
        }
    }

    const variants: PositionVariant[] = products.map((product) => {
        const values = axes.map((axis) => {
            const hit = (product.attributes ?? []).find((a) => a.attributeId === axis.attributeId);
            return hit?.value ?? "—";
        });
        const label = values.length ? values.join(" · ") : nameTail(product.name, name) || product.name;
        return { product, values, label };
    });

    // Порядок вариантов — по осям, чтобы «42, 44, 46» не прыгали случайно.
    variants.sort((a, b) => {
        for (let i = 0; i < axes.length; i += 1) {
            const diff = axes[i].values.indexOf(a.values[i]) - axes[i].values.indexOf(b.values[i]);
            if (diff !== 0) return diff;
        }
        return a.product.name.localeCompare(b.product.name, "ru");
    });

    const prices = products.map((product) => product.price);
    const barcodes = [
        ...new Set(
            products.flatMap((product) => [product.barcode, ...(product.barcodes ?? [])]).filter(Boolean),
        ),
    ];

    return {
        key: bucketKey(first),
        modelId,
        name,
        category: first.category || "",
        sku: first.sku ?? null,
        unit: first.unit || "шт",
        imageUrl: products.find((product) => product.imageUrl)?.imageUrl ?? null,
        axes,
        variants,
        constants,
        single: products.length === 1 && modelId == null,
        priceMin: Math.min(...prices),
        priceMax: Math.max(...prices),
        stock: products.reduce((sum, product) => sum + productAvailableStock(product), 0),
        outCount: products.filter((product) => productAvailableStock(product) <= 0).length,
        barcodes,
    };
}

export function buildPositions(
    products: DjangoProduct[],
    models: DjangoProductModel[] = [],
): ProductPosition[] {
    const modelNames = new Map(models.map((model) => [model.id, model.name]));
    const buckets = new Map<string, DjangoProduct[]>();
    for (const product of products) {
        const key = bucketKey(product);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(product);
        else buckets.set(key, [product]);
    }
    return [...buckets.values()].map((bucket) => buildPosition(bucket, modelNames));
}

/**
 * Поиск обязан пробивать позицию насквозь: продавец вводит «Хаки», «46» или
 * сканирует штрихкод варианта. Совпадение внутри варианта показывает всю
 * позицию — иначе строка молча исчезает, ведь своего штрихкода у неё нет.
 */
export function positionMatches(position: ProductPosition, query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    if (position.name.toLowerCase().includes(needle)) return true;
    if (position.category.toLowerCase().includes(needle)) return true;
    if (position.sku && position.sku.toLowerCase().includes(needle)) return true;
    if (position.barcodes.some((code) => code.toLowerCase().includes(needle))) return true;
    return position.variants.some(
        (variant) =>
            variant.label.toLowerCase().includes(needle) ||
            variant.product.name.toLowerCase().includes(needle) ||
            (variant.product.sku ?? "").toLowerCase().includes(needle),
    );
}

/** Какие варианты подсветить после поиска — совпавшие, а не все подряд. */
export function matchedVariantIds(position: ProductPosition, query: string): Set<number> {
    const needle = query.trim().toLowerCase();
    if (!needle) return new Set();
    return new Set(
        position.variants
            .filter(
                (variant) =>
                    variant.label.toLowerCase().includes(needle) ||
                    variant.product.name.toLowerCase().includes(needle) ||
                    (variant.product.sku ?? "").toLowerCase().includes(needle) ||
                    variant.product.barcode.toLowerCase().includes(needle) ||
                    (variant.product.barcodes ?? []).some((code) =>
                        code.toLowerCase().includes(needle),
                    ),
            )
            .map((variant) => variant.product.id),
    );
}
