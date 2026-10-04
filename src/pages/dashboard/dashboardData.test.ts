import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import {
  isDashboardSummaryV2,
  type DashboardMoney,
  type DashboardMoneyScalars,
  type DashboardSummary,
} from "../../api/dashboard";
import { attentionInputFromSections, buildAttentionItems } from "./attention";
import { collectRows } from "./exportDashboardXlsx";
import type { DashboardData } from "./DashboardData";
import { resolvePeriod } from "./period";
import { othersOf } from "./widgetUtils";

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

const scalars = (netIncome: string, extra: Partial<DashboardMoneyScalars> = {}): DashboardMoneyScalars => ({
  grossIncome: netIncome,
  netIncome,
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
  debtTotal: "0.00",
  debtAppointments: 0,
  unpaidPastCount: 0,
  unpaidPastAmount: "0.00",
  ...extra,
});

const money = (
  netIncome: string,
  extra: Partial<DashboardMoney> = {},
  baseline: DashboardMoneyScalars | null = null,
): DashboardMoney => ({
  ...scalars(netIncome),
  byCashlessMethod: [],
  debtOutstanding: "0.00",
  baseline,
  ...extra,
});

describe("версия агрегата", () => {
  it("v2 узнаётся по visits у записей", () => {
    const v2 = summary({
      appointments: {
        total: 5,
        visits: 4,
        paid: 3,
        canceled: 1,
        noShow: 0,
        canceledBy: { patient: 0, clinic: 1, unknown: 0 },
        repeatVisits: 1,
        repeatShare: "25.00",
        debtAppointments: 0,
        daily: [],
        weekdayBaseline: [],
        topServices: [],
        topServicesTotal: "0.00",
        baseline: null,
      },
    });
    expect(isDashboardSummaryV2(v2)).toBe(true);
  });

  it("первая версия (прод 24.09.2026) — без visits: сводка её не показывает", () => {
    // Ровно те ключи, что отдавал прод: total, paid, canceled, repeatVisits…
    const v1 = summary({
      appointments: { total: 5, paid: 3, canceled: 1, repeatVisits: 1, baseline: null },
    } as unknown as DashboardSummary["sections"]);
    expect(isDashboardSummaryV2(v1)).toBe(false);
    expect(isDashboardSummaryV2(undefined)).toBe(false);
  });
});

describe("«Требует внимания» на агрегате", () => {
  it("неоплаченные прошедшие визиты — «сегодня», с суммой", () => {
    const input = attentionInputFromSections(
      { money: money("100.00", { unpaidPastCount: 3, unpaidPastAmount: "4500.00" }) },
      "с начала месяца",
    );
    const item = buildAttentionItems(input).find((i) => i.id === "unpaid-visits");
    expect(item?.severity).toBe("today");
    expect(item?.text).toBe("не получено за 3 прошедших визита с начала месяца");
  });

  it("без неоплаты сигнала нет", () => {
    const input = attentionInputFromSections({ money: money("100.00") }, "сегодня");
    expect(buildAttentionItems(input).find((i) => i.id === "unpaid-visits")).toBeUndefined();
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
        money: money(
          "1000.00",
          { unpaidPastCount: 2, unpaidPastAmount: "300.00", debtOutstanding: "900.00" },
          scalars("800.00"),
        ),
      }),
      organizationName: "Клиника",
    });
    const find = (label: string) => rows.find((r) => r[0] === label);
    expect(find("Выручка с начала месяца")?.[1]).toBe(1000);
    expect(find("Выручка с начала месяца")?.[2]).toBe("тот же отрезок прошлого месяца: 800");
    expect(find("Не получено за прошедшие визиты")?.[1]).toBe(300);
    expect(find("Долг пациентов на сейчас")?.[1]).toBe(900);
  });
});

describe("«прочие» под топом", () => {
  it("остаток от знаменателя бэка и его доля", () => {
    // Тест, орг 4, август: вся выручка 442 700, в топе показан Гардасил 100 000.
    const o = othersOf("442700.00", [{ amount: "100000.00" }]);
    expect(o?.amount).toBe(342700);
    expect(o?.share).toBeCloseTo(77.41, 2);
  });

  it("без знаменателя (топ сотрудников без finance.view) и без остатка — строки нет", () => {
    expect(othersOf(undefined, [{ amount: "1.00" }])).toBeNull();
    expect(othersOf("100.00", [{ amount: "100.00" }])).toBeNull();
  });
});
