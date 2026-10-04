import { describe, expect, it } from "vitest";

import { makeReport } from "./fixture";
import { buildKpis, buildRows, DEFAULT_EXPANDED } from "./model";

describe("buildKpis", () => {
  it("значения, маржа и изменение к прошлому году", () => {
    const [revenue, gross, operating, net] = buildKpis(makeReport());
    expect(revenue).toMatchObject({ code: "010", value: 2200, ratioPct: null });
    expect(revenue.deltaPct).toBeCloseTo(10);
    expect(gross.ratioPct).toBeCloseTo(90);
    expect(gross.deltaPct).toBeNull();
    expect(operating.value).toBe(510);
    expect(net.ratioLabel).toBe("рентабельность");
    expect(net.deltaPct).toBeCloseTo(100);
  });

  it("без сравнения дельт нет", () => {
    expect(buildKpis(makeReport({ compare: null })).every((k) => k.deltaPct === null)).toBe(true);
  });
});

describe("buildRows", () => {
  it("раскрытые группы показывают детали, пустые строки помечены", () => {
    const rows = buildRows(makeReport(), new Set(DEFAULT_EXPANDED));
    expect(rows.map((r) => r.id).slice(0, 6)).toEqual([
      "010", "revenue.services", "revenue.appointment_products", "020", "cost.category.1", "030",
    ]);
    const cost = rows.find((r) => r.id === "020")!;
    expect(cost).toMatchObject({ isExpense: true, expandable: true, expanded: true, total: 220, months: [100, 120] });
    expect(cost.sharePct).toBeCloseTo(10);
    expect(rows.find((r) => r.id === "071")).toMatchObject({ empty: true, expandable: false });
    expect(rows.find((r) => r.id === "070")).toMatchObject({ expandable: true, expanded: false });
    expect(rows.some((r) => r.id === "selling.category.3")).toBe(false);
  });

  it("итоговые строки не бывают пустыми", () => {
    const rows = buildRows(makeReport(), new Set());
    expect(rows.find((r) => r.id === "150")).toMatchObject({ kind: "total", empty: false });
  });
});
