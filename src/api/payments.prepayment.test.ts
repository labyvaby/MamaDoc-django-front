import { describe, expect, it } from "vitest";

import { manualPaymentsOf } from "./payments";
import type { AppointmentPayment, PaymentSummary } from "./payments";

/**
 * Онлайн-предоплата брони приходит в журнал приёма отдельной `card`-строкой.
 * Форма оплаты не должна брать её ни в поля сумм, ни в способ безнала, ни в
 * дату кассы: строка живёт сама, а отправка её в apply даёт 400 (переплата +
 * дата кассы вне пресетов).
 */
const payment = (over: Partial<AppointmentPayment>): AppointmentPayment => ({
  id: 1,
  method: "card",
  amount: "500.00",
  createdAt: "2026-08-24T10:00:00+06:00",
  cashDate: "2026-08-24",
  ...over,
});

const summaryOf = (payments: AppointmentPayment[]): PaymentSummary => ({
  appointmentId: 7,
  totalAmount: "1500.00",
  discountAmount: "0.00",
  payableAmount: "1500.00",
  paidTotal: "500.00",
  debt: "1000.00",
  paymentStatus: "partial",
  payments,
});

describe("manualPaymentsOf", () => {
  it("исключает строку предоплаты из кассовых платежей", () => {
    const summary = summaryOf([
      payment({ id: 1, isPrepayment: true, cashlessMethodName: "Бакай Paylink" }),
      payment({ id: 2, method: "cash", amount: "1000.00" }),
    ]);
    expect(manualPaymentsOf(summary).map((p) => p.id)).toEqual([2]);
  });

  it("на окружении без релиза предоплаты не меняет список", () => {
    const summary = summaryOf([payment({ id: 1 }), payment({ id: 2, method: "cash" })]);
    expect(manualPaymentsOf(summary)).toHaveLength(2);
  });

  it("не берёт способ безнала и дату кассы из предоплаты", () => {
    const summary = summaryOf([
      payment({
        id: 1,
        isPrepayment: true,
        cashlessMethodId: 42,
        cashlessMethodName: "Бакай Paylink",
        cashDate: "2026-08-20",
      }),
    ]);
    const manual = manualPaymentsOf(summary);
    expect(manual.find((p) => p.method === "card")).toBeUndefined();
    expect(manual.find((p) => p.cashDate)).toBeUndefined();
  });

  it("пустая сводка не ломает разбор", () => {
    expect(manualPaymentsOf(undefined)).toEqual([]);
    expect(manualPaymentsOf(null)).toEqual([]);
  });
});
