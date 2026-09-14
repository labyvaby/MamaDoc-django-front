import { apiRequest } from "./client";
import { preparePhotoOrThrow, withUploadErrors } from "./uploads";

/**
 * Модуль «Закупки» — поставщики, накладные (приёмки), возвраты и оплаты
 * поставщикам. Бэк: `/api/v2/procurement/*` (server/apps/procurement).
 *
 * Скоуп. Организацию бэк берёт из заголовка `X-Organization-Id` (суперадмин,
 * мультиорг — см. useActiveScope) либо из сессии. Филиал — из сессии: в
 * филиале видны накладные складов филиала и оплаты этого филиала; в
 * орг-режиме («все филиалы») список можно сузить `branchId`. Чужая
 * организация/филиал — 404, не «откат на своё».
 *
 * Права. Страницу открывает `procurement.invoices.view`, данные читает
 * `procurement.view`, каждая кнопка — свой код (см. PROCUREMENT_PERMISSIONS);
 * бэк принимает и прежнее общее `procurement.manage`.
 *
 * Деньги и количества приходят строками («184300.00», «10.000») — как во всём
 * v2-API, чтобы не терять копейки в float.
 */

const BASE = "/v2/procurement";

/** Коды прав на действия страницы — один источник для кнопок и гейтов. */
export const PROCUREMENT_PERMISSIONS = {
  view: "procurement.view",
  page: "procurement.invoices.view",
  receiptCreate: "procurement.receipts.create",
  receiptUpdate: "procurement.receipts.update",
  receiptCancel: "procurement.receipts.cancel",
  receiptPhotos: "procurement.receipts.photos",
  receiptRecognize: "procurement.receipts.recognize",
  returnCreate: "procurement.returns.create",
  suppliersManage: "procurement.suppliers.manage",
  paymentsManage: "procurement.payments.manage",
  paymentsDelete: "procurement.payments.delete",
  print: "procurement.print",
  /** Прежнее общее право: бэк трактует как надмножество товарных действий. */
  manage: "procurement.manage",
} as const;

export type ReceiptPaymentStatus = "unpaid" | "partial" | "paid";
export type ReceiptStatus = "posted" | "canceled";
/** Фильтр списка: статус оплаты либо отменённые. */
export type ReceiptListStatus = ReceiptPaymentStatus | "canceled";
export type SupplierPaymentMethod = "cash" | "card" | "cashless" | "offset";

export interface ProcurementSupplier {
  id: number;
  organizationId: number;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  contactPerson: string;
  paymentTerms: string;
  defaultCurrency: string;
  comment: string;
  isActive: boolean;
  createdAt: string;
  /** Задолженность организации перед поставщиком (может быть отрицательной — переплата). */
  payable: string | null;
  receiptsCount: number | null;
  lastReceivedAt: string | null;
}

export interface SupplierWriteData {
  name: string;
  taxId?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  paymentTerms?: string;
  defaultCurrency?: string;
  comment?: string;
  isActive?: boolean;
}

export interface GoodsReceiptLine {
  id: number;
  productId: number;
  quantity: string;
  costCurrency: string;
  costAmount: string;
  exchangeRate: string;
  batchId: number | null;
  productName: string;
  productSku: string;
  productUnit: string;
  lotNumber: string;
  expiresAt: string | null;
  /** Себестоимость позиции в валюте учёта. */
  lineTotal: string;
}

export interface GoodsReceipt {
  id: number;
  organizationId: number;
  supplierId: number;
  warehouseId: number;
  number: string;
  totalCost: string;
  comment: string;
  receivedAt: string;
  createdAt: string;
  lines: GoodsReceiptLine[];
  purchaseOrderId: number | null;
  supplierName: string;
  warehouseName: string;
  branchId: number | null;
  branchName: string;
  purchaseOrderNumber: string;
  supplierNumber: string;
  status: ReceiptStatus;
  paymentStatus: ReceiptPaymentStatus;
  paidTotal: string;
  returnedTotal: string;
  remainingTotal: string;
  dueAt: string | null;
  linesCount: number;
  createdByName: string | null;
  canceledAt: string | null;
  canceledByName: string | null;
  updatedAt: string | null;
  photosCount: number;
}

export interface GoodsReceiptLineInput {
  productId: number;
  quantity: string | number;
  costAmount: string | number;
  costCurrency?: string;
  exchangeRate?: string | number;
  lotNumber?: string;
  comment?: string;
  expiresAt?: string | null;
}

export interface GoodsReceiptCreateData {
  supplierId: number;
  warehouseId: number;
  lines: GoodsReceiptLineInput[];
  /** Пусто — бэк подставит следующий номер по счётчику («ПН-000012»). */
  number?: string;
  purchaseOrderId?: number | null;
  receivedAt?: string | null;
  comment?: string;
  supplierNumber?: string;
  dueAt?: string | null;
}

export interface GoodsReceiptUpdateData {
  number?: string;
  supplierNumber?: string;
  comment?: string;
  /** null — снять срок оплаты; undefined — не трогать. */
  dueAt?: string | null;
}

export interface SupplierReturnLine {
  id: number;
  productId: number;
  quantity: string;
  costPerUnit: string;
  batchId: number | null;
  productName: string;
  productUnit: string;
}

export interface SupplierReturn {
  id: number;
  organizationId: number;
  supplierId: number;
  warehouseId: number;
  number: string;
  totalCost: string;
  reason: string;
  createdAt: string;
  lines: SupplierReturnLine[];
  supplierName: string;
  warehouseName: string;
  branchId: number | null;
  branchName: string;
  goodsReceiptId: number | null;
  goodsReceiptNumber: string;
  createdByName: string | null;
}

export interface SupplierReturnCreateData {
  supplierId: number;
  warehouseId: number;
  number: string;
  lines: Array<{ productId: number; quantity: string | number; costPerUnit?: string | number | null }>;
  reason?: string;
  goodsReceiptId?: number | null;
}

export interface SupplierPayment {
  id: number;
  organizationId: number;
  supplierId: number;
  amount: string;
  paymentMethod: SupplierPaymentMethod;
  comment: string;
  paidAt: string;
  createdAt: string;
  cashlessMethodId: number | null;
  supplierName: string;
  branchId: number | null;
  branchName: string;
  goodsReceiptId: number | null;
  goodsReceiptNumber: string;
  cashlessMethodName: string;
  documentNumber: string;
  createdByName: string | null;
}

export interface SupplierPaymentCreateData {
  supplierId: number;
  amount: string | number;
  paymentMethod?: SupplierPaymentMethod;
  cashlessMethodId?: number | null;
  paidAt?: string | null;
  comment?: string;
  goodsReceiptId?: number | null;
  documentNumber?: string;
  /** Только в орг-режиме (филиал не выбран): откуда ушли деньги. */
  branchId?: number | null;
}

export interface ProcurementSummary {
  periodTotal: string;
  periodCount: number;
  payableTotal: string;
  awaitingCount: number;
  overdueCount: number;
  nearestDueAt: string | null;
  statusCounts: Record<ReceiptPaymentStatus, number>;
  canceledCount: number;
  suppliersActive: number;
  suppliersTotal: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface ProcurementSettings {
  photoRecognition: boolean;
  autoMatchThreshold: number;
  /** Умеет ли сервер распознавать вообще (ключ провайдера задан). */
  recognitionAvailable: boolean;
  recognitionProvider: string;
  recognitionModel: string;
}

export interface RecognizedCandidate {
  id: number;
  name: string;
  score: number;
  reason: "barcode" | "sku" | "name" | "tax_id" | string;
}

export interface RecognizedLine {
  name: string;
  quantity: string | null;
  unit: string | null;
  price: string | null;
  total: string | null;
  lotNumber: string | null;
  expiresAt: string | null;
  barcode: string | null;
  sku: string | null;
  match: RecognizedCandidate | null;
  candidates: RecognizedCandidate[];
}

export interface RecognitionResult {
  provider: string;
  document: {
    kind: string;
    number: string | null;
    date: string | null;
    currency: string | null;
    total: string | null;
    vatTotal: string | null;
    paymentTerms: string | null;
    buyerName: string | null;
    supplier: { name: string | null; taxId: string | null; phone: string | null; address: string | null };
  };
  supplierMatch: RecognizedCandidate | null;
  supplierCandidates: RecognizedCandidate[];
  lines: RecognizedLine[];
  totals: { linesTotal: string; declaredTotal: string | null; linesCount: number; matchedCount: number };
  warnings: string[];
  confidence: number;
}

/** Орг-контекст заголовком — единый способ для v2-ручек (см. org_context). */
export interface ProcurementScope {
  organizationId?: number | null;
  /** Сужение орг-режима; в филиале бэк берёт филиал из сессии. */
  branchId?: number | null;
}

const orgHeaders = (scope?: ProcurementScope): Record<string, string> =>
  scope?.organizationId != null ? { "X-Organization-Id": String(scope.organizationId) } : {};

const query = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    q.set(key, String(value));
  });
  const qs = q.toString();
  return qs ? `?${qs}` : "";
};

// ── Поставщики ────────────────────────────────────────────────────────────────

export function getSuppliers(
  params: { isActive?: boolean; search?: string } = {},
  scope?: ProcurementScope,
  signal?: AbortSignal,
): Promise<ProcurementSupplier[]> {
  return apiRequest<ProcurementSupplier[]>(`${BASE}/suppliers/${query(params)}`, {
    headers: orgHeaders(scope),
    signal,
  });
}

export function getSupplier(id: number, scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<ProcurementSupplier>(`${BASE}/suppliers/${id}/`, { headers: orgHeaders(scope), signal });
}

export function createSupplier(data: SupplierWriteData, scope?: ProcurementScope) {
  return apiRequest<ProcurementSupplier>(`${BASE}/suppliers/`, {
    method: "POST",
    headers: orgHeaders(scope),
    body: data,
  });
}

export function updateSupplier(id: number, data: Partial<SupplierWriteData>, scope?: ProcurementScope) {
  return apiRequest<ProcurementSupplier>(`${BASE}/suppliers/${id}/`, {
    method: "PATCH",
    headers: orgHeaders(scope),
    body: data,
  });
}

// ── Накладные (приёмки) ───────────────────────────────────────────────────────

export interface ReceiptListParams {
  supplierId?: number | null;
  warehouseId?: number | null;
  status?: ReceiptListStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string;
  branchId?: number | null;
  withLines?: boolean;
  limit?: number;
  offset?: number;
}

export function getReceipts(params: ReceiptListParams = {}, scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<GoodsReceipt[]>(
    `${BASE}/receipts/${query({
      supplierId: params.supplierId,
      warehouseId: params.warehouseId,
      status: params.status,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      search: params.search,
      branchId: params.branchId ?? scope?.branchId,
      withLines: params.withLines === false ? "0" : undefined,
      limit: params.limit,
      offset: params.offset,
    })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function getReceipt(id: number, scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<GoodsReceipt>(
    `${BASE}/receipts/${id}/${query({ branchId: scope?.branchId })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function getReceiptsSummary(
  params: { dateFrom?: string | null; dateTo?: string | null } = {},
  scope?: ProcurementScope,
  signal?: AbortSignal,
) {
  return apiRequest<ProcurementSummary>(
    `${BASE}/receipts/summary/${query({ ...params, branchId: scope?.branchId })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function getNextReceiptNumber(scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<{ number: string }>(`${BASE}/receipts/next-number/`, { headers: orgHeaders(scope), signal });
}

export function createReceipt(data: GoodsReceiptCreateData, scope?: ProcurementScope) {
  return apiRequest<GoodsReceipt>(`${BASE}/receipts/${query({ branchId: scope?.branchId })}`, {
    method: "POST",
    headers: orgHeaders(scope),
    body: data,
  });
}

export function updateReceipt(id: number, data: GoodsReceiptUpdateData, scope?: ProcurementScope) {
  return apiRequest<GoodsReceipt>(`${BASE}/receipts/${id}/${query({ branchId: scope?.branchId })}`, {
    method: "PATCH",
    headers: orgHeaders(scope),
    body: data,
  });
}

export function cancelReceipt(id: number, reason: string, scope?: ProcurementScope) {
  return apiRequest<GoodsReceipt>(`${BASE}/receipts/${id}/cancel/${query({ branchId: scope?.branchId })}`, {
    method: "POST",
    headers: orgHeaders(scope),
    body: { reason },
  });
}

/**
 * Черновик накладной по фото. Снимок жмём и переводим в jpg так же, как фото
 * накладных (api/uploads.ts): модели хватает 1600 px по длинной стороне, а
 * HEIC с айфона бэк не читает. Ответ — предложение: ничего не записано, пока
 * человек не проверит позиции и не проведёт приход.
 */
export async function recognizeReceiptPhoto(file: File, scope?: ProcurementScope, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("image", await preparePhotoOrThrow(file));
  return withUploadErrors(() =>
    apiRequest<RecognitionResult>(`${BASE}/receipts/recognize/${query({ branchId: scope?.branchId })}`, {
      method: "POST",
      headers: orgHeaders(scope),
      formData,
      signal,
    }),
  );
}

// ── Возвраты поставщику ───────────────────────────────────────────────────────

export interface ReturnListParams {
  supplierId?: number | null;
  goodsReceiptId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
}

export function getReturns(params: ReturnListParams = {}, scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<SupplierReturn[]>(
    `${BASE}/returns/${query({ ...params, branchId: scope?.branchId })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function createReturn(data: SupplierReturnCreateData, scope?: ProcurementScope) {
  return apiRequest<SupplierReturn>(`${BASE}/returns/${query({ branchId: scope?.branchId })}`, {
    method: "POST",
    headers: orgHeaders(scope),
    body: data,
  });
}

// ── Оплаты ────────────────────────────────────────────────────────────────────

export interface PaymentListParams {
  supplierId?: number | null;
  goodsReceiptId?: number | null;
  paymentMethod?: SupplierPaymentMethod | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
}

export function getPayments(params: PaymentListParams = {}, scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<SupplierPayment[]>(
    `${BASE}/payments/${query({ ...params, branchId: scope?.branchId })}`,
    { headers: orgHeaders(scope), signal },
  );
}

export function createPayment(data: SupplierPaymentCreateData, scope?: ProcurementScope) {
  return apiRequest<SupplierPayment>(`${BASE}/payments/${query({ branchId: scope?.branchId })}`, {
    method: "POST",
    headers: orgHeaders(scope),
    body: data,
  });
}

export function deletePayment(id: number, scope?: ProcurementScope) {
  return apiRequest<void>(`${BASE}/payments/${id}/${query({ branchId: scope?.branchId })}`, {
    method: "DELETE",
    headers: orgHeaders(scope),
  });
}

// ── Настройки модуля ──────────────────────────────────────────────────────────

export function getProcurementSettings(scope?: ProcurementScope, signal?: AbortSignal) {
  return apiRequest<ProcurementSettings>(`${BASE}/settings/`, { headers: orgHeaders(scope), signal });
}

export function updateProcurementSettings(
  data: { photoRecognition?: boolean; autoMatchThreshold?: number },
  scope?: ProcurementScope,
) {
  return apiRequest<ProcurementSettings>(`${BASE}/settings/`, {
    method: "PATCH",
    headers: orgHeaders(scope),
    body: data,
  });
}

// ── Подписи ───────────────────────────────────────────────────────────────────

export const RECEIPT_PAYMENT_STATUS_LABEL: Record<ReceiptPaymentStatus, string> = {
  unpaid: "Не оплачена",
  partial: "Частично оплачена",
  paid: "Оплачена",
};

export const SUPPLIER_PAYMENT_METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  cash: "Наличные",
  card: "Карта",
  cashless: "Безнал",
  offset: "Взаимозачёт",
};

/** Способы, требующие выбора конкретного способа безнала из справочника. */
export const CASHLESS_SUPPLIER_METHODS: readonly SupplierPaymentMethod[] = ["card", "cashless"];
