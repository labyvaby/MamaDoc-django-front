import type { PaymentPhase } from "../api/payments";

/**
 * Фаза счёта приёма — одно правило для чипов списка, карточки и истории оплат.
 *
 * Правило заказчика (05.10.2026): любые деньги до начала приёма — предоплата,
 * а неоплаченный остаток до начала — «к оплате», не долг. С начала приёма
 * остаток автоматически становится долгом.
 *
 * Бэк отдаёт фазу сам (`paymentPhase` приёма, `settlement.phase` сводки
 * оплат); фолбэк ниже повторяет его правило для окружения без релиза.
 */

/** Поля приёма (списка или карточки), которых достаточно для фазы. */
export interface PaymentPhaseSource {
  paymentPhase?: PaymentPhase;
  status?: string;
  scheduledAt?: string | null;
  paymentStatus?: string;
  paidTotal?: string;
  totalAmount?: string;
  discountAmount?: string;
  payableAmount?: string;
}

const CANCELLED = new Set(["canceled", "cancelled", "no_show"]);
/** Врач начал приём раньше времени — это тоже начало. */
const STARTED_STATUSES = new Set(["in_progress", "completed"]);

const num = (value: string | number | null | undefined): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function resolvePaymentPhase(
  appt: PaymentPhaseSource,
  now: number = Date.now(),
): PaymentPhase {
  if (appt.paymentPhase) return appt.paymentPhase;
  if (appt.status && CANCELLED.has(appt.status)) return "canceled";
  if (appt.paymentStatus === "refunded") return "refunded";
  if (appt.paymentStatus === "discounted") return "discounted";
  if (appt.paymentStatus === "paid") return "paid";
  const payable =
    appt.payableAmount != null
      ? num(appt.payableAmount)
      : Math.max(0, num(appt.totalAmount) - num(appt.discountAmount));
  if (payable <= 0) return "free";
  const startsAt = appt.scheduledAt ? Date.parse(appt.scheduledAt) : NaN;
  const started =
    (Number.isFinite(startsAt) && startsAt <= now) ||
    (appt.status != null && STARTED_STATUSES.has(appt.status));
  if (!started) return num(appt.paidTotal) > 0 ? "prepaid" : "awaiting";
  return "debt";
}

/**
 * Фаза, когда её можно утверждать: от бэка или при известном времени
 * приёма. Без обоих — `null`, и вызывающий ведёт себя по-старому (остаток
 * — долг), а не угадывает «предоплату» у приёма без даты.
 */
export function knownPaymentPhase(
  appt: PaymentPhaseSource,
  now: number = Date.now(),
): PaymentPhase | null {
  if (appt.paymentPhase) return appt.paymentPhase;
  if (!appt.scheduledAt) return null;
  return resolvePaymentPhase(appt, now);
}
