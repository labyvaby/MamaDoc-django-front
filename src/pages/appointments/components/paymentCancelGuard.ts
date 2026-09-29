/**
 * Правила «отмена ↔ оплата» приёма (решение заказчика 29.09.2026):
 * - оплаченный приём отменить нельзя — сначала возврат; отмена доступна,
 *   только когда по приёму на руках 0 сом (ничего не платили или вернули всё);
 * - на отменённом приёме (и неявке) оплату не принимают.
 *
 * Скидка 100% (`discounted` без внесённых сумм) — 0 сом, отмене не мешает.
 */

const CLOSED_STATUSES = new Set(["canceled", "cancelled", "no_show"]);

/** Отменён или неявка — принимать оплату нельзя. */
export function isAppointmentClosedForPayment(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.has(status ?? "");
}

interface PaidSource {
  paidTotal?: string | null;
  /** Есть только в сводке оплаты: paidTotal − refundedTotal. */
  paidNet?: string | null;
  refundedTotal?: string | null;
  paymentStatus?: string | null;
}

const toNumber = (value: string | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Сколько денег по приёму осталось у клиники после возвратов.
 *
 * `paidTotal` бэк отдаёт валовым, возвраты не вычитает. Сводка оплаты шлёт
 * `paidNet`/`refundedTotal`; у строки списка их нет — там полный возврат
 * виден только по `paymentStatus: "refunded"`.
 */
export function appointmentNetPaid(src: PaidSource): number {
  if (src.paidNet != null && src.paidNet !== "") return Math.max(0, toNumber(src.paidNet));
  if (src.refundedTotal != null && src.refundedTotal !== "") {
    return Math.max(0, toNumber(src.paidTotal) - toNumber(src.refundedTotal));
  }
  if (src.paymentStatus === "refunded") return 0;
  return Math.max(0, toNumber(src.paidTotal));
}

/** Отмена запрещена, пока по приёму не вернули все деньги. */
export function isCancelBlockedByPayment(src: PaidSource): boolean {
  return appointmentNetPaid(src) > 0;
}
