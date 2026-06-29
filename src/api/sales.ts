import { apiRequest } from "./client";

// ── Types (mirror Django Sale payloads, rename='camel') ─────────────────────

export type SaleStatus = "open" | "partial" | "paid";

/** Источник записи: самостоятельная продажа склада или товары из приёма. */
export type SaleSource = "sale" | "appointment";

export type DjangoSaleLine = {
    id: number;
    productId: number;
    productName: string;
    productImageUrl: string | null;
    quantity: number;
    price: number;
    total: number;
};

export type DjangoSale = {
    id: number;
    organizationId: number;
    branchId: number;
    warehouseId: number;
    patientId: number | null;
    patientName: string | null;
    patientPhone: string | null;
    patientAvatarUrl: string | null;
    status: SaleStatus;
    discountPercent: number;
    paidCash: number;
    paidCard: number;
    /** Итого к оплате (после скидки). */
    totalAmount: number;
    /** Сумма строк до скидки. */
    baseTotal: number;
    comment: string;
    lines: DjangoSaleLine[];
    createdByName: string | null;
    createdAt: string;
    /** "sale" — обычная продажа; "appointment" — товары из приёма (read-only). */
    source: SaleSource;
    /** Заполнен для записей из приёма (id приёма). */
    appointmentId: number | null;
    /** Только для записей из приёма: оплата всего приёма с баланса/бонусов. */
    paidBalance: number;
    paidBonuses: number;
};

export type SaleDayTotal = {
    day: string; // YYYY-MM-DD
    totalAmount: number;
};

// ── Фильтры/агрегаты страницы продаж (контракт §9 backend-warehouse-api.md) ──

/** Способ оплаты для фильтра списка. */
export type SalePaymentFilter = "cash" | "cashless";
/** Статус оплаты для фильтра: paid = оплачено; debt = open|partial. */
export type SaleStatusFilter = "paid" | "debt";

/** Общий набор фильтров для списка/статистики/агрегатов продаж. */
export type SaleListFilters = {
    dateFrom?: string | null;
    dateTo?: string | null;
    search?: string | null;
    paymentMethod?: SalePaymentFilter | null;
    status?: SaleStatusFilter | null;
};

/** KPI-сводка за период (GET /warehouse/sales/stats/). */
export type SaleStats = {
    count: number;
    revenue: number;
    avgCheck: number;
    cashTotal: number;
    cashlessTotal: number;
};

/** Строка агрегата «По товарам» (GET /warehouse/sales/by-product/). */
export type SaleProductTotal = {
    productId: number;
    productName: string;
    quantity: number;
    revenue: number;
};

/** Строка агрегата «По дням» (GET /warehouse/sales/by-day/). */
export type SaleDayAggregate = {
    day: string; // YYYY-MM-DD
    count: number;
    totalAmount: number;
};

export type SaleLineInput = {
    productId: number;
    quantity: number;
    // Цена НЕ отправляется: бэкенд берёт её из прайс-листа товара
    // (а при правке — из снимка существующей строки).
};

export type SaleWriteData = {
    lines: SaleLineInput[];
    patientId?: number | null;
    discountPercent?: number;
    paidCash?: number;
    paidCard?: number;
    comment?: string;
    /** Обязателен в org-wide режиме (филиал не выбран в свитчере). */
    branchId?: number;
};

// ── Raw payloads (decimal-safe strings from the backend) ─────────────────────

type RawLine = Omit<DjangoSaleLine, "quantity" | "price" | "total"> & {
    quantity: string;
    price: string;
    total: string;
};

type RawSale = Omit<
    DjangoSale,
    "paidCash" | "paidCard" | "totalAmount" | "baseTotal" | "paidBalance" | "paidBonuses" | "lines"
> & {
    paidCash: string;
    paidCard: string;
    totalAmount: string;
    baseTotal: string;
    paidBalance?: string;
    paidBonuses?: string;
    lines: RawLine[];
};

const num = (v: string | undefined) => parseFloat(v ?? "") || 0;

const mapSale = (raw: RawSale): DjangoSale => ({
    ...raw,
    paidCash: num(raw.paidCash),
    paidCard: num(raw.paidCard),
    totalAmount: num(raw.totalAmount),
    baseTotal: num(raw.baseTotal),
    paidBalance: num(raw.paidBalance),
    paidBonuses: num(raw.paidBonuses),
    lines: raw.lines.map((l) => ({
        ...l,
        quantity: num(l.quantity),
        price: num(l.price),
        total: num(l.total),
    })),
});

// ── API functions ────────────────────────────────────────────────────────────

/** Собирает query-параметры из общих фильтров продаж. */
function appendSaleFilters(q: URLSearchParams, f: SaleListFilters): void {
    if (f.dateFrom) q.set("dateFrom", f.dateFrom);
    if (f.dateTo) q.set("dateTo", f.dateTo);
    if (f.search) q.set("search", f.search);
    if (f.paymentMethod) q.set("paymentMethod", f.paymentMethod);
    if (f.status) q.set("status", f.status);
}

export async function getSales(
    filters: SaleListFilters & { limit?: number; offset?: number } = {},
    signal?: AbortSignal,
): Promise<DjangoSale[]> {
    const q = new URLSearchParams();
    appendSaleFilters(q, filters);
    if (filters.limit !== undefined) q.set("limit", String(filters.limit));
    if (filters.offset !== undefined) q.set("offset", String(filters.offset));
    const qs = q.toString();
    const rows = await apiRequest<RawSale[]>(
        `/warehouse/sales/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map(mapSale);
}

/** KPI-сводка за период с учётом фильтров. */
export async function getSaleStats(
    filters: SaleListFilters = {},
    signal?: AbortSignal,
): Promise<SaleStats> {
    const q = new URLSearchParams();
    appendSaleFilters(q, filters);
    const qs = q.toString();
    const raw = await apiRequest<{
        count: number;
        revenue: string;
        avgCheck: string;
        cashTotal: string;
        cashlessTotal: string;
    }>(`/warehouse/sales/stats/${qs ? `?${qs}` : ""}`, { signal });
    return {
        count: raw.count ?? 0,
        revenue: num(raw.revenue),
        avgCheck: num(raw.avgCheck),
        cashTotal: num(raw.cashTotal),
        cashlessTotal: num(raw.cashlessTotal),
    };
}

/** Агрегат продаж по товарам за период (сортировка по выручке убыв.). */
export async function getSalesByProduct(
    filters: SaleListFilters = {},
    signal?: AbortSignal,
): Promise<SaleProductTotal[]> {
    const q = new URLSearchParams();
    appendSaleFilters(q, filters);
    const qs = q.toString();
    const rows = await apiRequest<
        { productId: number; productName: string; quantity: string; revenue: string }[]
    >(`/warehouse/sales/by-product/${qs ? `?${qs}` : ""}`, { signal });
    return rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        quantity: num(r.quantity),
        revenue: num(r.revenue),
    }));
}

/** Агрегат продаж по дням за период (новые сверху). */
export async function getSalesByDay(
    filters: SaleListFilters = {},
    signal?: AbortSignal,
): Promise<SaleDayAggregate[]> {
    const q = new URLSearchParams();
    appendSaleFilters(q, filters);
    const qs = q.toString();
    const rows = await apiRequest<{ day: string; count: number; totalAmount: string }[]>(
        `/warehouse/sales/by-day/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map((r) => ({ day: r.day, count: r.count ?? 0, totalAmount: num(r.totalAmount) }));
}

export async function getSaleDayTotals(
    year?: string | null,
    month?: string | null,
    signal?: AbortSignal,
): Promise<SaleDayTotal[]> {
    const q = new URLSearchParams();
    if (year) q.set("year", year);
    if (month) q.set("month", month);
    const qs = q.toString();
    const rows = await apiRequest<{ day: string; totalAmount: string }[]>(
        `/warehouse/sales/day-totals/${qs ? `?${qs}` : ""}`,
        { signal },
    );
    return rows.map((r) => ({ day: r.day, totalAmount: num(r.totalAmount) }));
}

export async function createSale(data: SaleWriteData): Promise<DjangoSale> {
    const raw = await apiRequest<RawSale>("/warehouse/sales/", {
        method: "POST",
        body: data,
    });
    return mapSale(raw);
}

export async function updateSale(
    id: number,
    data: SaleWriteData,
): Promise<DjangoSale> {
    const raw = await apiRequest<RawSale>(`/warehouse/sales/${id}/`, {
        method: "PATCH",
        body: data,
    });
    return mapSale(raw);
}

/** Удаляет продажу; товары возвращаются на склад. */
export function deleteSale(id: number): Promise<void> {
    return apiRequest<void>(`/warehouse/sales/${id}/`, { method: "DELETE" });
}
