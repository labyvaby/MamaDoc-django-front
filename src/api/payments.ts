import { apiRequest } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "card" | "balance" | "bonus";

export type PaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "discounted"
  | "refunded";

export interface AppointmentPayment {
  id: number;
  method: PaymentMethod;
  amount: string;
  /** Total amount already refunded for this payment */
  refundedAmount?: string;
  createdAt: string;
}

export interface AppointmentRefund {
  id: number;
  paymentId: number;
  method: PaymentMethod;
  amount: string;
  reason: string;
  createdById: number;
  createdAt: string;
}

export interface PaymentSummary {
  appointmentId: number;
  totalAmount: string;
  discountAmount: string;
  payableAmount: string;
  paidTotal: string;
  /** Gross total of all refunds */
  refundedTotal?: string;
  /** paidTotal - refundedTotal */
  paidNet?: string;
  /** Total bonus points redeemed for this appointment */
  bonusPaid?: string;
  /** Total bonus points refunded for this appointment */
  bonusRefunded?: string;
  debt: string;
  paymentStatus: PaymentStatus;
  /** Appointment workflow status mirrored from backend (cancelled/no_show → debt always "0.00") */
  appointmentStatus?: string;
  payments: AppointmentPayment[];
  refunds?: AppointmentRefund[];
}

export interface ApplyPaymentPayload {
  discountAmount: string;
  payments: { method: PaymentMethod; amount: string }[];
  /** Amount to deduct from patient balance (omit or "0.00" if not using balance) */
  balanceAmount?: string;
  /** Amount to deduct from patient bonuses (omit or "0.00" if not using bonuses) */
  bonusAmount?: string;
  note?: string;
}

export interface RefundPayload {
  amount: string;
  reason: string;
}

export interface CreateRefundResponse {
  refund: AppointmentRefund;
  paymentSummary: PaymentSummary;
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getAppointmentPayments(
  appointmentId: number,
  signal?: AbortSignal,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/`,
    { signal },
  );
}

export function applyAppointmentPayment(
  appointmentId: number,
  payload: ApplyPaymentPayload,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/apply/`,
    { method: "POST", body: payload },
  );
}

export function createAppointmentRefund(
  appointmentId: number,
  paymentId: number,
  payload: RefundPayload,
): Promise<CreateRefundResponse> {
  return apiRequest<CreateRefundResponse>(
    `/appointments/${appointmentId}/payments/${paymentId}/refund/`,
    { method: "POST", body: payload },
  );
}
