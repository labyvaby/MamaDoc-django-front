import { apiRequest } from "./client";

// ── Types (mirror Django payloads, rename='camel') ───────────────────────────

export type DjangoWarehouse = {
    id: number;
    organizationId: number;
    branchId: number;
    branchName: string;
    name: string;
    address: string;
    isPrimary: boolean;
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
    category: string;
    barcode: string;
    unit: string;
    /** Цена продажи, сом. */
    price: number;
    isInfusion: boolean;
    description: string;
    comment: string;
    isForSale: boolean;
    isActive: boolean;
    imageUrl: string | null;
    /** Остаток по видимым складам контекста. */
    stock: number;
    createdAt: string;
    updatedAt: string;
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

export function getWarehouses(signal?: AbortSignal): Promise<DjangoWarehouse[]> {
    return apiRequest<DjangoWarehouse[]>("/warehouse/warehouses/", { signal });
}

/** Склады других филиалов, доступные для подключения в текущий филиал. */
export function getLinkableWarehouses(
    signal?: AbortSignal,
): Promise<DjangoWarehouse[]> {
    return apiRequest<DjangoWarehouse[]>("/warehouse/warehouses/linkable/", {
        signal,
    });
}

export function createWarehouse(data: {
    name: string;
    address?: string;
    isPrimary?: boolean;
    branchId?: number;
}): Promise<DjangoWarehouse> {
    return apiRequest<DjangoWarehouse>("/warehouse/warehouses/", {
        method: "POST",
        body: data,
    });
}

export function updateWarehouse(
    id: number,
    data: { name?: string; address?: string; isPrimary?: boolean },
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

type RawProduct = Omit<DjangoProduct, "price" | "stock"> & {
    price: string;
    stock: string;
};

const mapProduct = (raw: RawProduct): DjangoProduct => ({
    ...raw,
    price: parseFloat(raw.price) || 0,
    stock: parseFloat(raw.stock) || 0,
});

export async function getProducts(
    signal?: AbortSignal,
    opts: { includeInactive?: boolean; category?: string } = {},
): Promise<DjangoProduct[]> {
    const q = new URLSearchParams();
    if (opts.includeInactive) q.set("includeInactive", "true");
    if (opts.category) q.set("category", opts.category);
    const qs = q.toString();
    const rows = await apiRequest<RawProduct[]>(
        `/warehouse/products/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map(mapProduct);
}

/**
 * Уникальные непустые категории товаров, отсортированные по алфавиту.
 * Права: warehouse.view или warehouse.sales.view.
 */
export function getProductCategories(signal?: AbortSignal): Promise<string[]> {
    return apiRequest<string[]>("/warehouse/products/categories/", { signal });
}

export type ProductWriteData = {
    name?: string;
    category?: string;
    barcode?: string;
    unit?: string;
    description?: string;
    comment?: string;
    isForSale?: boolean;
    isInfusion?: boolean;
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
    formData.append("image", file);
    const raw = await apiRequest<RawProduct>(
        `/warehouse/products/${id}/image/`,
        { method: "PUT", formData },
    );
    return mapProduct(raw);
}

export function deleteProductImage(id: number): Promise<void> {
    return apiRequest<void>(`/warehouse/products/${id}/image/`, {
        method: "DELETE",
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
export function uploadGalleryImage(
    productId: number,
    file: File,
): Promise<DjangoProductImage> {
    const formData = new FormData();
    formData.append("image", file);
    return apiRequest<DjangoProductImage>(
        `/warehouse/products/${productId}/gallery/`,
        { method: "POST", formData },
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
): Promise<DjangoStockItem[]> {
    const qs = warehouseId !== undefined ? `?warehouseId=${warehouseId}` : "";
    const rows = await apiRequest<RawStockItem[]>(`/warehouse/stock/${qs}`, {
        signal,
    });
    return rows.map(mapStockItem);
}

// ── Movements ───────────────────────────────────────────────────────────────

export async function getStockMovements(
    filters: { productId?: number; warehouseId?: number; limit?: number } = {},
    signal?: AbortSignal,
): Promise<DjangoStockMovement[]> {
    const q = new URLSearchParams();
    if (filters.productId !== undefined) q.set("productId", String(filters.productId));
    if (filters.warehouseId !== undefined) q.set("warehouseId", String(filters.warehouseId));
    if (filters.limit !== undefined) q.set("limit", String(filters.limit));
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
