import { describe, expect, it } from "vitest";

import {
  actActions,
  constructionQuery,
  defectActions,
  defectMap,
  defectBody,
  defectsQuery,
  fromRawAct,
  fromRawContractor,
  fromRawDefectsSummary,
  fromRawStage,
  fromRawStageDetail,
  fromRawSummary,
  ganttBar,
  ganttMonths,
  ganttRange,
  stageBody,
  upcomingMilestones,
  worstSeverity,
} from "./construction";

describe("разбор ответов стройки", () => {
  it("сводка графика", () => {
    const s = fromRawSummary({ projectId: 1, readinessPct: 41, timeElapsedPct: 56, delayedStageIds: [6, 7], statuses: ["done", "late"], daysToHandover: 451, foreman: "Талант Мамбетов" });
    expect(s).toMatchObject({ readinessPct: 41, delayedStageIds: [6, 7], statuses: ["done", "late"], daysToHandover: 451, maxDelayDays: 0, updated: null });
  });

  it("этап: подрядчик null — собственные силы", () => {
    const st = fromRawStage({ id: 6, name: "Монолит", contractorName: null, progress: 78, volume: 3520.0, done: 2746.0, forecastEnd: "2026-10-05" });
    expect(st).toMatchObject({ contractorName: null, progress: 78, volume: 3520, done: 2746, forecastEnd: "2026-10-05", factEnd: null });
  });

  it("карточка этапа: акты и дефекты, деньги — числа", () => {
    const d = fromRawStageDetail({
      id: 6,
      history: [{ at: "2026-10-04", by: "Система", text: "Этап добавлен" }],
      acts: [{ id: 2, number: "АВР-2026-102", amount: "8120000.00", status: "paid" }],
      openDefects: [{ id: 14, number: "DEF-014", floor: 10, severity: "critical" }],
    });
    expect(d.history).toHaveLength(1);
    expect(d.acts[0].amount).toBe(8_120_000);
    expect(d.openDefects[0]).toMatchObject({ number: "DEF-014", floor: 10, section: "" });
  });

  it("подрядчик со статистикой", () => {
    const c = fromRawContractor({ id: 2, name: "Ак-Тилек", rating: 4.3, stats: { totalAmount: "87240000.00", debt: "0.00", paidPct: 52 } });
    expect(c.stats).toMatchObject({ totalAmount: 87_240_000, debt: 0, paidPct: 52, openDefects: 0 });
    expect(c.isBlocked).toBe(false);
  });

  it("акт: суммы и удержание", () => {
    const a = fromRawAct({ id: 9, amount: "6240000.00", retention: "312000.00", toPay: "5928000.00", checkedBy: null, status: "check" });
    expect(a).toMatchObject({ amount: 6_240_000, retention: 312_000, toPay: 5_928_000, checkedBy: "" });
  });

  it("сводка дефектов — ключи closed30DCount / inspections30DCount", () => {
    const s = fromRawDefectsSummary({ openCount: 13, closed30DCount: 3, inspections30DCount: 10, byCategory: [{ id: null, name: "Кладка", count: 2 }] });
    expect(s).toMatchObject({ openCount: 13, closed30DCount: 3, inspections30DCount: 10 });
    expect(s.byCategory[0]).toEqual({ id: null, name: "Кладка", count: 2 });
  });
});

describe("запросы и тела", () => {
  it("query без пустых", () => {
    expect(constructionQuery({ projectId: 1, delayed: null, q: "" })).toBe("?projectId=1");
  });

  it("фильтры дефектов → параметры гайда", () => {
    expect(defectsQuery({ filter: "open" })).toBe("?open=true");
    expect(defectsQuery({ filter: "closed", projectId: 2 })).toBe("?open=false&projectId=2");
    expect(defectsQuery({ filter: "verify", severity: "critical" })).toBe("?status=verify&severity=critical");
    expect(defectsQuery({ filter: "all" })).toBe("");
  });

  it("тело этапа и дефекта без пустых необязательных полей", () => {
    expect(stageBody({ projectId: 1, name: " Кровля ", group: "envelope", contractorId: null, start: "2026-11-01", end: "2026-12-01", volume: null, unit: "" })).toEqual({
      projectId: 1,
      name: "Кровля",
      group: "envelope",
      start: "2026-11-01",
      end: "2026-12-01",
    });
    expect(
      defectBody({ projectId: 1, title: "Трещина", category: "Кладка", severity: "major", deadline: "2026-10-20", contractorId: 2, stageId: null, inspectionId: 3, section: "", floor: 0, description: " " }),
    ).toEqual({ projectId: 1, title: "Трещина", category: "Кладка", severity: "major", deadline: "2026-10-20", contractorId: 2, inspectionId: 3, floor: 0 });
  });

  it("кнопки по статусу", () => {
    expect(actActions("check")).toEqual(["accept", "return"]);
    expect(actActions("rejected")).toEqual(["submit"]);
    expect(actActions("paid")).toEqual([]);
    expect(defectActions("verify")).toEqual(["close", "reopen"]);
    expect(defectActions("closed")).toEqual([]);
  });
});

describe("Гант", () => {
  const stages = [
    { start: "2026-01-15", end: "2026-03-10", forecastEnd: null },
    { start: "2026-02-01", end: "2026-04-20", forecastEnd: "2026-05-02" },
  ];

  it("окно — целые месяцы от раннего старта до позднего прогноза", () => {
    expect(ganttRange(stages)).toEqual({ from: "2026-01-01", to: "2026-05-31" });
    expect(ganttRange([])).toBeNull();
  });

  it("месяцы окна покрывают его целиком", () => {
    const months = ganttMonths({ from: "2026-01-01", to: "2026-05-31" });
    expect(months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]);
    expect(months[0].left).toBe(0);
    expect(months.reduce((s, m) => s + m.width, 0)).toBeCloseTo(1, 5);
  });

  it("отрезок этапа в долях окна", () => {
    const bar = ganttBar({ from: "2026-01-01", to: "2026-01-10" }, "2026-01-01", "2026-01-05");
    expect(bar.left).toBe(0);
    expect(bar.width).toBeCloseTo(0.5, 5);
  });

  it("ближайшие вехи — незавершённые по плановому окончанию", () => {
    const base = { projectId: 1, projectName: "", group: "", groupLabel: "", groupWeight: 0, contractorId: null, contractorName: null, responsibleId: null, responsible: "", start: "", factStart: null, factEnd: null, progress: 0, volume: 0, unit: "", done: 0, statusLabel: "", delayDays: 0, shiftDays: 0, forecastEnd: null, updatedAt: "" };
    const list = [
      { ...base, id: 1, order: 1, name: "A", end: "2026-03-01", status: "done" },
      { ...base, id: 2, order: 2, name: "B", end: "2026-05-01", status: "active" },
      { ...base, id: 3, order: 3, name: "C", end: "2026-04-01", status: "late" },
    ];
    expect(upcomingMilestones(list).map((s) => s.name)).toEqual(["C", "B"]);
  });
});

describe("карта дефектов", () => {
  const sections = [
    { name: "А", floors: 3, startFloor: 2 },
    { name: "Б", floors: 2, startFloor: 2 },
  ];

  it("этажи сверху вниз, секции по названию без регистра, лишнее — снаружи", () => {
    const map = defectMap(
      [
        { id: 1, severity: "major", section: "а", floor: 3 },
        { id: 2, severity: "critical", section: "А", floor: 3 },
        { id: 3, severity: "minor", section: "Б", floor: 9 },
        { id: 4, severity: "minor", section: "", floor: null },
      ],
      sections,
    );
    expect(map.floors).toEqual([4, 3, 2]);
    expect(map.sections).toEqual(["А", "Б"]);
    expect(map.cells.get("3|А")?.map((d) => d.id)).toEqual([1, 2]);
    expect(map.outside.map((d) => d.id)).toEqual([3, 4]);
  });

  it("худшая критичность ячейки", () => {
    expect(worstSeverity([{ severity: "minor" }, { severity: "critical" }, { severity: "major" }])).toBe("critical");
    expect(worstSeverity([])).toBeNull();
  });
});
