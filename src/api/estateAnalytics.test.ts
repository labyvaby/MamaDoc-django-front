import { describe, expect, it } from "vitest";

import { analyticsQuery, changePct, fromRawBi, fromRawCrmAnalytics, showRate } from "./estateAnalytics";

describe("fromRawCrmAnalytics", () => {
  it("разбирает ответ гайда §5 (demo.ceo, period=30)", () => {
    const a = fromRawCrmAnalytics({
      dateFrom: "2026-09-06",
      dateTo: "2026-10-05",
      leads: 22,
      shows: 1,
      bookings: 61,
      deals: 10,
      revenue: "82453000.00",
      conversion: 45,
      previous: { dateFrom: "2026-08-07", dateTo: "2026-09-05", leads: 0, shows: 0, bookings: 0, deals: 13, revenue: "112795000.00", conversion: 0, tasksDone: 0 },
      stages: [{ stage: "new", name: "Новая заявка", current: 5, value: "32850000.00", entered: 7, advanced: 2, lost: 0, delta: 5 }],
      tasks: { overdue: 8, done: 2, open: 28, leadsWithoutTask: 2 },
      activity: { calls: 8, shows: 1, bookings: 61, contracts: 10, proposals: 0 },
      managers: [{ managerId: 5, name: "Марина Садыкова", leads: 5, deals: 3, revenue: "32145000.00", calls: 1 }],
      projects: [{ projectId: 2, name: "Ордо Park", sold: 6, reserved: 40, revenue: "48505000.00" }],
      sources: [{ source: "Instagram", leads: 5, deals: 0, conversion: 0 }],
      dynamics: [{ label: "06.09", dateFrom: "2026-09-06", dateTo: "2026-09-12", leads: 0, contracts: 4 }],
      unitTrends: [{ date: "2026-10-05", week: "41", sold: 65, reserved: 61, free: 261 }],
    });
    expect(a.revenue).toBe(82_453_000);
    expect(a.tasksDone).toBe(2);
    expect(a.previous?.revenue).toBe(112_795_000);
    expect(a.stages[0].value).toBe(32_850_000);
    expect(a.managers[0].revenue).toBe(32_145_000);
    expect(a.dynamics).toHaveLength(1);
    expect(a.unitTrends[0].free).toBe(261);
  });

  it("план, расходы каналов и WhatsApp (test2, 08.10): null — нет плана / органика", () => {
    const a = fromRawCrmAnalytics({
      plan: { amount: "95174193.55", fact: "69026000.00", pct: 73, managers: 5, month: "2026-10", monthPlan: "96000000.00", monthFact: "15624000.00", monthDeals: 1, monthPct: 16 },
      managers: [
        { managerId: 5, name: "Марина Садыкова", leads: 5, deals: 2, revenue: "21340000.00", calls: 1, plan: "19827956.99", planPct: 108 },
        { managerId: 7, name: "Без плана", leads: 1, deals: 0, revenue: "0.00", calls: 0, plan: null, planPct: null },
      ],
      projects: [{ projectId: 2, name: "Ордо Park", sold: 4, reserved: 40, revenue: "30259000.00", plan: "17845161.29", planPct: 170 }],
      sources: [
        { source: "Instagram", leads: 5, deals: 1, conversion: 20, revenue: "5000000.00", spend: "120000.00", costPerLead: "24000.00", costPerDeal: "120000.00" },
        { source: "Рекомендация", leads: 4, deals: 0, conversion: 0, revenue: "0.00", spend: null, costPerLead: null, costPerDeal: null },
      ],
      activity: { calls: 8, shows: 19, bookings: 64, contracts: 8, proposals: 1, whatsapp: 2 },
    });
    expect(a.plan).toMatchObject({ pct: 73, monthPlan: 96_000_000, monthFact: 15_624_000, monthDeals: 1, monthPct: 16 });
    expect(a.managers.map((m) => m.planPct)).toEqual([108, null]);
    expect(a.managers[1].plan).toBeNull();
    expect(a.projects[0].plan).toBeCloseTo(17_845_161.29);
    expect(a.sources[0]).toMatchObject({ spend: 120_000, costPerDeal: 120_000, revenue: 5_000_000 });
    expect(a.sources[1].spend).toBeNull();
    expect(a.activity.whatsapp).toBe(2);
  });

  it("терпит пустой ответ", () => {
    const a = fromRawCrmAnalytics({});
    expect(a.plan).toBeNull();
    expect(a.previous).toBeNull();
    expect(a.stages).toEqual([]);
    expect(a.tasks.open).toBe(0);
  });
});

describe("fromRawBi", () => {
  it("секция без права — null, KPI без права — null", () => {
    const bi = fromRawBi({
      date: "2026-10-05",
      denied: ["construction"],
      kpis: { revenue30: "66347200.00", revenue30Count: 57, soldUnits: 65, avgReadiness: null },
      weeks: [{ start: "2026-09-29", end: "2026-10-05", inflow: "16494100.00" }],
      readiness: null,
      budgets: [{ projectId: 3, projectName: "Северный квартал", short: "Северный", color: "#8b5cf6", plan: "1250000000.00", fact: "344100000.00", pct: 28 }],
      forecast: { points: [{ date: "2026-10-05", balance: "43572500.00" }], hasGap: true, gapDate: "2026-10-15", gapBalance: "-1158200.00", todayBalance: "43572500.00", endBalance: "550370.00" },
      signals: [{ code: "cash-gap", title: "Кассовый разрыв (30 дн.)", value: "−1,2 млн · 15.10", tone: "red", view: "paycal" }],
    });
    expect(bi.kpis.revenue30).toBe(66_347_200);
    expect(bi.kpis.avgReadiness).toBeNull();
    expect(bi.kpis.marginPct).toBeNull();
    expect(bi.readiness).toBeNull();
    expect(bi.salesByProject).toBeNull();
    expect(bi.budgets?.[0].plan).toBe(1_250_000_000);
    expect(bi.forecast?.gapBalance).toBe(-1_158_200);
    expect(bi.signals[0].view).toBe("paycal");
    expect(bi.denied).toEqual(["construction"]);
  });
});

describe("helpers", () => {
  it("analyticsQuery: чип, даты, менеджер", () => {
    expect(analyticsQuery({ period: 30 }, null)).toBe("?period=30");
    expect(analyticsQuery({ period: -1 }, 3)).toBe("?period=-1&managerId=3");
    expect(analyticsQuery({ from: "2026-09-01", to: "2026-09-30" }, null)).toBe("?from=2026-09-01&to=2026-09-30");
  });

  it("changePct: прошлый ноль — без дельты", () => {
    expect(changePct(22, 0)).toBeNull();
    expect(changePct(10, 13)).toBe(-23);
    expect(changePct(12, 10)).toBe(20);
  });

  it("showRate: показы / заявки", () => {
    expect(showRate({ shows: 1, leads: 22 })).toBe(5);
    expect(showRate({ shows: 0, leads: 0 })).toBeNull();
  });
});
