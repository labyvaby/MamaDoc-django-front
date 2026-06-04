import { apiRequest, ApiError } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CashboxShiftStatus = "open" | "closed";

export interface CashboxShift {
  id: number;
  organizationId: number;
  branchId: number | null;
  branchName: string | null;
  status: CashboxShiftStatus;
  openedById: number | null;
  openedByName: string | null;
  openedAt: string;
  openingCash: string;
  closedById: number | null;
  closedByName: string | null;
  closedAt: string | null;
  expectedCash: string | null;
  actualCash: string | null;
  difference: string | null;
  closeComment: string;
  createdAt: string;
}

export interface CashboxShiftSummary {
  shift: CashboxShift;
  cashIncome: string;
  cashRefunds: string;
  cashExpenses: string;
  expectedCash: string;
  cardIncome: string;
  cardRefunds: string;
  cardExpenses: string;
  balancePayments: string;
  balanceRefunds: string;
  paymentCount: number;
  refundCount: number;
  expenseCount: number;
}

export interface CashboxShiftListResponse {
  results: CashboxShift[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface OpenShiftPayload {
  organizationId?: number;
  branchId: number;
  openingCash: string;
}

export interface CloseShiftPayload {
  actualCash: string;
  closeComment?: string;
}

export interface CurrentShiftFilters {
  branchId: number;
  organizationId?: number;
}

export interface ShiftListFilters {
  organizationId?: number;
  branchId?: number;
  status?: CashboxShiftStatus;
  page?: number;
  pageSize?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildShiftListParams(filters: ShiftListFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.status) q.set("status", filters.status);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  return q;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getCurrentShift(
  filters: CurrentShiftFilters,
  signal?: AbortSignal,
): Promise<CashboxShift | null> {
  const q = new URLSearchParams();
  q.set("branchId", String(filters.branchId));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  try {
    return await apiRequest<CashboxShift>(
      `/finance/cashbox-shifts/current/?${q.toString()}`,
      { signal },
    );
  } catch (err) {
    // 404 means no open shift exists — not an error condition
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function getCashboxShifts(
  filters: ShiftListFilters = {},
  signal?: AbortSignal,
): Promise<CashboxShiftListResponse> {
  const q = buildShiftListParams(filters);
  return apiRequest<CashboxShiftListResponse>(
    `/finance/cashbox-shifts/?${q.toString()}`,
    { signal },
  );
}

export function getCashboxShiftSummary(
  id: number,
  signal?: AbortSignal,
): Promise<CashboxShiftSummary> {
  return apiRequest<CashboxShiftSummary>(
    `/finance/cashbox-shifts/${id}/summary/`,
    { signal },
  );
}

export function openCashboxShift(payload: OpenShiftPayload): Promise<CashboxShift> {
  return apiRequest<CashboxShift>("/finance/cashbox-shifts/open/", {
    method: "POST",
    body: payload,
  });
}

export function closeCashboxShift(
  id: number,
  payload: CloseShiftPayload,
): Promise<CashboxShift> {
  return apiRequest<CashboxShift>(`/finance/cashbox-shifts/${id}/close/`, {
    method: "POST",
    body: payload,
  });
}
