import { apiRequest } from "./client";

export type DiscountKind = {
  id: number;
  organizationId: number;
  branchId: number | null;
  name: string;
  percent: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DiscountKindDraft = {
  name: string;
  percent: string;
  branchId?: number | null;
};

export function getDiscountKinds(
  options: { branchId?: number | null; includeInactive?: boolean } = {},
  signal?: AbortSignal,
): Promise<DiscountKind[]> {
  const query = new URLSearchParams();
  if (options.branchId != null) query.set("branchId", String(options.branchId));
  if (options.includeInactive) query.set("includeInactive", "1");
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<DiscountKind[]>(`/v2/promotions/discount-kinds/${suffix}`, { signal });
}

export function createDiscountKind(draft: DiscountKindDraft): Promise<DiscountKind> {
  return apiRequest<DiscountKind>("/v2/promotions/discount-kinds/", {
    method: "POST",
    body: draft,
  });
}

export function updateDiscountKind(
  id: number,
  draft: Partial<Pick<DiscountKind, "name" | "percent" | "isActive">>,
): Promise<DiscountKind> {
  return apiRequest<DiscountKind>(`/v2/promotions/discount-kinds/${id}/`, {
    method: "PATCH",
    body: draft,
  });
}

export type Promotion = {
  id: number;
  organizationId: number;
  branchId: number | null;
  name: string;
  promotionType: "product_percent" | "product_amount" | "cart_percent" | "cart_amount";
  status: "draft" | "active" | "paused" | "finished";
  startsAt: string;
  endsAt: string | null;
  priority: number;
  combinable: boolean;
  discountPercent: string;
  discountAmount: string;
  minTotal: string;
  requiresPromoCode: boolean;
  comment: string;
};

export type PromoCode = {
  id: number;
  promotionId: number;
  code: string;
  usedCount: number;
  usageLimit: number | null;
  expiresAt: string | null;
  isActive: boolean;
  isExhausted: boolean;
};

export type PromoCodeRedemption = {
  id: number;
  receiptId: number;
  clientId: number;
  discountAmount: string;
  createdAt: string;
};

export type GiftCertificate = {
  id: number;
  code: string;
  nominal: string;
  balance: string;
  expiresAt: string | null;
  isActive: boolean;
  isSpent: boolean;
  createdAt: string;
};

const promotionsPath = "/v2/promotions/";

export const getPromotions = (signal?: AbortSignal) =>
  apiRequest<Promotion[]>(promotionsPath, { signal });

export const createPromotion = (body: {
  name: string;
  promotionType: Promotion["promotionType"];
  startsAt: string;
  endsAt?: string | null;
  branchId?: number | null;
  discountPercent?: string;
  discountAmount?: string;
  minTotal?: string;
  requiresPromoCode?: boolean;
  status?: Promotion["status"];
}) => apiRequest<Promotion>(promotionsPath, { method: "POST", body });

export const setPromotionStatus = (id: number, status: Promotion["status"]) =>
  apiRequest<Promotion>(`${promotionsPath}${id}/status/`, {
    method: "POST",
    body: { status },
  });

export const getPromoCodes = (promotionId: number, signal?: AbortSignal) =>
  apiRequest<PromoCode[]>(`${promotionsPath}${promotionId}/codes/`, { signal });

export const createPromoCode = (promotionId: number, body: {
  code: string;
  usageLimit?: number | null;
  expiresAt?: string | null;
}) => apiRequest<PromoCode>(`${promotionsPath}${promotionId}/codes/`, {
  method: "POST",
  body,
});

export const setPromoCodeActive = (id: number, isActive: boolean) =>
  apiRequest<PromoCode>(`${promotionsPath}codes/${id}/`, {
    method: "PATCH",
    body: { isActive },
  });

export const getPromoCodeRedemptions = (id: number, signal?: AbortSignal) =>
  apiRequest<PromoCodeRedemption[]>(`${promotionsPath}codes/${id}/redemptions/`, { signal });

export const getGiftCertificates = (signal?: AbortSignal) =>
  apiRequest<GiftCertificate[]>(`${promotionsPath}certificates/`, { signal });

export const issueGiftCertificate = (body: {
  code: string;
  nominal: string;
  expiresAt?: string | null;
}) => apiRequest<GiftCertificate>(`${promotionsPath}certificates/`, {
  method: "POST",
  body,
});

// ── Gift certificates: registry, card, void, branch report, settings ──────────
// Contract: backend docs/certificates-contract.md §2–§3. The certificate
// belongs to the organization, so every call carries X-Organization-Id when
// the page knows it (a session without one falls back to its membership).

/** Computed on the server: active — can pay; spent — balance 0; expired; void. */
export type GiftCertificateStatus = "active" | "spent" | "expired" | "void";

export type GiftCertificateBranchUse = {
  branchId: number | null;
  branchName: string;
  amount: string;
};

export type GiftCertificateRow = {
  id: number;
  code: string;
  nominal: string;
  balance: string;
  status: GiftCertificateStatus | string;
  createdAt: string;
  /** Moment the card stops working (start of the day after its last day). */
  expiresAt: string | null;
  soldAt: string | null;
  soldBranchId: number | null;
  soldBranchName: string;
  soldByName: string;
  buyerClientId: number | null;
  buyerName: string;
  buyerPhone: string;
  recipientName: string;
  recipientPhone: string;
  /** Money taken for the card minus money given back on void. */
  paidAmount: string;
  /** Net amount bought with the card (redeemed minus restored by returns). */
  spentAmount: string;
  redeemedBranches: GiftCertificateBranchUse[];
  lastRedeemedAt: string | null;
  voidedAt: string | null;
};

export type GiftCertificateMoneyRow = {
  id: number;
  operation: "sale" | "refund" | string;
  method: "cash" | "card" | "cashless" | string;
  amount: string;
  branchId: number;
  branchName: string;
  createdAt: string;
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  cashboxShiftId: number | null;
  createdByName: string;
};

export type GiftCertificateUseRow = {
  id: number;
  /** redeem — paid for goods; restore — goods returned, money back on the card. */
  operation: "redeem" | "restore" | string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string;
  branchId: number | null;
  branchName: string;
  receiptId: number | null;
  receiptNumber: string;
  returnId: number | null;
  clientId: number | null;
  clientName: string;
  createdByName: string;
};

export type GiftCertificateDetail = GiftCertificateRow & {
  comment: string;
  voidReason: string;
  voidedByName: string;
  payments: GiftCertificateMoneyRow[];
  uses: GiftCertificateUseRow[];
  canVoid: boolean;
};

export type GiftCertificateRegistrySummary = {
  count: number;
  nominal: string;
  activeBalance: string;
  expiredBalance: string;
  byStatus: Partial<Record<GiftCertificateStatus, number>>;
};

export type GiftCertificateRegistry = {
  items: GiftCertificateRow[];
  count: number;
  limit: number;
  offset: number;
  summary: GiftCertificateRegistrySummary;
};

export type GiftCertificateRegistryFilters = {
  soldBranchId?: number | null;
  redeemedBranchId?: number | null;
  /** YYYY-MM-DD, sale day (issue day for old cards), Bishkek time. */
  dateFrom?: string;
  dateTo?: string;
  status?: GiftCertificateStatus | "";
  search?: string;
  limit?: number;
  offset?: number;
};

export type GiftCertificateBranchRow = {
  branchId: number | null;
  branchName: string;
  soldCount: number;
  soldAmount: string;
  voidedCount: number;
  refundedAmount: string;
  redeemedAmount: string;
  /** Part of redeemedAmount paid with cards sold in other branches. */
  redeemedForeignAmount: string;
  /** Cards sold here and spent in other branches. */
  ownRedeemedElsewhereAmount: string;
  /** Today's balance of active cards sold here; does not depend on the period. */
  outstandingCount: number;
  outstandingBalance: string;
};

export type GiftCertificateBranchFlow = {
  soldBranchId: number | null;
  soldBranchName: string;
  redeemedBranchId: number | null;
  redeemedBranchName: string;
  amount: string;
};

export type GiftCertificateBranchReport = {
  rows: GiftCertificateBranchRow[];
  flows: GiftCertificateBranchFlow[];
  totals: GiftCertificateBranchRow;
  dateFrom: string | null;
  dateTo: string | null;
};

export type GiftCertificateSettings = {
  /** Default validity in days from the sale; 0 — no expiry. */
  validityDays: number;
  /** The date the till proposes today; null — no expiry. */
  defaultExpiresOn: string | null;
};

/** Registry page size; the backend caps `limit` at 200. */
export const GIFT_CERTIFICATE_PAGE_SIZE = 50;

const certificatesPath = `${promotionsPath}certificates/`;

const orgHeaders = (organizationId?: number | null): Record<string, string> =>
  organizationId ? { "X-Organization-Id": String(organizationId) } : {};

const certificateQuery = (params: Record<string, string | number | null | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
};

export const getGiftCertificateRegistry = (
  filters: GiftCertificateRegistryFilters,
  organizationId?: number | null,
  signal?: AbortSignal,
) =>
  apiRequest<GiftCertificateRegistry>(
    `${certificatesPath}registry/${certificateQuery({
      ...filters,
      search: filters.search?.trim(),
    })}`,
    { signal, headers: orgHeaders(organizationId) },
  );

export const getGiftCertificate = (id: number, organizationId?: number | null, signal?: AbortSignal) =>
  apiRequest<GiftCertificateDetail>(`${certificatesPath}${id}/`, {
    signal,
    headers: orgHeaders(organizationId),
  });

export const voidGiftCertificate = (id: number, reason: string, organizationId?: number | null) =>
  apiRequest<GiftCertificateDetail>(`${certificatesPath}${id}/void/`, {
    method: "POST",
    body: { reason },
    headers: orgHeaders(organizationId),
  });

export const getGiftCertificateBranchReport = (
  params: { dateFrom?: string; dateTo?: string },
  organizationId?: number | null,
  signal?: AbortSignal,
) =>
  apiRequest<GiftCertificateBranchReport>(
    `${certificatesPath}branch-report/${certificateQuery(params)}`,
    { signal, headers: orgHeaders(organizationId) },
  );

export const getGiftCertificateSettings = (organizationId?: number | null, signal?: AbortSignal) =>
  apiRequest<GiftCertificateSettings>(`${certificatesPath}settings/`, {
    signal,
    headers: orgHeaders(organizationId),
  });

export const updateGiftCertificateSettings = (validityDays: number, organizationId?: number | null) =>
  apiRequest<GiftCertificateSettings>(`${certificatesPath}settings/`, {
    method: "PATCH",
    body: { validityDays },
    headers: orgHeaders(organizationId),
  });
