import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./attention";
import { normalizeLayout, stretchRows, WIDGETS } from "./layout";

const base = { periodLabel: "сегодня" };

describe("Требует внимания", () => {
  it("без данных — пусто, а не список нулей", () => {
    expect(buildAttentionItems(base)).toEqual([]);
  });

  it("нулевые счётчики сигналов не дают", () => {
    const items = buildAttentionItems({
      ...base,
      bookings: { pending: 0, overdue: 0 },
      tasks: { overdue: 0, awaitingApproval: 0 },
      deals: { overdueActions: 0, todayActions: 0 },
      reviews: { negative: 0 },
      cash: { netCashFlow: 1000, grossIncome: 1000, refundedTotal: 0, refundCount: 0 },
      month: { waitingCount: 0, debtSum: 0 },
      staff: { total: 5, free: 0 },
    });
    expect(items).toEqual([]);
  });

  it("срочное всегда выше, чем «сегодня» и возможности", () => {
    const items = buildAttentionItems({
      ...base,
      deals: { overdueActions: 0, todayActions: 3 },
      reviews: { negative: 1 },
      tasks: { overdue: 2, awaitingApproval: 0 },
    });
    expect(items.map((i) => i.severity)).toEqual(["urgent", "today", "opportunity"]);
    expect(items[0].id).toBe("tasks-overdue");
  });

  it("просроченные брони не считаются дважды в «ждут подтверждения»", () => {
    const items = buildAttentionItems({ ...base, bookings: { pending: 5, overdue: 2 } });
    expect(items.find((i) => i.id === "bookings-overdue")?.value).toBe("2");
    expect(items.find((i) => i.id === "bookings-pending")?.value).toBe("3");
  });

  it("минус в кассе — срочно", () => {
    const [item] = buildAttentionItems({
      ...base,
      cash: { netCashFlow: -500, grossIncome: 1000, refundedTotal: 0, refundCount: 0 },
    });
    expect(item.id).toBe("cash-negative");
    expect(item.severity).toBe("urgent");
  });

  it("мелкие возвраты в список не попадают, крупные — «сегодня»", () => {
    const small = buildAttentionItems({
      ...base,
      cash: { netCashFlow: 1, grossIncome: 10000, refundedTotal: 100, refundCount: 1 },
    });
    const big = buildAttentionItems({
      ...base,
      cash: { netCashFlow: 1, grossIncome: 10000, refundedTotal: 1500, refundCount: 3 },
    });
    expect(small).toEqual([]);
    expect(big[0].severity).toBe("today");
  });

  it("свободные окна подсказываются только при низкой загрузке", () => {
    expect(buildAttentionItems({ ...base, staff: { total: 10, free: 7 } })[0]?.id).toBe(
      "staff-free",
    );
    expect(buildAttentionItems({ ...base, staff: { total: 10, free: 2 } })).toEqual([]);
  });

  it("числа склоняются", () => {
    const one = buildAttentionItems({ ...base, tasks: { overdue: 1, awaitingApproval: 0 } });
    const five = buildAttentionItems({ ...base, tasks: { overdue: 5, awaitingApproval: 0 } });
    expect(one[0].text).toBe("задача просрочена");
    expect(five[0].text).toBe("задач просрочено");
  });
});

describe("новые блоки в сохранённой раскладке", () => {
  it("«Пульс» и «Требует внимания» встают перед «Деньгами», а не в конец", () => {
    const layout = normalizeLayout({ order: ["ops", "money", "staff"], hidden: [] });
    const i = (id: string) => layout.order.indexOf(id as never);
    expect(i("pulse")).toBeLessThan(i("money"));
    expect(i("attention")).toBe(i("pulse") + 1);
    expect(layout.order[0]).toBe("ops");
    expect(layout.order).toHaveLength(WIDGETS.length);
  });

  it("без сохранённой раскладки дубли «Пульса» спрятаны", () => {
    const layout = normalizeLayout(null);
    expect(layout.order[0]).toBe("pulse");
    expect(layout.hidden).toEqual(expect.arrayContaining(["availability", "bookings"]));
  });

  it("выбор пользователя «ничего не прятать» не перетирается умолчанием", () => {
    const layout = normalizeLayout({ order: ["money"], hidden: [] });
    expect(layout.hidden).toEqual([]);
  });
});

describe("ряды сетки растягиваются", () => {
  it("полные ряды не трогаем", () => {
    expect(stretchRows([8, 4, 6, 6, 7, 5, 12])).toEqual([8, 4, 6, 6, 7, 5, 12]);
  });

  it("одинокий блок в ряду — во всю ширину", () => {
    // Пульс без «Внимания» (нет прав) и «Операции» без «Сотрудников».
    expect(stretchRows([8, 6, 6, 7])).toEqual([12, 6, 6, 12]);
  });

  it("неполный ряд делится пропорционально", () => {
    expect(stretchRows([4, 4])).toEqual([6, 6]);
    expect(stretchRows([6, 4, 12])).toEqual([7, 5, 12]);
  });
});

describe("старая раскладка с задачами, воронкой и отзывами", () => {
  it("исчезнувшие блоки заменяются одной карточкой «Операции»", () => {
    const layout = normalizeLayout({
      order: ["money", "tasks", "deals", "reviews"] as never,
      hidden: [],
    });
    expect(layout.order).toContain("ops");
    expect(layout.order).not.toContain("tasks" as never);
  });
});
