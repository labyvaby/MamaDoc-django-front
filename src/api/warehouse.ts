import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

// ── Types (mirror Django payloads, rename='camel') ───────────────────────────

export type DjangoWarehouse = {
    id: number;
    organizationId: number;
    branchId: number;
    branchName: string;
    name: string;
    address: string;
    isPrimary: boolean;
    /** Склад продаж: продажи товаров списываются с него (иначе — с основного). */
    isSales: boolean;
    /** Склад другого филиала, подключённый в текущий контекст. */
    isLinked: boolean;
    createdAt: string;
    updatedAt: string;
};

export type DjangoStockItem = {
    warehouseId: number;
    productId: number;
    quantity: number;
    lastUpdated: string | null;
    productName: string;
    productCategory: string;
    productBarcode: string;
    productUnit: string;
    productImageUrl: string | null;
    warehouseName: string;
    warehouseAddress: string;
};

export type MoveType =
    | "receipt"
    | "consumption"
    | "adjustment"
    | "transfer_in"
    | "transfer_out";

export type DjangoStockMovement = {
    id: number;
    warehouseId: number;
    productId: number;
    productName: string;
    /** Со знаком: приход положительный, расход отрицательный. */
    quantity: number;
    moveType: MoveType;
    paymentMethod: "cash" | "cashless" | null;
    /** Способ безнала из справочника — только при paymentMethod === "cashless" */
    cashlessMethodId?: number | null;
    cashlessMethodName?: string | null;
    /** Сумма операции (закупки/списания), сом. */
    totalCost: number | null;
    referenceType: string;
    referenceId: number | null;
    comment: string;
    createdByName: string | null;
    createdAt: string;
};

export type DjangoProduct = {
    id: number;
    organizationId: number;
    name: string;
    /** Артикул SKU; у вариантов одежды генерируется из префикса модели. */
    sku?: string | null;
    category: string;
    categoryId?: number | null;
    barcode: string;
    barcodes?: string[];
    /** Родительская модель одежды; null у обычного товара. */
    modelId?: number | null;
    attributes?: DjangoProductAttributeValue[];
    unit: string;
    /** Цена продажи, сом. */
    price: number;
    isInfusion: boolean;
    /**
     * Товар-вакцина. Источник истины для раздела «Прививки» с 23.07.2026
     * (миграция warehouse.0005 проставила флаг товарам категории «Вакцины»,
     * дальше — только boolean). Переключение в true авто-создаёт/активирует
     * медкарточку вакцины на бэке.
     */
    isVaccine: boolean;
    description: string;
    comment: string;
    isForSale: boolean;
    isActive: boolean;
    imageUrl: string | null;
    /** Остаток по видимым складам контекста (агрегат — может включать чужие). */
    stock: number;
    /**
     * Остаток на складе, с которого спишется товар в приёме филиала (правило
     * бэка: склад продаж `isSales` → основной `isPrimary` → минимальный id
     * филиала). Заполняется только при явном `branchId` в запросе, иначе `null`
     * — контракт от 03.08.2026, закрыл тикет `backend_ticket_product_stock_
     * branch_scoping.md`. Именно по этой цифре бэк валидирует сохранение приёма,
     * поэтому в пикерах товара показываем и фильтруем по ней, а не по `stock`.
     */
    branchStock: number | null;
    createdAt: string;
    updatedAt: string;
};

export type DjangoProductAttributeValue = {
    attributeId: number;
    attributeName: string;
    role: "generic" | "color" | "size";
    valueId: number;
    value: string;
};

export type DjangoProductAttributeValueOption = {
    id: number;
    attributeId: number;
    value: string;
    code: string;
    position: number;
    isActive: boolean;
};

export type DjangoProductAttribute = {
    id: number;
    organizationId: number;
    name: string;
    role: "generic" | "color" | "size";
    isOrdered: boolean;
    isActive: boolean;
    values: DjangoProductAttributeValueOption[];
};

export type DjangoProductCategoryNode = {
    id: number;
    organizationId: number;
    name: string;
    parentId: number | null;
    /** Поля, выбранные администратором для этой категории. */
    attributeIds: number[];
    isActive: boolean;
    productCount: number;
    createdAt: string;
    updatedAt: string;
};

export type DjangoProductModel = {
    id: number;
    organizationId: number;
    name: string;
    skuPrefix: string;
    categoryId: number | null;
    categoryName: string | null;
    description: string;
    isActive: boolean;
    productCount: number;
    createdAt: string;
    updatedAt: string;
};

export type DjangoProductMatrix = {
    modelId: number;
    modelName: string;
    rows: Array<{ valueId: number; value: string; code: string; position: number }>;
    columns: Array<{ valueId: number; value: string; code: string; position: number }>;
    cells: Array<{
        rowValueId: number | null;
        columnValueId: number | null;
        productId: number;
        sku: string | null;
        name: string;
        price: string;
        stock: string;
    }>;
    rowTotal: number;
    columnTotal: number;
    filled: number;
};

/** Перемещение товара между складами (GET источник — лента движений). */
export type DjangoTransfer = {
    id: number;
    productId: number;
    productName: string;
    fromWarehouseId: number;
    fromWarehouseName: string;
    toWarehouseId: number;
    toWarehouseName: string;
    /** Точное перемещённое количество. */
    quantity: number;
    comment: string;
    createdByName: string | null;
    createdAt: string;
};

/** Изображение из галереи товара (до 5 на товар). */
export type DjangoProductImage = {
    id: number;
    /** Абсолютная ссылка на изображение. */
    url: string;
    /** Является ли основным фото товара. */
    isPrimary: boolean;
    /** Порядок сортировки. */
    order: number;
};

/** Запись истории изменения цены продажи товара. */
export type DjangoPriceHistoryEntry = {
    /** Новая цена продажи, сом. */
    price: number;
    changedByName: string | null;
    changedAt: string;
};

// ── Raw payloads (decimal-safe strings from the backend) ─────────────────────

type RawStockItem = Omit<DjangoStockItem, "quantity"> & { quantity: string };
type RawMovement = Omit<DjangoStockMovement, "quantity" | "totalCost"> & {
    quantity: string;
    totalCost: string | null;
};

const mapStockItem = (raw: RawStockItem): DjangoStockItem => ({
    ...raw,
    quantity: parseFloat(raw.quantity) || 0,
});

const mapMovement = (raw: RawMovement): DjangoStockMovement => ({
    ...raw,
    quantity: parseFloat(raw.quantity) || 0,
    totalCost: raw.totalCost === null ? null : parseFloat(raw.totalCost) || 0,
});

// ── Warehouses ───────────────────────────────────────────────────────────────

export function getWarehouses(
    signal?: AbortSignal,
    /** Явный орг-контекст для суперпользователя/мультиорг (как в tasks API). */
    organizationId?: number,
): Promise<DjangoWarehouse[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoWarehouse[]>(`/warehouse/warehouses/${qs}`, { signal });
}

/** Склады других филиалов, доступные для подключения в текущий филиал. */
export function getLinkableWarehouses(
    signal?: AbortSignal,
    /** Обязателен суперпользователю: без него бэк отдаёт 400 (фикс 29.07.2026). */
    organizationId?: number,
): Promise<DjangoWarehouse[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoWarehouse[]>(`/warehouse/warehouses/linkable/${qs}`, {
        signal,
    });
}

export function createWarehouse(data: {
    name: string;
    address?: string;
    isPrimary?: boolean;
    isSales?: boolean;
    branchId?: number;
}): Promise<DjangoWarehouse> {
    return apiRequest<DjangoWarehouse>("/warehouse/warehouses/", {
        method: "POST",
        body: data,
    });
}

export function updateWarehouse(
    id: number,
    data: { name?: string; address?: string; isPrimary?: boolean; isSales?: boolean },
): Promise<DjangoWarehouse> {
    return apiRequest<DjangoWarehouse>(`/warehouse/warehouses/${id}/`, {
        method: "PATCH",
        body: data,
    });
}

/** Подключить склад другого филиала в текущий (или указанный) филиал. */
export function linkWarehouse(
    id: number,
    branchId?: number,
): Promise<DjangoWarehouse> {
    return apiRequest<DjangoWarehouse>(`/warehouse/warehouses/${id}/links/`, {
        method: "POST",
        body: branchId !== undefined ? { branchId } : {},
    });
}

/** Отключить ранее подключённый склад от текущего (или указанного) филиала. */
export function unlinkWarehouse(id: number, branchId?: number): Promise<void> {
    const qs = branchId !== undefined ? `?branchId=${branchId}` : "";
    return apiRequest<void>(`/warehouse/warehouses/${id}/links/${qs}`, {
        method: "DELETE",
    });
}

// ── Products ────────────────────────────────────────────────────────────────

type RawProduct = Omit<DjangoProduct, "price" | "stock" | "branchStock"> & {
    price: string;
    stock: string;
    /** null без branchId в запросе; на эндпоинтах записи товара поля нет вовсе. */
    branchStock?: string | null;
};

const mapProduct = (raw: RawProduct): DjangoProduct => ({
    ...raw,
    price: parseFloat(raw.price) || 0,
    stock: parseFloat(raw.stock) || 0,
    // Отсутствие поля и null — одно и то же: остаток филиала неизвестен. «0»
    // отличаем от «неизвестно», иначе пикер скроет товар, который есть.
    branchStock: raw.branchStock == null ? null : parseFloat(raw.branchStock) || 0,
});

export async function getProducts(
    signal?: AbortSignal,
    opts: {
        includeInactive?: boolean;
        category?: string;
        /** Только товары-вакцины (?isVaccine=true) — для пикеров раздела «Прививки». */
        isVaccine?: boolean;
        organizationId?: number;
        /**
         * Филиал контекста: включает в ответе `branchStock` — остаток склада, с
         * которого товар спишется в приёме этого филиала (реальный фильтр с
         * 03.08.2026; раньше параметр молча игнорировался). Суперпользователю
         * нужен явно — сессионного филиала у него нет.
         */
        branchId?: number;
    } = {},
): Promise<DjangoProduct[]> {
    const q = new URLSearchParams();
    if (opts.includeInactive) q.set("includeInactive", "true");
    if (opts.category) q.set("category", opts.category);
    if (opts.isVaccine != null) q.set("isVaccine", String(opts.isVaccine));
    if (opts.organizationId != null) q.set("organizationId", String(opts.organizationId));
    if (opts.branchId != null) q.set("branchId", String(opts.branchId));
    const qs = q.toString();
    const rows = await apiRequest<RawProduct[]>(
        `/warehouse/products/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map(mapProduct);
}

/**
 * Остаток, по которому фронт судит о доступности товара: остаток склада филиала,
 * если он известен (запрос с `branchId`), иначе агрегат `stock`. Именно
 * `branchStock` бэк проверяет при списании в приёме — см. поле в `DjangoProduct`.
 */
export const productAvailableStock = (
    p: Pick<DjangoProduct, "stock" | "branchStock">,
): number => p.branchStock ?? p.stock;

/**
 * Уникальные непустые категории товаров, отсортированные по алфавиту.
 * Права: warehouse.view или warehouse.sales.view.
 */
export function getProductCategories(
    signal?: AbortSignal,
    /** Обязателен суперпользователю: без него бэк отдаёт 400 (фикс 29.07.2026). */
    organizationId?: number,
): Promise<string[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<string[]>(`/warehouse/products/categories/${qs}`, { signal });
}

export type ProductWriteData = {
    name?: string;
    category?: string;
    categoryId?: number;
    barcode?: string;
    unit?: string;
    description?: string;
    comment?: string;
    isForSale?: boolean;
    isInfusion?: boolean;
    /** Переключение в true авто-создаёт/активирует медкарточку вакцины на бэке. */
    isVaccine?: boolean;
    price?: number;
};

export async function createProduct(
    data: ProductWriteData & { name: string; initialStock?: number },
): Promise<DjangoProduct> {
    const raw = await apiRequest<RawProduct>("/warehouse/products/", {
        method: "POST",
        body: data,
    });
    return mapProduct(raw);
}

export async function updateProduct(
    id: number,
    data: ProductWriteData & { stock?: number },
): Promise<DjangoProduct> {
    const raw = await apiRequest<RawProduct>(`/warehouse/products/${id}/`, {
        method: "PATCH",
        body: data,
    });
    return mapProduct(raw);
}

/**
 * Удаление товара. Возвращает архивированный товар (isActive=false),
 * если по нему была история движений/продаж, иначе null (физически удалён).
 */
export async function deleteProduct(
    id: number,
): Promise<DjangoProduct | null> {
    const raw = await apiRequest<RawProduct | undefined>(
        `/warehouse/products/${id}/`,
        { method: "DELETE" },
    );
    return raw ? mapProduct(raw) : null;
}

export async function uploadProductImage(
    id: number,
    file: File,
): Promise<DjangoProduct> {
    const formData = new FormData();
    // Ужимаем и переводим в jpg: тяжёлый снимок бэк отвергает — см. api/uploads.ts.
    formData.append("image", await preparePhotoOrThrow(file));
    const raw = await withUploadErrors(() =>
        apiRequest<RawProduct>(
            `/warehouse/products/${id}/image/`,
            { method: "PUT", formData },
        ),
    );
    return mapProduct(raw);
}

export function deleteProductImage(id: number): Promise<void> {
    return apiRequest<void>(`/warehouse/products/${id}/image/`, {
        method: "DELETE",
    });
}

// ── Retail catalogue: attributes, categories and apparel matrices (v2) ─────

export function getProductCategoryTree(
    signal?: AbortSignal,
    organizationId?: number,
): Promise<DjangoProductCategoryNode[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductCategoryNode[]>(`/v2/warehouse/product-categories/${qs}`, { signal });
}

export function createProductCategory(data: {
    name: string;
    parentId?: number;
    attributeIds?: number[];
    organizationId?: number;
}): Promise<DjangoProductCategoryNode> {
    const { organizationId, ...body } = data;
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductCategoryNode>(`/v2/warehouse/product-categories/${qs}`, {
        method: "POST",
        body,
    });
}

export function updateProductCategory(
    id: number,
    data: { name?: string; parentId?: number; clearParent?: boolean; attributeIds?: number[]; isActive?: boolean },
): Promise<DjangoProductCategoryNode> {
    return apiRequest<DjangoProductCategoryNode>(`/v2/warehouse/product-categories/${id}/`, {
        method: "PATCH",
        body: data,
    });
}

export function getProductAttributes(
    signal?: AbortSignal,
    organizationId?: number,
): Promise<DjangoProductAttribute[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductAttribute[]>(`/v2/warehouse/product-attributes/${qs}`, { signal });
}

export function createProductAttribute(data: {
    name: string;
    role: DjangoProductAttribute["role"];
    isOrdered?: boolean;
    organizationId?: number;
}): Promise<DjangoProductAttribute> {
    const { organizationId, ...body } = data;
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductAttribute>(`/v2/warehouse/product-attributes/${qs}`, {
        method: "POST",
        body,
    });
}

export function createProductAttributeValue(
    attributeId: number,
    data: { value: string; code?: string; position?: number },
): Promise<DjangoProductAttributeValueOption> {
    return apiRequest<DjangoProductAttributeValueOption>(
        `/v2/warehouse/product-attributes/${attributeId}/values/`,
        { method: "POST", body: data },
    );
}

export function updateProductAttribute(
    id: number,
    data: { name?: string; isOrdered?: boolean; isActive?: boolean },
): Promise<DjangoProductAttribute> {
    return apiRequest<DjangoProductAttribute>(`/v2/warehouse/product-attributes/${id}/`, {
        method: "PATCH",
        body: data,
    });
}

export function deleteProductAttribute(id: number): Promise<void> {
    return apiRequest<void>(`/v2/warehouse/product-attributes/${id}/`, {
        method: "DELETE",
    });
}

export function updateProductAttributeValue(
    id: number,
    data: { value?: string; code?: string; position?: number; isActive?: boolean },
): Promise<DjangoProductAttributeValueOption> {
    return apiRequest<DjangoProductAttributeValueOption>(`/v2/warehouse/attribute-values/${id}/`, {
        method: "PATCH",
        body: data,
    });
}

export function deleteProductAttributeValue(id: number): Promise<void> {
    return apiRequest<void>(`/v2/warehouse/attribute-values/${id}/`, {
        method: "DELETE",
    });
}

/** Сохраняет поля, заданные администратором (бренд, материал, сезон и т. п.). */
export function replaceProductGenericAttributes(
    productId: number,
    attributeValueIds: number[],
): Promise<DjangoProductAttributeValue[]> {
    return apiRequest<DjangoProductAttributeValue[]>(
        `/v2/warehouse/products/${productId}/attributes/`,
        { method: "PUT", body: { attributeValueIds } },
    );
}

export function getProductModels(
    signal?: AbortSignal,
    organizationId?: number,
): Promise<DjangoProductModel[]> {
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductModel[]>(`/v2/warehouse/product-models/${qs}`, { signal });
}

export function createProductModel(data: {
    name: string;
    skuPrefix?: string;
    categoryId?: number;
    description?: string;
    organizationId?: number;
}): Promise<DjangoProductModel> {
    const { organizationId, ...body } = data;
    const qs = organizationId != null ? `?organizationId=${organizationId}` : "";
    return apiRequest<DjangoProductModel>(`/v2/warehouse/product-models/${qs}`, {
        method: "POST",
        body,
    });
}

export function generateProductMatrix(data: {
    modelId: number;
    rowValueIds: number[];
    columnValueIds: number[];
    /** Бренд, сезон, состав и другие свойства, одинаковые для всей модели. */
    attributeValueIds?: number[];
    price: number;
    unit?: string;
    generateBarcodes?: boolean;
}): Promise<DjangoProductMatrix> {
    const { modelId, ...body } = data;
    return apiRequest<DjangoProductMatrix>(`/v2/warehouse/product-models/${modelId}/matrix/`, {
        method: "POST",
        body,
    });
}

// ── Product gallery (до 5 изображений) ───────────────────────────────────────

/** Галерея изображений товара (порядок — по полю order). */
export function getProductGallery(
    productId: number,
    signal?: AbortSignal,
): Promise<DjangoProductImage[]> {
    return apiRequest<DjangoProductImage[]>(
        `/warehouse/products/${productId}/gallery/`,
        { signal },
    );
}

/** Загрузка нового изображения в галерею (максимум 5 на товар). */
export async function uploadGalleryImage(
    productId: number,
    file: File,
): Promise<DjangoProductImage> {
    const formData = new FormData();
    formData.append("image", await preparePhotoOrThrow(file));
    return withUploadErrors(() =>
        apiRequest<DjangoProductImage>(
            `/warehouse/products/${productId}/gallery/`,
            { method: "POST", formData },
        ),
    );
}

/**
 * Обновление параметров изображения (сортировка, основное).
 * При isPrimary=true у остальных изображений товара флаг сбросится.
 */
export function updateGalleryImage(
    productId: number,
    imageId: number,
    data: { isPrimary?: boolean; order?: number },
): Promise<DjangoProductImage> {
    return apiRequest<DjangoProductImage>(
        `/warehouse/products/${productId}/gallery/${imageId}/`,
        { method: "PATCH", body: data },
    );
}

/**
 * Удаление изображения из галереи. Если удалено основное, бэкенд
 * автоматически выберет следующее по порядку в качестве основного.
 */
export function deleteGalleryImage(
    productId: number,
    imageId: number,
): Promise<void> {
    return apiRequest<void>(
        `/warehouse/products/${productId}/gallery/${imageId}/`,
        { method: "DELETE" },
    );
}

// ── Price history ─────────────────────────────────────────────────────────────

type RawPriceHistoryEntry = Omit<DjangoPriceHistoryEntry, "price"> & {
    price: string;
};

/**
 * История изменения цены продажи товара (самые новые сверху).
 * Права: warehouse.view или warehouse.sales.view.
 */
export async function getProductPriceHistory(
    productId: number,
    signal?: AbortSignal,
): Promise<DjangoPriceHistoryEntry[]> {
    const rows = await apiRequest<RawPriceHistoryEntry[]>(
        `/warehouse/products/${productId}/price-history/`,
        { signal },
    );
    return rows.map((r) => ({
        ...r,
        price: parseFloat(r.price) || 0,
    }));
}

// ── Stock (Inventory) ───────────────────────────────────────────────────────

export async function getStock(
    warehouseId?: number,
    signal?: AbortSignal,
    /** Явный орг-контекст для суперпользователя/мультиорг (как в getWarehouses). */
    organizationId?: number,
): Promise<DjangoStockItem[]> {
    const q = new URLSearchParams();
    if (warehouseId !== undefined) q.set("warehouseId", String(warehouseId));
    if (organizationId != null) q.set("organizationId", String(organizationId));
    const qs = q.toString();
    const rows = await apiRequest<RawStockItem[]>(
        `/warehouse/stock/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map(mapStockItem);
}

// ── Movements ───────────────────────────────────────────────────────────────

export async function getStockMovements(
    filters: {
        productId?: number;
        warehouseId?: number;
        limit?: number;
        organizationId?: number;
        /**
         * Движения одного способа безналичной оплаты — нужен после 409 при
         * удалении способа, чтобы показать сами операции (см.
         * api/cashlessMethods.ts).
         */
        cashlessMethodId?: number;
    } = {},
    signal?: AbortSignal,
): Promise<DjangoStockMovement[]> {
    const q = new URLSearchParams();
    if (filters.productId !== undefined) q.set("productId", String(filters.productId));
    if (filters.warehouseId !== undefined) q.set("warehouseId", String(filters.warehouseId));
    if (filters.cashlessMethodId !== undefined) q.set("cashlessMethodId", String(filters.cashlessMethodId));
    if (filters.limit !== undefined) q.set("limit", String(filters.limit));
    if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
    const qs = q.toString();
    const rows = await apiRequest<RawMovement[]>(
        `/warehouse/movements/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map(mapMovement);
}

export async function createStockMovement(data: {
    warehouseId: number;
    /** Всегда положительное; знак сервер выставит по moveType. */
    quantity: number;
    moveType: "receipt" | "consumption" | "adjustment";
    productId?: number;
    /** Создать (или переиспользовать) товар по имени на лету. */
    newProductName?: string;
    totalCost?: number;
    paymentMethod?: "cash" | "cashless";
    /** Способ безнала — шлём только при paymentMethod === "cashless" */
    cashlessMethodId?: number;
    comment?: string;
}): Promise<DjangoStockMovement> {
    const raw = await apiRequest<RawMovement>("/warehouse/movements/", {
        method: "POST",
        body: data,
    });
    return mapMovement(raw);
}

export async function updateStockMovement(
    id: number,
    data: {
        quantity?: number;
        totalCost?: number;
        paymentMethod?: "cash" | "cashless";
        cashlessMethodId?: number;
        comment?: string;
    },
): Promise<DjangoStockMovement> {
    const raw = await apiRequest<RawMovement>(`/warehouse/movements/${id}/`, {
        method: "PATCH",
        body: data,
    });
    return mapMovement(raw);
}

// ── Transfers (перемещение между складами) ───────────────────────────────────

type RawTransfer = Omit<DjangoTransfer, "quantity"> & { quantity: string };

/**
 * Создание перемещения товара между складами. Права: warehouse.manage.
 * Порождает пару движений transfer_out/transfer_in в ленте движений.
 */
export async function createTransfer(data: {
    productId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    /** Точное количество (положительное). */
    quantity: number;
    comment?: string;
}): Promise<DjangoTransfer> {
    const raw = await apiRequest<RawTransfer>("/warehouse/transfers/", {
        method: "POST",
        body: data,
    });
    return { ...raw, quantity: parseFloat(raw.quantity) || 0 };
}

// ── Warehouse documents (v2) ────────────────────────────────────────────────

export type WarehouseInventoryCount = {
    id: number;
    organizationId: number;
    warehouseId: number;
    warehouseName: string;
    status: string;
    comment: string;
    lineTotal: number;
    countedTotal: number;
    startedByName: string | null;
    completedByName: string | null;
    createdAt: string;
    completedAt: string | null;
};

export type WarehouseInventoryLine = {
    id: number;
    productId: number;
    productName: string;
    sku: string | null;
    modelId: number | null;
    attributes: Array<{ attributeId: number; attributeName: string; role: string; value: string; valueId: number }>;
    expected: string | null;
    counted: string | null;
    difference: string | null;
    countedAt: string | null;
    scannedByName: string | null;
};

export type WarehouseInventoryDetail = {
    document: WarehouseInventoryCount;
    lines: WarehouseInventoryLine[];
};

export type WarehouseReprice = {
    id: number;
    organizationId: number;
    branchId: number | null;
    branchName: string | null;
    mode: string;
    status: string;
    comment: string;
    lineTotal: number;
    skippedCount: number;
    markupPercent: string | null;
    exchangeRateId: number | null;
    exchangeRateCurrency: string | null;
    exchangeRateValue: string | null;
    createdByName: string | null;
    createdAt: string;
    appliedAt: string | null;
};

export type WarehouseRepriceLine = {
    id: number;
    productId: number;
    productName: string;
    sku: string | null;
    modelId: number | null;
    attributes: Array<{ attributeId: number; attributeName: string; role: string; value: string; valueId: number }>;
    oldPrice: string;
    newPrice: string;
    difference: string;
};

export type WarehouseRepriceDetail = {
    document: WarehouseReprice;
    lines: WarehouseRepriceLine[];
    skippedProductIds: number[];
};

const withQuery = (path: string, params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.set(key, String(value));
    }
    return query.size ? `${path}?${query}` : path;
};

export function getInventoryCounts(
    params: { warehouseId?: number; status?: string; organizationId?: number } = {},
    signal?: AbortSignal,
): Promise<WarehouseInventoryCount[]> {
    return apiRequest<WarehouseInventoryCount[]>(
        withQuery("/v2/warehouse/inventory-counts/", params),
        { signal },
    );
}

export function startWarehouseInventoryCount(data: {
    warehouseId: number;
    productIds?: number[];
    comment?: string;
    organizationId?: number;
}): Promise<WarehouseInventoryDetail> {
    const { organizationId, ...body } = data;
    return apiRequest<WarehouseInventoryDetail>(withQuery("/v2/warehouse/inventory-counts/", { organizationId }), {
        method: "POST",
        body,
    });
}

export function getInventoryCountDetail(
    id: number,
    organizationId?: number,
    signal?: AbortSignal,
): Promise<WarehouseInventoryDetail> {
    return apiRequest<WarehouseInventoryDetail>(
        withQuery(`/v2/warehouse/inventory-counts/${id}/`, { organizationId }),
        { signal },
    );
}

export function submitInventoryCountLines(
    id: number,
    lines: Array<{ productId: number; quantity: string }>,
    organizationId?: number,
): Promise<WarehouseInventoryDetail> {
    return apiRequest<WarehouseInventoryDetail>(withQuery(`/v2/warehouse/inventory-counts/${id}/lines/`, { organizationId }), {
        method: "POST",
        body: { lines },
    });
}

export function closeWarehouseInventoryCount(id: number, organizationId?: number): Promise<{
    document: WarehouseInventoryCount;
    lines: WarehouseInventoryLine[];
    movements: DjangoStockMovement[];
}> {
    return apiRequest(withQuery(`/v2/warehouse/inventory-counts/${id}/close/`, { organizationId }), {
        method: "POST",
        body: {},
    });
}

export function cancelWarehouseInventoryCount(id: number, organizationId?: number): Promise<WarehouseInventoryDetail> {
    return apiRequest<WarehouseInventoryDetail>(withQuery(`/v2/warehouse/inventory-counts/${id}/cancel/`, { organizationId }), {
        method: "POST",
        body: {},
    });
}

export function getRepriceDocuments(
    params: { status?: string; branchId?: number; mode?: string; organizationId?: number } = {},
    signal?: AbortSignal,
): Promise<WarehouseReprice[]> {
    return apiRequest<WarehouseReprice[]>(
        withQuery("/v2/warehouse/reprices/", params),
        { signal },
    );
}

export function createRepriceDraft(data: {
    branchId?: number;
    mode: "fixed" | "markup" | "rate";
    products: Array<{ productId: number; newPrice?: string }>;
    markupPercent?: string;
    exchangeRateId?: number;
    attributeValueIds?: number[];
    comment?: string;
    organizationId?: number;
}): Promise<WarehouseRepriceDetail> {
    const { organizationId, ...body } = data;
    return apiRequest<WarehouseRepriceDetail>(withQuery("/v2/warehouse/reprices/", { organizationId }), {
        method: "POST",
        body,
    });
}

export function getRepriceDetail(id: number, organizationId?: number, signal?: AbortSignal) {
    return apiRequest<WarehouseRepriceDetail>(
        withQuery(`/v2/warehouse/reprices/${id}/`, { organizationId }),
        { signal },
    );
}

export function applyReprice(id: number, organizationId?: number): Promise<WarehouseRepriceDetail> {
    return apiRequest<WarehouseRepriceDetail>(withQuery(`/v2/warehouse/reprices/${id}/apply/`, { organizationId }), {
        method: "POST",
        body: {},
    });
}

export function cancelReprice(id: number, organizationId?: number): Promise<WarehouseRepriceDetail> {
    return apiRequest<WarehouseRepriceDetail>(withQuery(`/v2/warehouse/reprices/${id}/cancel/`, { organizationId }), {
        method: "POST",
        body: {},
    });
}
