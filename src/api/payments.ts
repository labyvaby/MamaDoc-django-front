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
  /** Способ безнала из справочника (только для method === "card") */
  cashlessMethodId?: number | null;
  /** Название способа безнала — джойном, как insurerName */
  cashlessMethodName?: string | null;
  /**
   * Строка пришла онлайн-предоплатой брони, а не из кассы: метод `card`,
   * способ безнала «Бакай Paylink», дата кассы — день оплаты банку.
   * Её нельзя перезаписать обычной оплатой и **нельзя присылать в apply**
   * (её дата кассы вне разрешённых пресетов → 400).
   * `undefined` — окружение без релиза предоплаты, предоплат там не бывает.
   */
  isPrepayment?: boolean;
}

export interface AppointmentRefund {
  id: number;
  paymentId: number;
  method: PaymentMethod;
  amount: string;
  reason: string;
  createdById: number;
  createdAt: string;
  /** Способ безнала наследуется от платежа, по которому идёт возврат */
  cashlessMethodId?: number | null;
  cashlessMethodName?: string | null;
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
  /**
   * Онлайн-предоплата брони, уже проведённая в приём (входит в `paidTotal`).
   * Форма оплаты вычитает её из суммы к вводу: в поля кассир вносит только
   * то, что платят на месте. `undefined` = 0 (окружение без релиза).
   */
  prepaidTotal?: string;
  /**
   * Уплачено сверх суммы к оплате — приём вышел дешевле предоплаты. Долг в
   * минус не уходит, разница показывается здесь. Что с ней делать — вопрос
   * заказчику, UI под возврат/баланс пока не рисуем.
   */
  overpaidAmount?: string;
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
   * Способ безналичной оплаты из справочника — только для method === "card".
   * Шлём, только когда справочник непустой и флаг CASHLESS_METHODS_ENABLED
   * включён (см. api/cashlessMethods.ts).
   */
  cashlessMethodId?: number;
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

/**
 * Платежи, которые заводит касса, — без строк онлайн-предоплаты брони.
 * Предоплата приходит из банка отдельной `card`-строкой, защищена от
 * replace-all и в `apply` не отправляется (её дата кассы — день оплаты банку,
 * а бэк принимает только «сегодня» или «дату приёма»). Форма оплаты сидирует
 * поля, способ безнала и дату кассы только из этого списка. На окружении без
 * релиза предоплаты `isPrepayment` нет и фильтр ничего не меняет.
 */
export function manualPaymentsOf(
  summary: PaymentSummary | undefined | null,
): AppointmentPayment[] {
  return (summary?.payments ?? []).filter((p) => !p.isPrepayment);
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
