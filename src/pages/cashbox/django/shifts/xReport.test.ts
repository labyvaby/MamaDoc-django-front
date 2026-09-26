import { describe, expect, it } from "vitest";

import { buildXReport, formatCell, isEmptyRow } from "./xReport";
import type { CashboxShiftSummary } from "../../../../api/cashboxShifts";

const shift: CashboxShiftSummary["shift"] = {
  id: 7,
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
};

const summary = (over: Partial<CashboxShiftSummary> = {}): CashboxShiftSummary => ({
  shift,
  cashIncome: "5000.00",
  cashRefunds: "500.00",
  cashExpenses: "300.00",
  expectedCash: "5200.00",
  cardIncome: "2000.00",
  cardRefunds: "0.00",
  cardExpenses: "0.00",
  balancePayments: "150.00",
  balanceRefunds: "0.00",
  paymentCount: 12,
  refundCount: 1,
  expenseCount: 2,
  salesCash: "0.00",
  salesCard: "0.00",
  saleCount: 0,
  supplyCash: "0.00",
  supplyCard: "0.00",
  supplyCount: 0,
  ...over,
});

describe("buildXReport", () => {
  it("раскладывает операции по способам оплаты", () => {
    const report = buildXReport(summary());
    const byKey = Object.fromEntries(report.rows.map((r) => [r.key, r]));

    expect(byKey.payments).toMatchObject({ cash: 5000, cashless: 2000, balance: 150, count: 12 });
    expect(byKey.payments.total).toBe(7150);
  });

  it("уносящие деньги операции идут со знаком минус", () => {
    const report = buildXReport(
      summary({ supplyCash: "700.00", supplyCount: 1, cardExpenses: "250.00" }),
    );
    const byKey = Object.fromEntries(report.rows.map((r) => [r.key, r]));

    expect(byKey.refunds.cash).toBe(-500);
    expect(byKey.supplies.cash).toBe(-700);
    expect(byKey.expenses).toMatchObject({ cash: -300, cashless: -250 });
  });

  it("считает движение за смену и ожидаемую наличность", () => {
    const report = buildXReport(summary());

    // 5000 − 500 − 300 = 4200 наличными, плюс остаток 1000.
    expect(report.movement.cash).toBe(4200);
    expect(report.opening).toBe(1000);
    expect(report.computedCash).toBe(5200);
    expect(report.expectedCash).toBe(5200);
    expect(report.mismatch).toBe(0);
  });

  it("показывает расхождение, если бэк учёл в кассе что-то помимо строк", () => {
    // Внесение 800 сом своих полей в сводке не имеет — видно только так.
    const report = buildXReport(summary({ expectedCash: "6000.00" }));

    expect(report.computedCash).toBe(5200);
    expect(report.mismatch).toBe(800);
  });

  it("продажи товаров двигают кассу наравне с оплатами", () => {
    const report = buildXReport(
      summary({ salesCash: "900.00", salesCard: "100.00", saleCount: 3, expectedCash: "6100.00" }),
    );
    const sales = report.rows.find((r) => r.key === "sales");

    expect(sales).toMatchObject({ cash: 900, cashless: 100, count: 3 });
    expect(report.computedCash).toBe(6100);
    expect(report.mismatch).toBe(0);
  });

  it("разрез безнала идёт подстроками своей операции", () => {
    const report = buildXReport(
      summary({
        byCashlessMethod: [
          { cashlessMethodId: 2, cashlessMethodName: "Elcart", income: "1500.00", refunds: "0.00", expenses: "0.00", supplyExpenses: "0.00", count: 4 },
          { cashlessMethodId: 3, cashlessMethodName: "O!Dengi", income: "500.00", refunds: "0.00", expenses: "200.00", supplyExpenses: "0.00", count: 2 },
          { cashlessMethodId: null, cashlessMethodName: null, income: "0.00", refunds: "0.00", expenses: "0.00", supplyExpenses: "0.00", count: 0 },
        ],
      }),
    );
    const byKey = Object.fromEntries(report.rows.map((r) => [r.key, r]));

    expect(byKey.payments.methods).toEqual([
      { key: "2", name: "Elcart", amount: 1500, muted: false },
      { key: "3", name: "O!Dengi", amount: 500, muted: false },
    ]);
    // У расходов свой разрез, и он тоже со знаком минус.
    expect(byKey.expenses.methods).toEqual([
      { key: "3", name: "O!Dengi", amount: -200, muted: false },
    ]);
  });

  it("способ без справочника подписан и помечен", () => {
    const report = buildXReport(
      summary({
        byCashlessMethod: [
          { cashlessMethodId: null, cashlessMethodName: null, income: "300.00", refunds: "0.00", expenses: "0.00", supplyExpenses: "0.00", count: 1 },
        ],
      }),
    );

    expect(report.rows[0].methods[0]).toMatchObject({ name: "Без способа", muted: true });
  });
});

describe("вспомогательные", () => {
  it("пустую строку видно по всем трём колонкам", () => {
    const report = buildXReport(summary());
    const sales = report.rows.find((r) => r.key === "sales")!;

    expect(isEmptyRow(sales)).toBe(true);
    expect(isEmptyRow(report.rows[0])).toBe(false);
  });

  it("ноль в клетке — прочерк, минус — типографский", () => {
    expect(formatCell(0)).toBe("—");
    // toLocaleString разделяет разряды неразрывным пробелом — сравниваем по цифрам.
    expect(formatCell(-1500.5).replace(/\s/g, " ")).toBe("− 1 500,50");
  });
});
