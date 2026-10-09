import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import type { SalesMoney, SalesReport } from "../../../api/retailAnalytics";

const saved: { blob?: Blob; name?: string } = {};
vi.mock("../../../utility/download", () => ({
  downloadBlob: (blob: Blob, name: string) => {
    saved.blob = blob;
    saved.name = name;
  },
}));

const { exportSalesXlsx } = await import("./exportSalesXlsx");

const money = (revenue: string, quantity: string, other = "0"): SalesMoney => ({
  quantity,
  gross: revenue,
  discount: "0",
  revenue,
  cash: revenue,
  card: "0",
  other,
  receipts: 1,
  returnedQuantity: "0",
  returnedAmount: "0",
  returnedCash: "0",
  returnedCard: "0",
  returnedOther: "0",
  returns: 0,
  netQuantity: quantity,
  netRevenue: revenue,
});

const report: SalesReport = {
  dateFrom: "2026-10-01",
  dateTo: "2026-10-10",
  total: money("30000", "3"),
  averageReceipt: "30000",
  sellers: [],
  categories: [],
  rows: [
    {
      modelId: 1,
      productId: null,
      name: "Пальто",
      sku: "",
      category: "Верхняя одежда",
      season: "AW26",
      money: money("25000", "2"),
      variants: [
        {
          productId: 11,
          name: "Пальто 42",
          sku: "C-42",
          color: "Чёрный",
          size: "42",
          money: money("25000", "2"),
        },
      ],
    },
    {
      modelId: null,
      productId: 2,
      name: "Шарф",
      sku: "SC-1",
      category: "",
      season: "",
      money: money("5000", "1"),
      variants: [],
    },
  ],
};

describe("exportSalesXlsx", () => {
  it("writes models, their sizes as an outline and the total", async () => {
    await exportSalesXlsx(report, report.rows, "Сезон: AW26");

    expect(saved.name).toBe("Отчёт о продажах 2026-10-01 — 2026-10-10.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (saved.blob as Blob).arrayBuffer());
    const sheet = workbook.worksheets[0];
    const cells = (row: number) =>
      (sheet.getRow(row).values as unknown[]).slice(1);

    expect(cells(1)[0]).toBe("Отчёт о продажах с 01.10.2026 по 10.10.2026");
    expect(cells(2)[0]).toBe("Сезон: AW26");
    expect(cells(4)).toContain("Выручка");
    expect(cells(4)).not.toContain("Прочее");
    expect(cells(5).slice(0, 5)).toEqual([
      "Пальто",
      "",
      "Верхняя одежда",
      "AW26",
      2,
    ]);
    expect(String(cells(6)[0]).trim()).toBe("Чёрный · 42");
    expect(sheet.getRow(6).outlineLevel).toBe(1);
    expect(cells(7)[0]).toBe("Шарф");
    expect(cells(8)[0]).toBe("Итого");
    expect(cells(8)).toContain(30000);
  });
});
