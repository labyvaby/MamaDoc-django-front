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
  rules: Record<string, boolean | number>;
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
  lines: Array<{
    productId: number;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    subtotal: string;
    name: string;
  }>;
};
export type PosSavedReceipt = {
  id: number;
  number: string;
  organizationId: number;
  branchId: number;
  warehouseId: number;
  clientId: number | null;
  status: string;
  comment: string;
  subtotal: string;
  discountTotal: string;
  totalAmount: string;
  createdAt: string;
  lines: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: string;
    unitPrice: string;
    total: string;
  }>;
  payments: Array<{ id: number; method: string; amount: string }>;
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
