import { describe, expect, it } from "vitest";

import { buildXReportHtml } from "./xReportPrint";
import type { CashboxShiftSummary } from "../../../../api/cashboxShifts";

const summary: CashboxShiftSummary = {
  shift: {
    id: 42,
    organizationId: 1,
    branchId: 1,
    branchName: "Мама Доктор",
    status: "open",
    openedById: 3,
    openedByName: "Смирнова Е.",
    openedAt: "2026-09-20T03:00:00Z",
    openingCash: "1000.00",
    closedById: null,
    closedByName: null,
    closedAt: null,
    expectedCash: null,
    actualCash: null,
    difference: null,
    closeComment: "",
    createdAt: "2026-09-20T03:00:00Z",
  },
  cashIncome: "5000.00",
  cashRefunds: "0.00",
  cashExpenses: "300.00",
  expectedCash: "5700.00",
  cardIncome: "2000.00",
  cardRefunds: "0.00",
  cardExpenses: "0.00",
  balancePayments: "0.00",
  balanceRefunds: "0.00",
  paymentCount: 9,
  refundCount: 0,
  expenseCount: 1,
  salesCash: "0.00",
  salesCard: "0.00",
  saleCount: 0,
  supplyCash: "0.00",
  supplyCard: "0.00",
  supplyCount: 0,
};

describe("buildXReportHtml", () => {
  it("подписывает отчёт и смену", () => {
    const html = buildXReportHtml({ summary, organizationName: "Мама Доктор", takenAt: "2026-09-20T09:30:00Z" });

    expect(html).toContain("X-отчёт");
    expect(html).toContain("#42");
    expect(html).toContain("Должно быть в кассе");
  });

  it("у открытой смены печатает, что она не закрыта", () => {
    expect(buildXReportHtml({ summary })).toContain("смена не закрыта");
  });

  it("закрытая смена этой пометки не несёт", () => {
    const closed: CashboxShiftSummary = {
      ...summary,
      shift: { ...summary.shift, status: "closed", closedAt: "2026-09-20T12:00:00Z", closedByName: "Смирнова Е." },
    };

    expect(buildXReportHtml({ summary: closed })).not.toContain("смена не закрыта");
  });

  it("лента 80 мм печатает строками, лист — таблицей", () => {
    const tape = buildXReportHtml({ summary, pageSize: "80mm" });
    const sheet = buildXReportHtml({ summary, pageSize: "A4" });

    expect(tape).toContain("size: 80mm auto");
    expect(tape).not.toContain("<table");
    expect(sheet).toContain("size: A4 portrait");
    expect(sheet).toContain("<table");
    // Место для подписей есть только на листе: на ленте расписываться негде.
    expect(sheet).toContain("Кассир");
    expect(tape).not.toContain("Кассир");
  });

  it("A5 остаётся таблицей своего размера", () => {
    const html = buildXReportHtml({ summary, pageSize: "A5" });

    expect(html).toContain("size: A5 portrait");
    expect(html).toContain("<table");
  });

  it("расхождение с кассой печатается предупреждением", () => {
    // 1000 + 5000 − 300 = 5700; бэк насчитал 6500 — разница видна на бумаге.
    const html = buildXReportHtml({ summary: { ...summary, expectedCash: "6500.00" } });

    expect(html).toContain("Не раскладывается по строкам");
  });

  it("сходящийся отчёт печатается без предупреждения", () => {
    expect(buildXReportHtml({ summary })).not.toContain("Не раскладывается по строкам");
  });

  it("разрез безнала попадает на бумагу", () => {
    const html = buildXReportHtml({
      summary: {
        ...summary,
        byCashlessMethod: [
          { cashlessMethodId: 2, cashlessMethodName: "Elcart", income: "2000.00", refunds: "0.00", expenses: "0.00", supplyExpenses: "0.00", count: 3 },
        ],
      },
      pageSize: "A4",
    });

    expect(html).toContain("Elcart");
  });

  it("экранирует название организации", () => {
    const html = buildXReportHtml({ summary, organizationName: '<script>alert("x")</script>' });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
