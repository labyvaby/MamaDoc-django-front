import { apiRequest } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PatientBalance {
  patientId: number;
  organizationId: number;
  balance: string;
  bonuses: string;
  createdAt: string;
  updatedAt: string;
}

export type BalanceTransactionType =
  | "top_up"
  | "deduct"
  | "bonus_accrual"
  | "bonus_redeem"
  | "bonus_refund"
  | "correction";

export interface PatientBalanceTransaction {
  id: number;
  transactionType: BalanceTransactionType;
  amount: string;
  bonusesAmount: string;
  balanceBefore: string;
  balanceAfter: string;
  bonusesBefore: string;
  bonusesAfter: string;
  comment: string;
  createdById: number | null;
  createdByName: string | null;
  branchId: number | null;
  branchName: string | null;
  appointmentId: number | null;
  paymentId: number | null;
  createdAt: string;
}

export interface PatientBalanceTransactionsResponse {
  results: PatientBalanceTransaction[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface BalanceTopUpPayload {
  amount: string;
  bonusesAmount?: string;
  comment?: string;
  branchId?: number | null;
  appointmentId?: number | null;
  paymentId?: number | null;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getPatientBalance(
  patientId: number,
  signal?: AbortSignal,
): Promise<PatientBalance> {
  return apiRequest<PatientBalance>(`/patients/${patientId}/balance/`, { signal });
}

export function topUpPatientBalance(
  patientId: number,
  payload: BalanceTopUpPayload,
): Promise<PatientBalance> {
  return apiRequest<PatientBalance>(`/patients/${patientId}/balance/top-up/`, {
    method: "POST",
    body: payload,
  });
}

export async function getPatientBalanceTransactions(
  patientId: number,
  params?: { page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<PatientBalanceTransactionsResponse> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const payload = await apiRequest<
    PatientBalanceTransactionsResponse | PatientBalanceTransaction[]
  >(`/patients/${patientId}/balance/transactions/${query}`, { signal });
  // Backward-compat: old backend returns plain array, new backend returns paginated object.
  if (Array.isArray(payload)) {
    return { results: payload, count: payload.length, next: null, previous: null };
  }
  return payload;
}
