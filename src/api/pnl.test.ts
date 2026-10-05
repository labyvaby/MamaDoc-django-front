import { describe, expect, it } from "vitest";

import { buildPnlQuery } from "./pnl";

describe("buildPnlQuery", () => {
  it("кладёт обязательные даты и сравнение", () => {
    expect(buildPnlQuery({ dateFrom: "2026-01-01", dateTo: "2026-09-30", compare: true })).toBe(
      "dateFrom=2026-01-01&dateTo=2026-09-30&compare=1",
    );
  });

  it("добавляет филиал и организацию только когда они заданы", () => {
    expect(
      buildPnlQuery({ dateFrom: "2026-01-01", dateTo: "2026-01-31", branchId: 7, organizationId: 3 }),
    ).toBe("dateFrom=2026-01-01&dateTo=2026-01-31&branchId=7&organizationId=3");
  });
});
