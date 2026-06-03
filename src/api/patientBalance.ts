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
  appointmentId: number | null;
  paymentId: number | null;
  createdAt: string;
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

export function getPatientBalanceTransactions(
  patientId: number,
  signal?: AbortSignal,
): Promise<PatientBalanceTransaction[]> {
  return apiRequest<PatientBalanceTransaction[]>(
    `/patients/${patientId}/balance/transactions/`,
    { signal },
  );
}
