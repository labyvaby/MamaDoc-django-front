import { apiRequest } from "./client";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "card";

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
  createdAt: string;
}

export interface PaymentSummary {
  appointmentId: number;
  totalAmount: string;
  discountAmount: string;
  payableAmount: string;
  paidTotal: string;
  debt: string;
  paymentStatus: PaymentStatus;
  payments: AppointmentPayment[];
}

export interface ApplyPaymentPayload {
  discountAmount: string;
  payments: { method: PaymentMethod; amount: string }[];
  note?: string;
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
