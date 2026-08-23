import { describe, expect, it } from "vitest";

import "../../../i18n";
import type { CashboxSummary } from "../../../api/cashbox";
import { cardFlowNumbers, cashFlowNumbers, cashNet } from "./flowNumbers";

/**
 * Арифметика карточек кассы. Проверяем ровно то, что легко сломать правкой
 * вида: возврат снова стал отдельной строкой расхода (и деньги посчитались
 * дважды), знак подстроки унаследовался от родителя, «Без способа» уехал
 * наверх списка.
 */

const summary = (patch: Partial<CashboxSummary>): CashboxSummary =>
  ({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-23",
    organizationId: 1,
    branchId: 1,
    cashIncome: "0.00",
    cardIncome: "0.00",
    cashRefunds: "0.00",
    cardRefunds: "0.00",
    grossIncome: "0.00",
    refundedTotal: "0.00",
    netIncome: "0.00",
    balancePayments: "0.00",
    balanceRefunds: "0.00",
    insuranceIncome: "0.00",
    insuranceRefunds: "0.00",
    paymentCount: 0,
    refundCount: 0,
    cashExpenses: "0.00",
    cardExpenses: "0.00",
    totalExpenses: "0.00",
    netCashFlow: "0.00",
    expenseCount: 0,
    salesCashIncome: "0.00",
    salesCardIncome: "0.00",
    salesTotal: "0.00",
    saleCount: 0,
    supplyCashExpenses: "0.00",
    supplyCardExpenses: "0.00",
    supplyTotal: "0.00",
    supplyCount: 0,
    ...patch,
  }) as CashboxSummary;

const row = (rows: ReturnType<typeof cardFlowNumbers>["breakdown"], key: string) => {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`строки ${key} нет`);
  return found;
};

describe("cardFlowNumbers — безнал", () => {
  const s = summary({
    cardIncome: "148200.00",
    cardRefunds: "1200.00",
    salesCardIncome: "1300.00",
    cardExpenses: "5400.00",
    byCashlessMethod: [
      {
        cashlessMethodId: 1,
        cashlessMethodName: "Бакай",
        income: "120000.00",
        refunds: "1200.00",
        expenses: "5400.00",
        supplyExpenses: "0.00",
        count: 61,
      },
      {
        cashlessMethodId: 2,
        cashlessMethodName: "MBank",
        income: "28200.00",
        refunds: "0.00",
        expenses: "0.00",
        supplyExpenses: "0.00",
        count: 24,
      },
    ],
  });

  it("оплаты идут нетто, возврат — подстрокой, отдельной строки возвратов нет", () => {
    const { breakdown } = cardFlowNumbers(s);

    expect(breakdown.map((r) => r.key)).toEqual(["payment", "sale", "expense", "supply"]);

    const payment = row(breakdown, "payment");
    expect(payment.amount).toBe(147000);
    expect(payment.direction).toBe(1);
    expect(payment.children?.map((c) => [c.label, c.amount, c.direction ?? 1])).toEqual([
      ["Бакай", 120000, 1],
      ["MBank", 28200, 1],
      ["Возвраты", 1200, -1],
    ]);
  });

  it("подстроки складываются в сумму строки", () => {
    const payment = row(cardFlowNumbers(s).breakdown, "payment");
    const sum = (payment.children ?? []).reduce(
      (acc, c) => acc + c.amount * (c.direction ?? payment.direction),
      0,
    );
    expect(sum).toBe(payment.amount * payment.direction);
  });

  it("приход нетто, возвраты не попадают в расход", () => {
    const { inflow, outflow } = cardFlowNumbers(s);
    expect(inflow).toBe(147000 + 1300);
    expect(outflow).toBe(5400);
    // Итог карточки не должен зависеть от того, где показан возврат.
    expect(inflow - outflow).toBe(148200 + 1300 - 1200 - 5400);
  });

  it("возвратов больше, чем оплат — строка уходит в минус", () => {
    const { breakdown, inflow } = cardFlowNumbers(
      summary({ cardIncome: "1000.00", cardRefunds: "3500.00" }),
    );
    const payment = row(breakdown, "payment");
    expect(payment.amount).toBe(2500);
    expect(payment.direction).toBe(-1);
    expect(inflow).toBe(-2500);
  });

  it("без возвратов подстроки — только способы", () => {
    const { breakdown } = cardFlowNumbers(summary({ ...s, cardRefunds: "0.00" }));
    expect(row(breakdown, "payment").children?.map((c) => c.label)).toEqual(["Бакай", "MBank"]);
  });

  it("«Без способа» стоит после реальных способов, даже если сумма больше", () => {
    const { breakdown } = cardFlowNumbers(
      summary({
        cardIncome: "1670610.00",
        byCashlessMethod: [
          {
            cashlessMethodId: null,
            cashlessMethodName: null,
            income: "994880.00",
            refunds: "0.00",
            expenses: "0.00",
            supplyExpenses: "0.00",
            count: 657,
          },
          {
            cashlessMethodId: 1,
            cashlessMethodName: "Bakai POS",
            income: "675730.00",
            refunds: "0.00",
            expenses: "0.00",
            supplyExpenses: "0.00",
            count: 534,
          },
        ],
      }),
    );
    expect(row(breakdown, "payment").children?.map((c) => c.label)).toEqual([
      "Bakai POS",
      "Без способа",
    ]);
  });

  // Разрез продаж включается сам, когда бэк начнёт отдавать salesIncome
  // (тикет backend_ticket_sales_cashless_method.md) — флага в коде нет.
  it("без salesIncome у продаж нет подстрок, но есть объяснение", () => {
    const sale = row(cardFlowNumbers(s).breakdown, "sale");
    expect(sale.children).toEqual([]);
    expect(sale.hint).toBeTruthy();
  });

  it("с salesIncome продажи режутся по способам, подпись пропадает", () => {
    const withSales = summary({
      ...s,
      salesCardIncome: "1300.00",
      byCashlessMethod: [
        {
          cashlessMethodId: 1,
          cashlessMethodName: "Бакай",
          income: "120000.00",
          refunds: "1200.00",
          expenses: "5400.00",
          supplyExpenses: "0.00",
          salesIncome: "1000.00",
          count: 61,
        },
        {
          cashlessMethodId: 2,
          cashlessMethodName: "MBank",
          income: "28200.00",
          refunds: "0.00",
          expenses: "0.00",
          supplyExpenses: "0.00",
          salesIncome: "300.00",
          count: 24,
        },
      ],
    });
    const sale = row(cardFlowNumbers(withSales).breakdown, "sale");
    expect(sale.children?.map((c) => [c.label, c.amount])).toEqual([
      ["Бакай", 1000],
      ["MBank", 300],
    ]);
    expect(sale.hint).toBeUndefined();
    // Разрез обязан сходиться с salesCardIncome — иначе сверка на экране врёт.
    const sum = (sale.children ?? []).reduce((acc, c) => acc + c.amount, 0);
    expect(sum).toBe(sale.amount);
  });
});

describe("cashFlowNumbers — наличные", () => {
  it("возврат виден подстрокой рядом с оплаченным", () => {
    const { breakdown, inflow, outflow } = cashFlowNumbers(
      summary({ cashIncome: "14830.00", cashRefunds: "800.00", cashExpenses: "15165.00" }),
    );
    const payment = row(breakdown, "payment");
    expect(payment.amount).toBe(14030);
    expect(payment.children?.map((c) => [c.label, c.amount, c.direction])).toEqual([
      ["Оплачено", 14830, 1],
      ["Возвраты", 800, -1],
    ]);
    expect(inflow).toBe(14030);
    expect(outflow).toBe(15165);
  });

  it("без возвратов разреза нет вовсе", () => {
    const { breakdown } = cashFlowNumbers(summary({ cashIncome: "14830.00" }));
    expect(row(breakdown, "payment").children).toEqual([]);
  });
});

describe("cashNet — остаток по учёту", () => {
  it("возвраты, расходы и закупки уменьшают остаток", () => {
    expect(
      cashNet(
        summary({
          cashIncome: "20000.00",
          salesCashIncome: "500.00",
          cashRefunds: "800.00",
          cashExpenses: "2000.00",
          supplyCashExpenses: "218.00",
        }),
      ),
    ).toBe(17482);
  });
});
