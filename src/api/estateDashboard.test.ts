import { describe, expect, it } from "vitest";

import { fromRawDashboard } from "./estateDashboard";
import { estateHref } from "../pages/estate-dashboard/format";

describe("fromRawDashboard", () => {
  it("деньги из строк-decimal — числа, панели без права и вне раскладки — null", () => {
    const result = fromRawDashboard({
      date: "2026-10-05",
      role: "ceo",
      user: { name: "Азамат Бакиров", firstName: "Азамат", position: "Генеральный директор" },
      layout: [["health"], ["approvals", "cash"]],
      denied: ["treasury"],
      kpis: {
        deals: { value: 22, newThisWeek: 22 },
        cash: { liquid: "43275000.00", escrow: "897800000.00", accountsCount: 6, revenueMonth: "16494100.00" },
      },
      panels: {
        approvals: { total: 6, mineCount: 1, mode: "mine", items: [{ id: 70, amount: "486000.00", title: "Приказ" }] },
        cash: null,
        billing: { overdueCount: 1, overdueSum: "337100.00", items: [{ id: 8, overdue: "337100.00" }] },
      },
    });
    expect(result.kpis.cash).toEqual({ liquid: 43275000, escrow: 897800000, accountsCount: 6, revenueMonth: 16494100 });
    expect(result.kpis.freeUnits).toBeNull();
    expect(result.panels.approvals?.items[0].amount).toBe(486000);
    expect(result.panels.billing?.overdueSum).toBe(337100);
    expect(result.panels.billing?.items[0].overdue).toBe(337100);
    expect(result.panels.cash).toBeNull();
    expect(result.panels.health).toBeNull();
    expect(result.layout).toEqual([["health"], ["approvals", "cash"]]);
  });
});

describe("estateHref", () => {
  it("ведёт только на сделанные экраны, с id объекта где он есть", () => {
    expect(estateHref("edo", 70)).toBe("/edo?doc=70");
    expect(estateHref("billing", 8)).toBe("/finance/billing?account=8");
    expect(estateHref("billing", null)).toBe("/finance/billing");
    expect(estateHref("inventory")).toBe("/realestate/chessboard");
    // Экранов стройки и кадров ещё нет — без перехода.
    expect(estateHref("quality", 14)).toBeNull();
    expect(estateHref("staff")).toBeNull();
  });
});
