import { describe, expect, it } from "vitest";
import {
  buildPlanThemeConfig,
  planProgress,
  planScopeKey,
  readRevenuePlans,
  resolvePlan,
  setPlan,
} from "./revenuePlan";

describe("план выручки: хранение", () => {
  it("мусор из themeConfig отбрасывается", () => {
    const plans = readRevenuePlans({
      dashboard: {
        plans: {
          org: { default: -5, months: { "2026-09": 100, bad: 5, "2026-10": "x" } },
          "branch:1": "oops",
          "branch:2": { default: 0 },
        },
      },
    });
    expect(plans).toEqual({ org: { months: { "2026-09": 100 } } });
  });

  it("план месяца важнее плана по умолчанию", () => {
    const plans = { org: { default: 1000, months: { "2026-12": 3000 } } };
    expect(resolvePlan(plans, "org", "2026-12")).toEqual({ amount: 3000, source: "month" });
    expect(resolvePlan(plans, "org", "2026-11")).toEqual({ amount: 1000, source: "default" });
    expect(resolvePlan(plans, planScopeKey(7), "2026-11")).toBeNull();
  });

  it("у филиала и организации планы раздельные", () => {
    expect(planScopeKey(undefined)).toBe("org");
    expect(planScopeKey(3)).toBe("branch:3");
  });

  it("снятие последнего плана вычищает скоуп целиком", () => {
    const withPlan = setPlan({}, "org", { month: "2026-09" }, 500);
    expect(withPlan).toEqual({ org: { months: { "2026-09": 500 } } });
    expect(setPlan(withPlan, "org", { month: "2026-09" }, null)).toEqual({});
  });

  it("патч не трогает палитру, лендинг и термины", () => {
    const themeConfig = {
      accentId: "ocean",
      landing: { slogan: "x" },
      glossary: { patient: {} },
      dashboard: { somethingElse: 1 },
    };
    const next = buildPlanThemeConfig(themeConfig, { org: { default: 10 } });
    expect(next.accentId).toBe("ocean");
    expect(next.landing).toEqual({ slogan: "x" });
    expect(next.glossary).toEqual({ patient: {} });
    expect(next.dashboard).toEqual({ somethingElse: 1, plans: { org: { default: 10 } } });
    // Пустые планы — ключ убирается, соседние настройки дашборда остаются.
    expect(buildPlanThemeConfig(next, {}).dashboard).toEqual({ somethingElse: 1 });
    expect(buildPlanThemeConfig({ accentId: "a" }, {})).toEqual({ accentId: "a" });
  });
});

describe("план выручки: прогресс", () => {
  it("нужно в день считается по дням после сегодняшнего", () => {
    // План 300, набрано 100 к 10-му из 30 → осталось 200 на 20 дней.
    const p = planProgress(300, 100, 10, 30, 300);
    expect(p.remaining).toBe(200);
    expect(p.perDayNeeded).toBe(10);
    expect(p.onTrack).toBe(true);
  });

  it("выполненный план — ноль в день, не отрицательное", () => {
    const p = planProgress(100, 150, 20, 30, 225);
    expect(p.remaining).toBe(0);
    expect(p.perDayNeeded).toBe(0);
    expect(p.done).toBeCloseTo(1.5);
  });

  it("в последний день месяца «в день» не считаем", () => {
    expect(planProgress(100, 50, 30, 30, null).perDayNeeded).toBeNull();
  });

  it("без темпа неизвестно, успеваем ли", () => {
    expect(planProgress(100, 10, 2, 30, null).onTrack).toBeNull();
    expect(planProgress(100, 10, 5, 30, 60).onTrack).toBe(false);
  });
});
