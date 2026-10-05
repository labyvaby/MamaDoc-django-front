import { describe, expect, it } from "vitest";

import { fromRawAccount, fromRawSummary, isPartiallyPaid } from "./billing";

const row = (paid: string, balance: string, state = "overdue") => ({ number: 1, dueDate: "2026-09-20", amount: "198600.00", paid, balance, state });

describe("billing: переходники ответа бэка", () => {
  it("деньги-строки → числа, отсутствующие поля карточки — пустые значения", () => {
    const account = fromRawAccount({
      id: 9,
      number: "РС-0009",
      buyer: "Нурия",
      phone: "",
      projectId: 3,
      project: "Северный квартал",
      unitId: 65,
      unitNumber: 3065,
      contract: "ДКП-2026-3065",
      term: 24,
      startDate: "2026-08-20",
      total: "9000000.00",
      downPayment: "4233000.00",
      monthly: "198600.00",
      paidAmount: "0.00",
      paidCount: 0,
      progress: 0,
      outstanding: "4767000.00",
      overdue: "198600.00",
      state: "overdue",
      stateLabel: "Просрочен",
      next: row("0.00", "198600.00") as never,
      lastReminder: null,
      manager: null,
      autopay: false,
    } as never);
    expect(account.outstanding).toBe(4767000);
    expect(account.next?.balance).toBe(198600);
    expect(account.payLinkEnabled).toBe(false);
    expect(account.schedule).toEqual([]);
    expect(account.downPaymentDue).toBe(0);
  });

  it("сводка без какого-то счётчика вкладки — ноль, а не undefined", () => {
    const summary = fromRawSummary({
      expected: "2637700.00",
      received: "546000.00",
      collectedPct: 21,
      overdue: "1447100.00",
      overdueCount: 6,
      active: 9,
      activeAutopay: 4,
      remindersToday: 1,
      counts: { all: 10, overdue: 6 } as never,
      calendar: [{ accountId: 6, buyer: "Нурбек", unitNumber: 3043, dueDate: "2026-09-14", balance: "232500.00" }],
    });
    expect(summary.expected).toBe(2637700);
    expect(summary.counts.completed).toBe(0);
    expect(summary.calendar[0].balance).toBe(232500);
  });

  it("частичная оплата — внесено, но остаток есть", () => {
    const parse = (paid: string, balance: string) => fromRawAccount({ schedule: [row(paid, balance)] } as never).schedule[0];
    expect(isPartiallyPaid(parse("50000.00", "148600.00"))).toBe(true);
    expect(isPartiallyPaid(parse("0.00", "198600.00"))).toBe(false);
    expect(isPartiallyPaid(parse("198600.00", "0.00"))).toBe(false);
  });
});
