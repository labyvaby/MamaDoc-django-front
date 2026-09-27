import { apiRequest } from "./client";

export type PosScope = { organizationId: number; branchId: number };
export type PosProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  barcodes: string[];
  modelId: number | null;
  categoryId: number | null;
  price: string;
  stock: string;
  imageUrl: string | null;
  imageThumbnailUrl?: string | null;
  attributes: Array<{ id: number; name: string; role: string; value: string }>;
};
export type PosBootstrap = {
  organization: { id: number; name: string };
  branch: { id: number; name: string };
  cashier: string;
  shiftId: number | null;
  warehouses: Array<{ id: number; name: string }>;
  cashlessMethods: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string }>;
  actions: Record<string, boolean>;
  rules: Record<string, boolean | number | string>;
};
export type PosTender = {
  method: "cash" | "card" | "cashless";
  amount: string;
  cashlessMethodId?: number;
};
export type PosCart = {
  warehouseId: number;
  branchId: number;
  clientId?: number;
  lines: Array<{ productId: number; quantity: string }>;
  discountPercent: string;
  discountKindId?: number;
  clientDiscount: boolean;
  promotions: boolean;
  promoCode: string;
  useBonuses: boolean;
  certificateCode: string;
};
export type PosQuote = {
  subtotal: string;
  discount: string;
  total: string;
  bonuses: string;
  certificateAmount: string;
  due: string;
  /** True only when a promotion produced a larger discount than the manual one. */
  promotionApplied?: boolean;
  lines: Array<{
    productId: number;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    subtotal: string;
    name: string;
  }>;
};
/** Статусы чека — `ReceiptStatus` бэка. Отменённый отложенный чек возвращается в `draft`. */
export type PosReceiptStatus = "draft" | "held" | "completed" | "returned";
/** Способы оплаты — `ReceiptPaymentMethod` бэка; чек принимает несколько сразу. */
export type PosPaymentMethod =
  | "cash"
  | "card"
  | "cashless"
  | "bonus"
  | "certificate"
  | "voucher"
  | "debt";
/** Запись журнала действий по чеку: кто и что сделал (продажа, откладывание, возврат…). */
export type PosReceiptAudit = {
  id: number;
  action: string;
  reason: string;
  userId: number | null;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
export type PosSavedReceipt = {
  id: number;
  number: string;
  organizationId: number;
  branchId: number;
  warehouseId: number;
  clientId: number | null;
  /** Имена — чтобы история не показывала «Клиент #12». Бэк отдаёт их с 15.09.2026. */
  clientName?: string | null;
  sellerId?: number | null;
  sellerName?: string | null;
  cashboxShiftId?: number | null;
  status: PosReceiptStatus | string;
  comment: string;
  subtotal: string;
  discountTotal: string;
  totalAmount: string;
  createdAt: string;
  completedAt?: string | null;
  lines: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: string;
    unitPrice: string;
    discountAmount?: string;
    total: string;
  }>;
  payments: Array<{
    id: number;
    method: PosPaymentMethod | string;
    amount: string;
    reference?: string;
    cashlessMethodId?: number | null;
  }>;
  audit?: PosReceiptAudit[];
};
/** Сводка истории по тем же фильтрам, что и список: считается по всем чекам, а не по странице. */
export type PosHistorySummary = {
  count: number;
  completed: number;
  held: number;
  returned: number;
  cancelled: number;
  revenue: string;
  discountTotal: string;
};
export type PosHistoryFilters = {
  offset?: number;
  status?: string;
  clientId?: number | null;
  /** ISO-дата (YYYY-MM-DD), включительно, в часовом поясе организации. */
  dateFrom?: string;
  dateTo?: string;
  /** Начало номера чека, товар, имя или телефон клиента. */
  search?: string;
};
export const posRequest = <T>(
  scope: PosScope,
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
) => {
  const separator = path.includes("?") ? "&" : "?";
  return apiRequest<T>(
    `/v2/pos/workspace/${path}${separator}branchId=${scope.branchId}`,
    {
      ...options,
      headers: { "X-Organization-Id": String(scope.organizationId) },
    }
  );
};
export const getPosBootstrap = (scope: PosScope, signal?: AbortSignal) =>
  posRequest<PosBootstrap>(scope, "", { signal });
export const getPosProducts = (
  scope: PosScope,
  params: Record<string, string | number>,
  signal?: AbortSignal
) =>
  posRequest<{ count: number; results: PosProduct[] }>(
    scope,
    `products/?${new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    )}`,
    { signal }
  );
export const quotePosCart = (
  scope: PosScope,
  cart: PosCart,
  signal?: AbortSignal
) =>
  posRequest<PosQuote>(scope, "quote/", { method: "POST", body: cart, signal });
export const checkoutPosCart = (
  scope: PosScope,
  cart: PosCart,
  data: {
    expectedTotal: string;
    payments: PosTender[];
    idempotencyKey: string;
    status?: string;
    comment?: string;
  }
) =>
  posRequest<PosSavedReceipt>(scope, "checkout/", {
    method: "POST",
    body: { ...cart, ...data },
  });

/** Страница истории — 25 чеков, размер задаёт бэк. */
export const POS_HISTORY_PAGE_SIZE = 25;

const historyQuery = (params: PosHistoryFilters) => {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.clientId != null) query.set("clientId", String(params.clientId));
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.search?.trim()) query.set("search", params.search.trim());
  return query;
};

const withQuery = (path: string, query: URLSearchParams) => {
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
};

export const getPosHistory = (
  scope: PosScope,
  params: PosHistoryFilters = {},
  signal?: AbortSignal,
) => {
  const query = historyQuery(params);
  query.set("offset", String(params.offset ?? 0));
  return posRequest<PosSavedReceipt[]>(scope, withQuery("history/", query), { signal });
};

export const getPosHistorySummary = (
  scope: PosScope,
  params: Omit<PosHistoryFilters, "offset"> = {},
  signal?: AbortSignal,
) =>
  posRequest<PosHistorySummary>(scope, withQuery("history/summary/", historyQuery(params)), { signal });
