/**
 * Чистая модель раздела «История оплат» карточки приёма — без React, чтобы
 * правила покрывались vitest-ом (render-библиотек в проекте нет).
 *
 * Источник правды — бэк: вид оплаты (`kind`), фаза счёта (`settlement.phase`)
 * и права (`canEdit`/`canRefund`) приходят в сводке оплат. Фолбэки ниже нужны
 * только окружению без релиза истории: там полей нет, а карточка не должна
 * падать или врать про долг.
 */
import dayjs from "dayjs";

import type {
  AppointmentPayment,
  AppointmentRefund,
  PaymentKind,
  PaymentPhase,
  PaymentRevision,
  PaymentSummary,
} from "../../../../api/payments";
import { resolvePaymentPhase, type PaymentPhaseSource } from "../../../../utility/paymentPhase";

/** Одно событие ленты истории. */
export type PaymentHistoryEvent =
  | {
      type: "payment";
      key: string;
      at: string;
      payment: AppointmentPayment;
      kind: PaymentKind;
      /** Сколько уже вернули по этой оплате. */
      refunded: number;
      /** Правки этой оплаты, новые сверху. */
      revisions: PaymentRevision[];
    }
  | {
      type: "refund";
      key: string;
      at: string;
      refund: AppointmentRefund;
    }
  | {
      type: "deleted";
      key: string;
      at: string;
      revision: PaymentRevision;
    };

export interface PaymentHistoryDay {
  /** YYYY-MM-DD в часовом поясе браузера. */
  date: string;
  events: PaymentHistoryEvent[];
}

const num = (value: string | number | null | undefined): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Вид оплаты: бэк присылает его сам; без него считаем так же — до начала
 * приёма предоплата, в день приёма оплата, позже — погашение долга.
 */
export function paymentKindOf(
  payment: AppointmentPayment,
  appointmentStartsAt: string | null | undefined,
): PaymentKind {
  if (payment.kind) return payment.kind;
  if (payment.isPrepayment) return "prepayment";
  if (!appointmentStartsAt) return "payment";
  const paid = dayjs(payment.createdAt);
  const start = dayjs(appointmentStartsAt);
  if (paid.isBefore(start)) return "prepayment";
  if (paid.isAfter(start, "day")) return "debt_repayment";
  return "payment";
}

export { resolvePaymentPhase };
export type { PaymentPhaseSource };

/** Цифры полосы «куда ушли деньги» — всё в сомах. */
export interface SettlementView {
  phase: PaymentPhase;
  started: boolean;
  payable: number;
  prepaid: number;
  paidAfterStart: number;
  refunded: number;
  remaining: number;
  debt: number;
}

/** Цифры для полосы и легенды: из `settlement`, иначе из старых полей сводки. */
export function settlementViewOf(
  summary: PaymentSummary,
  fallback: PaymentPhaseSource,
  now: number = Date.now(),
): SettlementView {
  const s = summary.settlement;
  const payable = num(summary.payableAmount);
  const refunded = num(summary.refundedTotal);
  if (s) {
    return {
      phase: s.phase,
      started: s.started,
      payable,
      prepaid: num(s.prepaidAmount),
      paidAfterStart: num(s.paidAfterStartAmount),
      refunded,
      remaining: num(s.remainingAmount),
      debt: num(s.debtAmount),
    };
  }
  const phase = resolvePaymentPhase(
    {
      ...fallback,
      paymentStatus: summary.paymentStatus,
      paidTotal: summary.paidNet ?? summary.paidTotal,
      payableAmount: summary.payableAmount,
    },
    now,
  );
  const startsAt = fallback.scheduledAt ? Date.parse(fallback.scheduledAt) : NaN;
  const started = Number.isFinite(startsAt) ? startsAt <= now : phase === "debt";
  let prepaid = 0;
  let after = 0;
  for (const payment of summary.payments) {
    const net = Math.max(0, num(payment.amount) - num(payment.refundedAmount));
    if (paymentKindOf(payment, fallback.scheduledAt) === "prepayment") prepaid += net;
    else after += net;
  }
  const remaining = num(summary.debt);
  return {
    phase,
    started,
    payable,
    prepaid,
    paidAfterStart: after,
    refunded,
    remaining,
    debt: phase === "debt" ? remaining : 0,
  };
}

/**
 * Лента истории: оплаты, возвраты и удалённые оплаты, новые сверху,
 * сгруппированные по дням. Удалённая оплата живёт только в правках — её
 * снимок рисуется как зачёркнутая строка, чтобы деньги не «исчезали молча».
 */
export function buildPaymentHistory(
  summary: PaymentSummary,
  appointmentStartsAt: string | null | undefined,
): PaymentHistoryDay[] {
  const revisions = summary.revisions ?? [];
  const refunds = summary.refunds ?? [];

  const refundedByPayment = new Map<number, number>();
  for (const refund of refunds) {
    refundedByPayment.set(
      refund.paymentId,
      (refundedByPayment.get(refund.paymentId) ?? 0) + num(refund.amount),
    );
  }
  const revisionsByPayment = new Map<number, PaymentRevision[]>();
  for (const revision of revisions) {
    if (revision.action !== "updated") continue;
    const list = revisionsByPayment.get(revision.paymentId) ?? [];
    list.push(revision);
    revisionsByPayment.set(revision.paymentId, list);
  }

  const events: PaymentHistoryEvent[] = [
    ...summary.payments.map(
      (payment): PaymentHistoryEvent => ({
        type: "payment",
        key: `payment-${payment.id}`,
        at: payment.createdAt,
        payment,
        kind: paymentKindOf(payment, appointmentStartsAt),
        refunded: refundedByPayment.get(payment.id) ?? num(payment.refundedAmount),
        revisions: [...(revisionsByPayment.get(payment.id) ?? [])].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      }),
    ),
    ...refunds.map(
      (refund): PaymentHistoryEvent => ({
        type: "refund",
        key: `refund-${refund.id}`,
        at: refund.createdAt,
        refund,
      }),
    ),
    ...revisions
      .filter((revision) => revision.action === "deleted")
      .map(
        (revision): PaymentHistoryEvent => ({
          type: "deleted",
          key: `deleted-${revision.id}`,
          at: revision.createdAt,
          revision,
        }),
      ),
  ];

  events.sort((a, b) => {
    const diff = Date.parse(b.at) - Date.parse(a.at);
    return diff !== 0 ? diff : b.key.localeCompare(a.key);
  });

  const days: PaymentHistoryDay[] = [];
  for (const event of events) {
    const date = dayjs(event.at).format("YYYY-MM-DD");
    const last = days[days.length - 1];
    if (last && last.date === date) last.events.push(event);
    else days.push({ date, events: [event] });
  }
  return days;
}

/** Сколько операций с деньгами в ленте (без удалённых). */
export function countMoneyEvents(days: PaymentHistoryDay[]): number {
  return days.reduce(
    (sum, day) => sum + day.events.filter((event) => event.type !== "deleted").length,
    0,
  );
}

/**
 * Изменения правки в читаемом виде: поле → «было → стало». Поля бэка
 * snake_case; неизвестные поля пропускаем, а не показываем сырыми ключами.
 */
export const REVISION_FIELDS = [
  "amount",
  "method",
  "cashless_method",
  "insurer",
  "policy_number",
  "cash_date",
  "note",
] as const;

export type RevisionField = (typeof REVISION_FIELDS)[number];

export function revisionChanges(
  revision: PaymentRevision,
): { field: RevisionField; old: unknown; new: unknown }[] {
  return REVISION_FIELDS.filter((field) => field in (revision.changes ?? {})).map((field) => ({
    field,
    old: revision.changes[field]?.old,
    new: revision.changes[field]?.new,
  }));
}
