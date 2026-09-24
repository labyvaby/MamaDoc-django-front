import { describe, expect, it } from "vitest";

import { isDashboardSummaryV2, type DashboardSummary } from "../../api/dashboard";
import type { CashboxSummary } from "../../api/cashbox";
import type { MonthlyReport } from "../../api/reports";
import { attentionInputFromSections, buildAttentionItems } from "./attention";
import { collectRows } from "./exportDashboardXlsx";
import type { DashboardData } from "./DashboardData";
import { legacyAppointments, legacyMoney, legacyMonth } from "./legacyData";
import { resolvePeriod } from "./period";
import dayjs from "dayjs";

const summary = (sections: DashboardSummary["sections"]): DashboardSummary => ({
  dateFrom: "2026-09-01",
  dateTo: "2026-09-24",
  compareFrom: "2026-08-01",
  compareTo: "2026-08-24",
  organizationId: 1,
  branchId: null,
  sections,
  generatedAt: "2026-09-24T18:03:11.402+06:00",
});

describe("версия агрегата", () => {
  it("v2 узнаётся по visits у записей", () => {
    expect(
      isDashboardSummaryV2(summary({ appointments: { total: 5, visits: 4, baseline: null } })),
    ).toBe(true);
  });

  it("первая версия (прод 24.09.2026) — без visits", () => {
    // Ровно те ключи, что отдавал прод: total, paid, canceled, repeatVisits…
    expect(
      isDashboardSummaryV2(
        summary({
          appointments: { total: 5, paid: 3, canceled: 1, repeatVisits: 1, baseline: null },
          tasks: { new: 1, inProgress: 0, awaitingApproval: 0, overdue: 0, newForMe: 0, baseline: null },
        }),
      ),
    ).toBe(false);
  });

  it("без записей — по разделам, которых в v1 не было", () => {
    const month = summary({
      month: {
        month: "2026-09",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-24",
        daysInMonth: 30,
        daysElapsed: 24,
        netIncome: "0.00",
        previousMonth: null,
        daily: [],
        baseline: null,
      },
    });
    expect(isDashboardSummaryV2(month)).toBe(true);
    expect(isDashboardSummaryV2(undefined)).toBe(false);
  });
});

const cash = (netIncome: string, extra: Partial<CashboxSummary> = {}) =>
  ({
    netIncome,
    grossIncome: netIncome,
    cashIncome: netIncome,
    cardIncome: "0.00",
    cashRefunds: "0.00",
    cardRefunds: "0.00",
    refundedTotal: "0.00",
    balancePayments: "0.00",
    balanceRefunds: "0.00",
    insuranceIncome: "0.00",
    insuranceRefunds: "0.00",
    paymentCount: 2,
    refundCount: 0,
    salesTotal: "0.00",
    saleCount: 0,
    totalExpenses: "0.00",
    expenseCount: 0,
    supplyTotal: "0.00",
    supplyCount: 0,
    netCashFlow: netIncome,
    ...extra,
  }) as CashboxSummary;

describe("сводка на прежних ручках", () => {
  it("касса: база сравнения — только когда пришла, неизвестных метрик нет", () => {
    const m = legacyMoney(cash("100.00"), cash("80.00"));
    expect(m.netIncome).toBe("100.00");
    expect(m.baseline?.netIncome).toBe("80.00");
    // Ложный ноль хуже пропуска: этих метрик прежние ручки не знают.
    expect(m.unpaidPastCount).toBeUndefined();
    expect(m.debtOutstanding).toBeUndefined();
    expect(legacyMoney(cash("1.00")).baseline).toBeNull();
  });

  it("месяц: ряд по календарю, даже если отчёт отдал дни задом наперёд", () => {
    const monthRange = resolvePeriod("month", dayjs("2026-09-03"));
    const report = {
      daily: [
        { date: "2026-09-03", cashSum: "10.00", cardSum: "5.00" },
        { date: "2026-09-01", cashSum: "1.00", cardSum: "0.00" },
      ],
    } as unknown as MonthlyReport;
    const m = legacyMonth(monthRange, cash("16.00"), cash("500.00"), undefined, report);
    expect(m.daily.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(m.daily.map((d) => d.netIncome)).toEqual(["1.00", "0.00", "15.00"]);
    expect(m.daysElapsed).toBe(3);
    expect(m.daysInMonth).toBe(30);
    // Без диапазона прошлого месяца отметку не ставим.
    expect(m.previousMonth).toBeNull();
  });

  it("записи: «обычно в этот день недели» — среднее за 4 прошлые недели", () => {
    const chart = { dateFrom: "2026-09-23", dateTo: "2026-09-24", month: "2026-09", label: "" };
    const history = { "2026-09-17": 4, "2026-09-10": 8, "2026-09-03": 0, "2026-08-27": 0 };
    const a = legacyAppointments({ "2026-09-24": 3 }, { "2026-09-17": 4 }, chart, { "2026-09-24": 3 }, history);
    expect(a.total).toBe(3);
    expect(a.baseline?.total).toBe(4);
    expect(a.daily).toEqual([
      { date: "2026-09-23", count: 0 },
      { date: "2026-09-24", count: 3 },
    ]);
    expect(a.weekdayBaseline?.[1]).toEqual({ date: "2026-09-24", average: "3.00" });
    expect(a.visits).toBeUndefined();
  });
});

describe("«Требует внимания» на агрегате", () => {
  it("неоплаченные прошедшие визиты — «сегодня», с суммой", () => {
    const input = attentionInputFromSections(
      {
        money: {
          ...legacyMoney(cash("100.00")),
          unpaidPastCount: 3,
          unpaidPastAmount: "4500.00",
        },
      },
      "с начала месяца",
    );
    const item = buildAttentionItems(input).find((i) => i.id === "unpaid-visits");
    expect(item?.severity).toBe("today");
    expect(item?.text).toBe("не получено за 3 прошедших визита с начала месяца");
  });

  it("на прежних ручках сигнала о неоплате нет, а не «0»", () => {
    const input = attentionInputFromSections({ money: legacyMoney(cash("100.00")) }, "сегодня");
    expect(input.unpaid).toBeUndefined();
  });
});

describe("выгрузка в xlsx", () => {
  const range = resolvePeriod("month", dayjs("2026-09-24"));
  const data = (sections: DashboardData["sections"]): DashboardData => ({
    source: "aggregate",
    range,
    periodKey: "month",
    prev: { ...range, label: "тот же отрезок прошлого месяца" },
    chartRange: range,
    sections,
    branchTotal: 1,
    isLoading: () => false,
    error: () => undefined,
  });

  it("раздел без права в файл не попадает", () => {
    const rows = collectRows({ data: data({}), organizationName: "Клиника" });
    expect(rows.map((r) => r[0])).not.toContain("Выручка");
    expect(rows[1][0]).toBe("Всё под контролем");
  });

  it("выручка, неоплата и долг — из кассы", () => {
    const rows = collectRows({
      data: data({
        money: {
          ...legacyMoney(cash("1000.00"), cash("800.00")),
          unpaidPastCount: 2,
          unpaidPastAmount: "300.00",
          debtOutstanding: "900.00",
        },
      }),
      organizationName: "Клиника",
    });
    const find = (label: string) => rows.find((r) => r[0] === label);
    expect(find("Выручка с начала месяца")?.[1]).toBe(1000);
    expect(find("Не получено за прошедшие визиты")?.[1]).toBe(300);
    expect(find("Долг пациентов на сейчас")?.[1]).toBe(900);
  });
});
