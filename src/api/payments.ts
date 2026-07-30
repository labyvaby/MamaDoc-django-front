import { apiRequest } from "./client";
import type { AppointmentConsumptionWarning } from "./appointments";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "card" | "balance" | "bonus" | "insurance";

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
  /** Date this payment counts toward in the cashbox — may differ from createdAt for card/insurance */
  cashDate: string;
  /** Insurance company id (only for method === "insurance") */
  insurerId?: number | null;
  /** Insurance company name (only for method === "insurance") */
  insurerName?: string | null;
  /** Patient policy number (only for method === "insurance") */
  policyNumber?: string;
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
  /**
   * Что натворило автосписание расходников в **этом** запросе. Оплата,
   * переводящая приём в `paid`/`discounted`, сама списывает расходники со
   * склада, а возврат, уводящий приём из оплаченных, возвращает их назад
   * (`front_consumables_integration.md`, ответы 1–3) — поэтому предупреждения
   * приходят именно сюда, а не только в ответе приёма.
   *
   * На GET `/payments/` — всегда пустой массив (проверено на живом API
   * 30.07.2026: поле присутствует).
   */
  consumptionWarnings?: AppointmentConsumptionWarning[];
}

export interface PaymentLineInput {
  method: PaymentMethod;
  amount: string;
  /** Required when method === "insurance": active insurer of the org */
  insurerId?: number;
  /** Optional patient policy number (insurance only) */
  policyNumber?: string;
  /**
   * Cash register date — only for method === "card" | "insurance", and only
   * one of two presets: today or the appointment's own date. Omit to default
   * to today. Other methods must omit it (always dated today server-side).
   */
  cashDate?: string;
}

export interface ApplyPaymentPayload {
  discountAmount: string;
  payments: PaymentLineInput[];
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
  /**
   * Гайд (§1.3) обещает предупреждения в корне ответа возврата, а живой
   * `PaymentSummary` держит их внутри — читаем оба места (см.
   * `refundConsumptionWarnings`).
   */
  consumptionWarnings?: AppointmentConsumptionWarning[];
}

/** Предупреждения возврата — из корня ответа или из вложенной сводки. */
export function refundConsumptionWarnings(
  res: CreateRefundResponse,
): AppointmentConsumptionWarning[] {
  const root = res.consumptionWarnings;
  if (Array.isArray(root) && root.length > 0) return root;
  const nested = res.paymentSummary?.consumptionWarnings;
  return Array.isArray(nested) ? nested : [];
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
