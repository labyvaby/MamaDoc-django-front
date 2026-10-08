import dayjs from "dayjs";

import type { DjangoStockItem } from "../../../api/warehouse";
import { downloadBlob } from "../../../utility/download";

/**
 * Выгрузка выбранных остатков склада в .xlsx — ровно то, что в списке, без
 * запросов. exceljs грузится динамически, как в остальных выгрузках.
 */
export async function exportStockXlsx(
  items: readonly DjangoStockItem[],
  prices: ReadonlyMap<number, number>,
  warehouseName: string,
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Остатки");
  ws.columns = [
    { header: "Товар", key: "name", width: 44 },
    { header: "Категория", key: "category", width: 22 },
    { header: "Штрихкод", key: "barcode", width: 18 },
    { header: "Остаток", key: "qty", width: 10 },
    { header: "Ед.", key: "unit", width: 8 },
    { header: "Цена, сом", key: "price", width: 12 },
    { header: "Сумма по цене, сом", key: "total", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const item of items) {
    const price = prices.get(item.productId) ?? 0;
    const row = ws.addRow({
      name: item.productName,
      category: item.productCategory ?? "",
      barcode: item.productBarcode ?? "",
      qty: item.quantity,
      unit: item.productUnit || "шт",
      price,
      total: Math.round(price * Math.max(0, item.quantity)),
    });
    row.getCell("price").numFmt = "# ##0";
    row.getCell("total").numFmt = "# ##0";
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Остатки ${warehouseName} ${dayjs().format("YYYY-MM-DD")}.xlsx`,
  );
}
