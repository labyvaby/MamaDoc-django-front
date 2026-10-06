import { describe, expect, it } from "vitest";

import {
  calendarAction,
  collectionCounters,
  debtBody,
  forecastWeeks,
  fromRawAccount,
  fromRawBudget,
  fromRawCashSummary,
  fromRawDebt,
  fromRawForecast,
  fromRawMeta,
  matchesDebtSearch,
  monthGrid,
  operationBody,
  payoutStructure,
  plannedPaymentBody,
  shiftMonth,
  transferBody,
  treasuryQuery,
  type ForecastDay,
} from "./treasury";

describe("разбор ответов treasury", () => {
  it("сводка кассы: строки денег → числа", () => {
    const s = fromRawCashSummary({ period: 30, liquidBalance: "43275000.00", escrowBalance: "897800000.00", inflow: "66347200.00", inflowCount: 57, net: "-50552879.00", opsCount: 96 });
    expect(s.liquidBalance).toBe(43_275_000);
    expect(s.net).toBe(-50_552_879);
    expect(s.inflowCount).toBe(57);
    expect(s.outflow).toBe(0);
  });

  it("валютный счёт: fx — в валюте, balance — в сомах, series — числа", () => {
    const a = fromRawAccount({ id: 3, name: "USD", type: "fx", currency: "USD", rate: 87.5, fx: "42000.00", balance: "3675000.00", series: ["41000.00", "42000.00"], escrowRatePct: null });
    expect(a.fx).toBe(42_000);
    expect(a.balance).toBe(3_675_000);
    expect(a.series).toEqual([41_000, 42_000]);
    expect(a.escrowRatePct).toBeNull();
  });

  it("справочники meta — и строками, и объектами", () => {
    const meta = fromRawMeta({ accountTypes: ["bank", { id: "cash", name: "Касса" }], articles: [{ id: "smr", name: "СМР", group: "expense" }], agingBuckets: [{ bucket: "b30", label: "1–30 дн." }] });
    expect(meta.accountTypes).toEqual([
      { id: "bank", name: "bank" },
      { id: "cash", name: "Касса" },
    ]);
    expect(meta.articles[0]).toEqual({ id: "smr", name: "СМР", group: "expense" });
    expect(meta.agingBuckets[0]).toEqual({ id: "b30", name: "1–30 дн." });
    expect(meta.sources).toEqual([]);
  });

  it("прогноз: дни и строки, баланс прошлого дня — null", () => {
    const f = fromRawForecast({
      startBalance: "43275000.00",
      minBalance: "-10862330.00",
      hasGap: true,
      gapDate: "2026-10-15",
      gapBalance: "-1158200.00",
      next30: { inflow: "30751700.00", inflowCount: 14 },
      days: [{ date: "2026-10-15", balance: "-1158200.00", in: "232500.00", out: "7657000.00", items: [{ key: "PP-4", kind: "planned", id: 4, type: "out", amount: "3914000.00", runningBalance: null }] }, { date: "2026-10-01", balance: null }],
    });
    expect(f.minBalance).toBe(-10_862_330);
    expect(f.next30.inflow).toBe(30_751_700);
    expect(f.days[0].items[0]).toMatchObject({ key: "PP-4", id: 4, amount: 3_914_000, runningBalance: null });
    expect(f.days[1].balance).toBeNull();
    expect(f.days[1].items).toEqual([]);
  });

  it("бюджет: elapsedPct null, экономика, история", () => {
    const b = fromRawBudget({
      projectId: 1,
      plan: "1470000000.00",
      elapsedPct: null,
      lines: [{ id: 10, article: "design", plan: "42000000.00", remaining: "-1.00", over: true, risk: "overrun" }],
      economics: { marginPct: 32.9, costPerSqm: "317179.48", areaSource: "units" },
      history: [{ id: 1, changes: [{ article: "smr", field: "plan", before: "0.00", after: "610000000" }] }],
    });
    expect(b.plan).toBe(1_470_000_000);
    expect(b.elapsedPct).toBeNull();
    expect(b.lines[0]).toMatchObject({ remaining: -1, over: true, risk: "overrun", articleName: "design" });
    expect(b.economics.costPerSqm).toBe(317_179.48);
    expect(b.history[0].changes[0]).toEqual({ article: "smr", field: "plan", before: 0, after: 610_000_000 });
  });

  it("списки: и массив, и DRF-страница", () => {
    expect(fromRawForecast({ days: { results: [{ date: "2026-10-06" }] } }).days).toHaveLength(1);
    expect(fromRawForecast({ days: { count: 0 } }).days).toEqual([]);
  });

  it("строка долга", () => {
    const d = fromRawDebt({ source: "debt", id: 16, key: "AP-016", amount: "1120000.00", days: 96, disputed: true });
    expect(d).toMatchObject({ source: "debt", id: 16, amount: 1_120_000, days: 96, disputed: true, retention: false, billingAccountId: null });
  });
});

describe("тела запросов", () => {
  it("операция без необязательных полей", () => {
    expect(operationBody({ type: "out", accountId: 1, amount: "500", article: "smr", counterparty: " ОсОО ", projectId: null, doc: " ", note: "", date: null })).toEqual({
      type: "out",
      accountId: 1,
      amount: "500",
      article: "smr",
      counterparty: "ОсОО",
    });
  });

  it("перевод: toAmount только для валюты", () => {
    expect(transferBody({ from: 1, to: 2, amount: "500000", toAmount: null, note: "", date: null })).toEqual({ from: 1, to: 2, amount: "500000" });
    expect(transferBody({ from: 1, to: 3, amount: "87500", toAmount: "1000", note: "ок", date: "2026-10-06" })).toEqual({ from: 1, to: 3, amount: "87500", toAmount: "1000", note: "ок", date: "2026-10-06" });
  });

  it("плановый платёж всегда source=manual", () => {
    expect(plannedPaymentBody({ type: "out", date: "2026-10-20", title: " Аренда ", counterparty: "X", amount: "100", category: "rent", projectId: 2, doc: "" })).toEqual({
      type: "out",
      date: "2026-10-20",
      title: "Аренда",
      counterparty: "X",
      amount: "100",
      category: "rent",
      source: "manual",
      projectId: 2,
    });
  });

  it("долг: planPayment только у кредиторки", () => {
    const base = { counterparty: "A", type: "invoice", amount: "1", due: "2026-10-30", issued: null, doc: "", projectId: null, retention: false, disputed: false, planPayment: true };
    expect(debtBody({ ...base, direction: "payable" }).planPayment).toBe(true);
    expect(debtBody({ ...base, direction: "receivable" })).not.toHaveProperty("planPayment");
  });

  it("query без пустых значений", () => {
    expect(treasuryQuery({ period: 30, accountId: null, type: undefined, q: "" })).toBe("?period=30");
    expect(treasuryQuery({})).toBe("");
  });
});

const day = (date: string, balance: number | null, inflow: number, out: number, items: ForecastDay["items"] = []): ForecastDay => ({ date, balance, in: inflow, out, gap: false, items });

describe("хелперы экранов", () => {
  it("кнопка строки календаря", () => {
    expect(calendarAction({ kind: "planned", type: "out", done: false })).toBe("pay");
    expect(calendarAction({ kind: "planned", type: "in", done: false })).toBe("receive");
    expect(calendarAction({ kind: "planned", type: "out", done: true })).toBeNull();
    expect(calendarAction({ kind: "billing", type: "in", done: false })).toBe("billing");
    expect(calendarAction({ kind: "operation", type: "out", done: true })).toBeNull();
  });

  it("недели прогноза по 7 дней", () => {
    const days = Array.from({ length: 9 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, 100 - i * 10, 1, 2));
    const weeks = forecastWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({ start: "2026-10-01", end: "2026-10-07", in: 7, out: 14, balance: 40, min: 40 });
    expect(weeks[1]).toMatchObject({ start: "2026-10-08", end: "2026-10-09", balance: 20 });
  });

  it("структура выплат по sourceLabel", () => {
    const item = (sourceLabel: string, type: string, amount: number) => ({ ...fromRawForecast({ days: [{ items: [{ sourceLabel, type, amount }] }] }).days[0].items[0] });
    const days = [day("2026-10-01", 0, 0, 0, [item("Акт подрядчика", "out", 5), item("Налоги", "out", 2)]), day("2026-10-02", 0, 0, 0, [item("Акт подрядчика", "out", 1), item("Рассрочка", "in", 9)])];
    expect(payoutStructure(days)).toEqual([
      { label: "Акт подрядчика", amount: 6 },
      { label: "Налоги", amount: 2 },
    ]);
  });

  it("счётчики взыскания", () => {
    expect(collectionCounters([{ days: -4 }, { days: -3 }, { days: 0 }, { days: 1 }, { days: 14 }, { days: 20 }, { days: 31 }])).toEqual({ soon: 2, early: 2, late: 1 });
  });

  it("сетка месяца с понедельника", () => {
    const grid = monthGrid("2026-10"); // 1 октября 2026 — четверг
    expect(grid[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("поиск долга: текст без регистра, телефон по цифрам", () => {
    const debt = { counterparty: "ОсОО «Профиль Окна»", doc: "СЧ-2026-0361", number: "AP-016", projectName: "Ордо Park", typeLabel: "Счёт", phone: "+996777605914" };
    expect(matchesDebtSearch(debt, "профиль")).toBe(true);
    expect(matchesDebtSearch(debt, "ордо")).toBe(true);
    expect(matchesDebtSearch(debt, "605 914")).toBe(true);
    expect(matchesDebtSearch(debt, "12")).toBe(false);
    expect(matchesDebtSearch(debt, "  ")).toBe(true);
  });

  it("сдвиг месяца через год", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
