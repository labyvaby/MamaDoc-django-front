import { describe, expect, it } from "vitest";
import { describeDelta } from "./delta";
import { previousRange, resolvePeriod, sumDayCounts, toDailySeries } from "./period";
import dayjs from "dayjs";
import {
  WIDGETS,
  availableWidgets,
  moveWidget,
  normalizeLayout,
  reorderWidget,
  resolveSpan,
  setSpan,
  toggleHidden,
  visibleWidgets,
} from "./layout";

describe("describeDelta", () => {
  it("растёт — зелёный плюс", () => {
    const v = describeDelta({ current: 120, previous: 100 })!;
    expect(v.text).toBe("+20%");
    expect(v.tone).toBe("success");
    expect(v.direction).toBe("up");
  });

  it("падает — красный минус", () => {
    const v = describeDelta({ current: 80, previous: 100 })!;
    expect(v.text).toBe("−20%");
    expect(v.tone).toBe("error");
    expect(v.direction).toBe("down");
  });

  it("для метрик с invert рост читается как ухудшение", () => {
    expect(describeDelta({ current: 5, previous: 2, invert: true })!.tone).toBe("error");
    expect(describeDelta({ current: 2, previous: 5, invert: true })!.tone).toBe("success");
  });

  it("рост с нуля не превращается в проценты", () => {
    const v = describeDelta({ current: 42, previous: 0 })!;
    expect(v.text).toBe("было 0");
    expect(v.tone).toBe("success");
  });

  it("равенство — нейтральный чип, в том числе 0 против 0", () => {
    expect(describeDelta({ current: 0, previous: 0 })!.tone).toBe("muted");
    expect(describeDelta({ current: 7, previous: 7 })!.text).toBe("без изменений");
  });

  it("база сравнения попадает в подсказку", () => {
    const v = describeDelta({ current: 1, previous: 2, baselineLabel: "вчера" })!;
    expect(v.title).toContain("вчера");
  });
});

describe("previousRange", () => {
  const now = dayjs("2026-08-25");

  it("для «сегодня» база — тот же день недели, а не вчера", () => {
    const prev = previousRange(resolvePeriod("today", now), "today");
    // 25.08.2026 — вторник, значит база 18.08, тоже вторник.
    expect(prev.dateFrom).toBe("2026-08-18");
    expect(prev.dateTo).toBe("2026-08-18");
    expect(dayjs(prev.dateFrom).day()).toBe(now.day());
  });

  it("для недели база — предыдущие 7 дней, без нахлёста", () => {
    const range = resolvePeriod("week", now);
    const prev = previousRange(range, "week");
    expect(range.dateFrom).toBe("2026-08-19");
    expect(prev.dateTo).toBe("2026-08-18");
    expect(prev.dateFrom).toBe("2026-08-12");
  });

  it("для месяца база — тот же отрезок прошлого месяца, а не месяц целиком", () => {
    const prev = previousRange(resolvePeriod("month", now), "month");
    expect(prev.dateFrom).toBe("2026-07-01");
    expect(prev.dateTo).toBe("2026-07-25");
  });

  it("короткий прошлый месяц прижимается к последнему дню", () => {
    const prev = previousRange(resolvePeriod("month", dayjs("2026-03-31")), "month");
    expect(prev.dateFrom).toBe("2026-02-01");
    expect(prev.dateTo).toBe("2026-02-28");
  });
});

describe("ряд по дням", () => {
  it("считает сумму и достраивает пустые дни", () => {
    const range = resolvePeriod("week", dayjs("2026-08-25"));
    const counts = { "2026-08-25": 3, "2026-08-20": 2 };
    expect(sumDayCounts(counts)).toBe(5);

    const series = toDailySeries(counts, range);
    expect(series).toHaveLength(7);
    expect(series[0]).toEqual({ date: "2026-08-19", count: 0 });
    expect(series.at(-1)).toEqual({ date: "2026-08-25", count: 3 });
  });
});

describe("раскладка блоков", () => {
  const ctx = { can: () => true, period: "month" as const, branchCount: 3 };

  it("новый блок из кода доезжает до сохранённой раскладки", () => {
    const saved = normalizeLayout({ order: ["tasks", "money"], hidden: [] });
    expect(saved.order[0]).toBe("tasks");
    expect(saved.order).toContain("reviews");
    expect(saved.order).toHaveLength(WIDGETS.length);
  });

  it("исчезнувший из кода блок отбрасывается", () => {
    const saved = normalizeLayout({
      order: ["money", "ghost" as never],
      hidden: ["ghost" as never],
    });
    expect(saved.order).not.toContain("ghost");
    expect(saved.hidden).not.toContain("ghost");
  });

  it("спрятанные блоки не попадают в отрисовку, порядок сохраняется", () => {
    const layout = normalizeLayout({ order: ["reviews", "money"], hidden: ["money"] });
    const ids = visibleWidgets(layout, ctx).map((w) => w.id);
    expect(ids[0]).toBe("reviews");
    expect(ids).not.toContain("money");
  });

  it("блок сравнения филиалов скрыт при единственном филиале", () => {
    const layout = normalizeLayout(null);
    expect(availableWidgets({ ...ctx, branchCount: 1 }).map((w) => w.id)).not.toContain("branches");
    expect(availableWidgets(ctx).map((w) => w.id)).toContain("branches");
    expect(visibleWidgets(layout, { ...ctx, branchCount: 1 }).map((w) => w.id)).not.toContain(
      "branches",
    );
  });

  it("месячный блок показывается только на периоде «Месяц»", () => {
    expect(availableWidgets({ ...ctx, period: "week" }).map((w) => w.id)).not.toContain("month");
    expect(availableWidgets(ctx).map((w) => w.id)).toContain("month");
  });

  it("без прав блок недоступен", () => {
    const noMoney = { ...ctx, can: (p: string | string[]) => !String(p).includes("finance") };
    expect(availableWidgets(noMoney).map((w) => w.id)).not.toContain("money");
  });

  it("перестановка не выходит за границы списка", () => {
    const order = ["money", "tasks", "reviews"] as const;
    expect(moveWidget([...order], "money", -1)).toEqual([...order]);
    expect(moveWidget([...order], "reviews", 1)).toEqual([...order]);
    expect(moveWidget([...order], "money", 1)).toEqual(["tasks", "money", "reviews"]);
  });

  it("переключатель видимости работает в обе стороны", () => {
    expect(toggleHidden([], "money")).toEqual(["money"]);
    expect(toggleHidden(["money"], "money")).toEqual([]);
  });
});

describe("ширина блоков", () => {
  it("без личной настройки берётся ширина из реестра", () => {
    const layout = normalizeLayout(null);
    const money = WIDGETS.find((w) => w.id === "money")!;
    expect(resolveSpan(money, layout)).toBe(money.span);
  });

  it("выбор ширины сохраняется и применяется", () => {
    const money = WIDGETS.find((w) => w.id === "money")!;
    const next = setSpan(normalizeLayout(null), "money", 12);
    expect(next.sizes.money).toBe(12);
    expect(resolveSpan(money, next)).toBe(12);
  });

  it("возврат к значению по умолчанию стирает ключ, а не дублирует его", () => {
    const withSize = setSpan(normalizeLayout(null), "money", 12);
    const back = setSpan(withSize, "money", 6);
    expect(back.sizes.money).toBeUndefined();
  });

  it("мусор из localStorage отбрасывается", () => {
    const layout = normalizeLayout({
      sizes: { money: 7 as never, ghost: 6 as never },
    } as never);
    expect(layout.sizes.money).toBeUndefined();
    expect(Object.keys(layout.sizes)).toHaveLength(0);
  });
});

describe("перенос перетаскиванием", () => {
  const order = ["money", "appointments", "tasks", "reviews"] as const;

  it("переносит через несколько позиций, а не меняет местами соседей", () => {
    expect(reorderWidget([...order], "reviews", 0)).toEqual([
      "reviews",
      "money",
      "appointments",
      "tasks",
    ]);
  });

  it("перенос на своё же место ничего не меняет", () => {
    expect(reorderWidget([...order], "money", 0)).toEqual([...order]);
  });

  it("индекс за границами прижимается к краю", () => {
    expect(reorderWidget([...order], "money", 99)).toEqual([
      "appointments",
      "tasks",
      "reviews",
      "money",
    ]);
  });
});
