import dayjs from "dayjs";

import type {
  SalesMoney,
  SalesReport,
  SalesRow,
} from "../../../api/retailAnalytics";
import { downloadBlob } from "../../../utility/download";
import { num } from "../retailAnalyticsModel";
import { variantLabel } from "./salesModel";

const MONEY = "# ##0.00";
const QTY = "# ##0.###";

/**
 * «Отчёт о продажах» в .xlsx — то, что сейчас на экране: модели с размерами
 * под ними (сворачиваются группировкой Excel), итог внизу. exceljs грузится
 * динамически, как в остальных выгрузках.
 */
export async function exportSalesXlsx(
  report: SalesReport,
  rows: readonly SalesRow[],
  filtersLabel: string
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Продажи", { properties: { outlineLevelRow: 1 } });
  const withOther =
    num(report.total.other) !== 0 || num(report.total.returnedOther) !== 0;

  const columns = [
    { header: "Позиция", key: "name", width: 46 },
    { header: "Артикул", key: "sku", width: 16 },
    { header: "Категория", key: "category", width: 22 },
    { header: "Сезон", key: "season", width: 12 },
    { header: "Кол-во", key: "quantity", width: 9, fmt: QTY },
    { header: "Без скидки", key: "gross", width: 14, fmt: MONEY },
    { header: "Скидка", key: "discount", width: 13, fmt: MONEY },
    { header: "Выручка", key: "revenue", width: 14, fmt: MONEY },
    { header: "Наличные", key: "cash", width: 14, fmt: MONEY },
    { header: "Карта", key: "card", width: 14, fmt: MONEY },
    ...(withOther
      ? [{ header: "Прочее", key: "other", width: 12, fmt: MONEY }]
      : []),
    { header: "Чеков", key: "receipts", width: 8 },
    { header: "Возврат, шт", key: "returnedQuantity", width: 11, fmt: QTY },
    { header: "Возврат, сом", key: "returnedAmount", width: 13, fmt: MONEY },
    { header: "Итого", key: "netRevenue", width: 14, fmt: MONEY },
  ];

  ws.addRow([
    `Отчёт о продажах с ${dayjs(report.dateFrom).format(
      "DD.MM.YYYY"
    )} по ${dayjs(report.dateTo).format("DD.MM.YYYY")}`,
  ]).font = {
    bold: true,
    size: 13,
  };
  if (filtersLabel)
    ws.addRow([filtersLabel]).font = { color: { argb: "FF6B7280" } };
  ws.addRow([]);
  const headerRow = ws.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F2F4" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD0D4DA" } } };
  });
  columns.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.width;
  });

  const values = (money: SalesMoney) => ({
    quantity: num(money.quantity),
    gross: num(money.gross),
    discount: num(money.discount),
    revenue: num(money.revenue),
    cash: num(money.cash),
    card: num(money.card),
    other: num(money.other),
    receipts: money.receipts,
    returnedQuantity: num(money.returnedQuantity),
    returnedAmount: num(money.returnedAmount),
    netRevenue: num(money.netRevenue),
  });
  const add = (
    cells: Record<string, string | number>,
    level: number,
    bold: boolean
  ) => {
    const row = ws.addRow(columns.map((column) => cells[column.key] ?? ""));
    columns.forEach((column, index) => {
      if (column.fmt) row.getCell(index + 1).numFmt = column.fmt;
    });
    row.outlineLevel = level;
    if (bold) row.font = { bold: true };
    return row;
  };

  for (const row of rows) {
    add(
      {
        name: row.name,
        sku: row.sku,
        category: row.category,
        season: row.season,
        ...values(row.money),
      },
      0,
      true
    );
    for (const variant of row.variants) {
      add(
        {
          name: `    ${variantLabel(variant)}`,
          sku: variant.sku,
          ...values(variant.money),
        },
        1,
        false
      );
    }
  }
  const totalRow = add({ name: "Итого", ...values(report.total) }, 0, true);
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
  });

  ws.views = [{ state: "frozen", ySplit: headerRow.number, xSplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Отчёт о продажах ${report.dateFrom} — ${report.dateTo}.xlsx`
  );
}
