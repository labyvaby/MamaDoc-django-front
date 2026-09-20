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
