import { apiRequest } from "./client";

export type RetailReceipt = {
  id: number;
  number: string;
  organizationId: number;
  branchId: number;
  warehouseId: number;
  clientId: number | null;
  status: string;
  subtotal: string;
  discountTotal: string;
  totalAmount: string;
  costTotal: string;
  lines: Array<{ id: number; productId: number; productName: string; quantity: string; unitPrice: string; discountAmount: string; lineTotal: string }>;
  payments: Array<{ id: number; method: string; amount: string; reference: string }>;
  completedAt: string | null;
  createdAt: string;
};

export type RetailReceiptLine = {
  productId: number;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  costPerUnit?: number;
};

export function getRetailReceipts(params: { branchId?: number; limit?: number; offset?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null) query.set(key, String(value));
  return apiRequest<RetailReceipt[]>(`/pos/${query.size ? `?${query}` : ""}`, { signal });
}

export function createRetailReceipt(data: {
  organizationId?: number;
  branchId: number;
  warehouseId: number;
  clientId?: number;
  sellerId?: number;
  cashboxShiftId?: number;
  lines: RetailReceiptLine[];
  payments: Array<{ method: string; amount: number; cashlessMethodId?: number; reference?: string }>;
  promoCode?: string;
  idempotencyKey?: string;
}) {
  return apiRequest<RetailReceipt>("/pos/", { method: "POST", body: data });
}

export function returnRetailReceipt(id: number, data: { lines: Array<{ receiptLineId: number; quantity: number }>; reason?: string }) {
  return apiRequest<RetailReceipt>(`/pos/${id}/returns/`, { method: "POST", body: data });
}

export type InventoryCount = { id: number; warehouseId: number; status: string; linesCount: number; completedAt: string | null };

export function startInventoryCount(data: { warehouseId: number; productIds?: number[] }) {
  return apiRequest<InventoryCount>("/warehouse/inventory-counts/", { method: "POST", body: data });
}

export function updateInventoryCountLines(id: number, lines: Array<{ productId: number; countedQuantity: number }>) {
  return apiRequest<InventoryCount>(`/warehouse/inventory-counts/${id}/lines/`, { method: "POST", body: { lines } });
}

export function closeInventoryCount(id: number) {
  return apiRequest<InventoryCount>(`/warehouse/inventory-counts/${id}/close/`, { method: "POST", body: {} });
}

export function createGoodsReceipt(data: { supplierId: number; warehouseId: number; number: string; receivedAt?: string; lines: Array<{ productId: number; quantity: number; costPerUnit: number; lotNumber?: string }> }) {
  return apiRequest<{ id: number; number: string; totalCost: string }>("/warehouse/procurement/receipts/", { method: "POST", body: data });
}

export function createReprice(data: { branchId?: number; mode: "fixed" | "markup"; products: Array<{ productId: number; newPrice?: number; markupPercent?: number }> }) {
  return apiRequest<{ id: number; status: string; lines: number }>("/warehouse/pricing/reprice/", { method: "POST", body: data });
}

export type PosReport = { month: string; revenue: string; cost: string; margin: string; receipts: number; daily: Array<{ date: string; revenue: string; cost: string; margin: string; receipts: number }> };

export function getPosMonthlyReport(month?: string, branchId?: number, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (month) query.set("month", month);
  if (branchId != null) query.set("branchId", String(branchId));
  return apiRequest<PosReport>(`/reports/pos-monthly/${query.size ? `?${query}` : ""}`, { signal });
}

export function getEcommerceOrders(signal?: AbortSignal) {
  return apiRequest<Array<{ id: number; branchId: number; clientId: number | null; status: string; totalAmount: string; createdAt: string }>>("/ecommerce/orders/", { signal });
}

export type PnlReport = { dateFrom: string; dateTo: string; revenue: string; cost: string; grossMargin: string; expenses: string; incomes: string; netResult: string };

export function getPnlReport(dateFrom?: string, dateTo?: string, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  return apiRequest<PnlReport>(`/finance/pnl/${query.size ? `?${query}` : ""}`, { signal });
}
