import { describe, expect, it } from "vitest";

import type {
  AppointmentPayment,
  AppointmentRefund,
  PaymentRevision,
  PaymentSummary,
} from "../../../../api/payments";
import {
  buildPaymentHistory,
  countMoneyEvents,
  paymentKindOf,
  resolvePaymentPhase,
  revisionChanges,
  settlementViewOf,
} from "./paymentHistoryModel";

/**
 * «До начала приёма остаток — не долг» легко сломать молча: карточка просто
 * снова покажет красный «Долг» у будущей записи с предоплатой. Фиксируем
 * правила тестами — логика чистая, рендер не нужен.
 */

const NOW = Date.parse("2026-10-05T08:00:00Z");
const IN_2H = new Date(NOW + 2 * 3600_000).toISOString();
const AGO_1H = new Date(NOW - 3600_000).toISOString();

const payment = (over: Partial<AppointmentPayment>): AppointmentPayment => ({
  id: 1,
  method: "cash",
  amount: "300.00",
  refundedAmount: "0",
  createdAt: new Date(NOW - 30 * 60_000).toISOString(),
  cashDate: "2026-10-05",
  ...over,
});

const summary = (over: Partial<PaymentSummary>): PaymentSummary => ({
  appointmentId: 7,
  totalAmount: "1000.00",
  discountAmount: "0.00",
  payableAmount: "1000.00",
  paidTotal: "300.00",
  refundedTotal: "0.00",
  paidNet: "300.00",
  debt: "700.00",
  paymentStatus: "partial",
  payments: [payment({})],
  refunds: [],
  ...over,
});

describe("фаза счёта: до начала приёма остаток — не долг", () => {
  it("бэк прислал фазу — берём её как есть", () => {
    expect(resolvePaymentPhase({ paymentPhase: "debt", scheduledAt: IN_2H }, NOW)).toBe("debt");
  });

  it("будущий приём с частичной оплатой — предоплата", () => {
    expect(
      resolvePaymentPhase(
        { status: "scheduled", scheduledAt: IN_2H, paymentStatus: "partial", paidTotal: "300", payableAmount: "1000" },
        NOW,
      ),
    ).toBe("prepaid");
  });

  it("будущий приём без денег — ждём оплату, а не долг", () => {
    expect(
      resolvePaymentPhase(
        { status: "scheduled", scheduledAt: IN_2H, paymentStatus: "unpaid", paidTotal: "0", payableAmount: "1000" },
        NOW,
      ),
    ).toBe("awaiting");
  });

  it("приём начался — остаток становится долгом", () => {
    expect(
      resolvePaymentPhase(
        { status: "scheduled", scheduledAt: AGO_1H, paymentStatus: "partial", paidTotal: "300", payableAmount: "1000" },
        NOW,
      ),
    ).toBe("debt");
  });

  it("врач начал раньше времени — это уже начало", () => {
    expect(
      resolvePaymentPhase(
        { status: "in_progress", scheduledAt: IN_2H, paymentStatus: "partial", paidTotal: "300", payableAmount: "1000" },
        NOW,
      ),
    ).toBe("debt");
  });

  it("отмена, оплачено, скидка, бесплатно", () => {
    expect(resolvePaymentPhase({ status: "canceled", scheduledAt: IN_2H }, NOW)).toBe("canceled");
    expect(resolvePaymentPhase({ status: "scheduled", paymentStatus: "paid" }, NOW)).toBe("paid");
    expect(resolvePaymentPhase({ status: "scheduled", paymentStatus: "discounted" }, NOW)).toBe("discounted");
    expect(resolvePaymentPhase({ status: "scheduled", payableAmount: "0" }, NOW)).toBe("free");
  });
});

describe("вид оплаты", () => {
  it("до начала — предоплата, в день приёма — оплата, позже — погашение долга", () => {
    const start = "2026-10-05T10:00:00Z";
    expect(paymentKindOf(payment({ createdAt: "2026-10-05T09:00:00Z" }), start)).toBe("prepayment");
    expect(paymentKindOf(payment({ createdAt: "2026-10-05T10:30:00Z" }), start)).toBe("payment");
    expect(paymentKindOf(payment({ createdAt: "2026-10-08T10:30:00Z" }), start)).toBe("debt_repayment");
  });

  it("защищённая предоплата и вид от бэка важнее часов", () => {
    expect(paymentKindOf(payment({ isPrepayment: true, createdAt: "2026-10-09T00:00:00Z" }), "2026-10-05T10:00:00Z")).toBe(
      "prepayment",
    );
    expect(paymentKindOf(payment({ kind: "payment", createdAt: "2026-10-01T00:00:00Z" }), "2026-10-05T10:00:00Z")).toBe(
      "payment",
    );
  });
});

describe("полоса расчёта", () => {
  it("берёт цифры из settlement бэка", () => {
    const view = settlementViewOf(
      summary({
        settlement: {
          phase: "prepaid",
          started: false,
          startsAt: IN_2H,
          prepaidAmount: "300.00",
          paidAfterStartAmount: "0.00",
          remainingAmount: "700.00",
          debtAmount: "0.00",
        },
      }),
      { scheduledAt: IN_2H },
      NOW,
    );
    expect(view).toMatchObject({ phase: "prepaid", prepaid: 300, remaining: 700, debt: 0, payable: 1000 });
  });

  it("без settlement считает сама и не называет остаток будущего приёма долгом", () => {
    const view = settlementViewOf(summary({}), { status: "scheduled", scheduledAt: IN_2H }, NOW);
    expect(view.phase).toBe("prepaid");
    expect(view.prepaid).toBe(300);
    expect(view.debt).toBe(0);
    expect(view.remaining).toBe(700);
  });
});

describe("лента истории", () => {
  const deleted: PaymentRevision = {
    id: 3,
    paymentId: 99,
    action: "deleted",
    source: "history",
    changes: {},
    snapshot: { amount: "200.00", method: "card" },
    reason: "Дубль",
    createdById: 1,
    createdByName: "Айгуль",
    createdAt: "2026-10-05T07:50:00Z",
  };
  const edited: PaymentRevision = {
    ...deleted,
    id: 4,
    paymentId: 1,
    action: "updated",
    changes: { amount: { old: "500.00", new: "300.00" }, method: { old: "card", new: "cash" } },
    snapshot: { amount: "500.00", method: "card" },
    createdAt: "2026-10-05T07:55:00Z",
  };
  const refund: AppointmentRefund = {
    id: 5,
    paymentId: 1,
    method: "cash",
    amount: "100.00",
    reason: "Передумал",
    createdById: 1,
    createdAt: "2026-10-05T07:58:00Z",
  };

  it("оплаты, возвраты и удалённые — новые сверху, по дням", () => {
    const days = buildPaymentHistory(
      summary({
        payments: [
          payment({ id: 1, createdAt: "2026-10-05T07:30:00Z" }),
          payment({ id: 2, createdAt: "2026-10-03T07:30:00Z", amount: "50.00" }),
        ],
        refunds: [refund],
        revisions: [deleted, edited],
      }),
      "2026-10-05T10:00:00Z",
    );
    expect(days.map((d) => d.events.map((e) => e.key))).toEqual([
      ["refund-5", "deleted-3", "payment-1"],
      ["payment-2"],
    ]);
    const first = days[0].events[2];
    expect(first.type === "payment" && first.refunded).toBe(100);
    expect(first.type === "payment" && first.revisions.map((r) => r.id)).toEqual([4]);
    expect(countMoneyEvents(days)).toBe(3);
  });

  it("изменения правки — в порядке полей, без незнакомых ключей", () => {
    expect(
      revisionChanges({ ...edited, changes: { ...edited.changes, weird: { old: 1, new: 2 } } }).map((c) => c.field),
    ).toEqual(["amount", "method"]);
  });
});
