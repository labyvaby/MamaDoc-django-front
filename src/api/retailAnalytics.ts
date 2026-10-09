import { apiRequest } from "./client";
import type { PosSavedReceipt } from "./pos";

/**
 * «Аналитика магазина» — сезонные отчёты вертикали retail
 * (`server/apps/retail/api`). Все ручки читают `retail.view`; сводка денег
 * дополнительно требует `finance.view`, правка коллекции — `retail.manage`.
 */
const BASE = "/v2/retail";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.size ? `?${query}` : "";
};

// ── Сводка денег ─────────────────────────────────────────────────────────────

export type RetailPnl = {
  dateFrom: string;
  dateTo: string;
  revenue: string;
  cost: string;
  grossMargin: string;
  expenses: string;
  incomes: string;
  netResult: string;
};

export function getRetailPnl(params: { dateFrom?: string; dateTo?: string }, signal?: AbortSignal) {
  return apiRequest<RetailPnl>(`${BASE}/reports/pnl/${qs(params)}`, { signal });
}

/** Последние чеки кассы — тот же `ReceiptPayload`, что в истории продаж. */
export function getRecentReceipts(limit: number, signal?: AbortSignal) {
  return apiRequest<PosSavedReceipt[]>(`/v2/pos/receipts/${qs({ limit })}`, { signal });
}

// ── Коллекции ────────────────────────────────────────────────────────────────

export type RetailCollection = {
  /** Коллекция живёт на модели 1:1, её id — id модели. */
  modelId: number;
  modelName: string;
  name: string;
  season: string;
  year: number | null;
  launchedAt: string | null;
  selloutDue: string | null;
  comment: string;
  skuTotal: number;
  createdAt: string;
  updatedAt: string;
};

export type RetailCollectionUpdate = {
  name?: string;
  season?: string;
  year?: number | null;
  launchedAt?: string | null;
  selloutDue?: string | null;
  comment?: string;
  clearLaunchedAt?: boolean;
  clearSelloutDue?: boolean;
};

export function getCollections(signal?: AbortSignal) {
  return apiRequest<RetailCollection[]>(`${BASE}/collections/`, { signal });
}

export function updateCollection(modelId: number, body: RetailCollectionUpdate) {
  return apiRequest<RetailCollection>(`${BASE}/collections/${modelId}/`, { method: "PATCH", body });
}

// ── Отчёты ───────────────────────────────────────────────────────────────────

export type RetailReportFilters = {
  season?: string;
  /** Коллекция = модель: фильтр по одной модели. */
  collectionId?: number;
};

export type SellThroughRow = {
  modelId: number;
  modelName: string;
  collectionName: string;
  season: string;
  year: number | null;
  received: string;
  sold: string;
  returned: string;
  stock: string;
  /** Процент проданного от «продано + остаток»; null — делить не на что. */
  sellThrough: string | null;
};

export function getSellThrough(
  params: RetailReportFilters & { dateFrom?: string; dateTo?: string },
  signal?: AbortSignal,
) {
  return apiRequest<SellThroughRow[]>(`${BASE}/reports/sell-through/${qs(params)}`, { signal });
}

export type SizeGridRow = {
  valueId: number;
  value: string;
  sold: string;
  stock: string;
};

export function getSizeGrid(params: RetailReportFilters, signal?: AbortSignal) {
  return apiRequest<SizeGridRow[]>(`${BASE}/reports/size-grid/${qs(params)}`, { signal });
}

export type MatrixGapCell = {
  colorValueId: number;
  color: string;
  sizeValueId: number;
  size: string;
  productId: number | null;
};

export type MatrixGaps = {
  modelId: number;
  modelName: string;
  colors: string[];
  sizes: string[];
  /** Клетки, которых нет в каталоге вовсе. */
  missing: MatrixGapCell[];
  /** Клетки, которые есть, но на складе ноль. */
  empty: MatrixGapCell[];
};

export function getMatrixGaps(modelId: number, signal?: AbortSignal) {
  return apiRequest<MatrixGaps>(`${BASE}/reports/matrix-gaps/${qs({ modelId })}`, { signal });
}
