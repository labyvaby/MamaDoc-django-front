import dayjs from "dayjs";

import type { DjangoProduct } from "../../../api/warehouse";
import { downloadBlob } from "../../../utility/download";

/**
 * Выгрузка выбранных товаров в .xlsx — ровно то, что видно в списке, без
 * запросов. exceljs грузится динамически, как в остальных выгрузках.
 */
export async function exportProductsXlsx(products: readonly DjangoProduct[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Товары");
  ws.columns = [
    { header: "Название", key: "name", width: 44 },
    { header: "Артикул", key: "sku", width: 16 },
    { header: "Штрихкод", key: "barcode", width: 18 },
    { header: "Категория", key: "category", width: 24 },
    { header: "Ед.", key: "unit", width: 8 },
    { header: "Цена, сом", key: "price", width: 12 },
    { header: "Остаток", key: "stock", width: 10 },
    { header: "Сумма по цене, сом", key: "total", width: 18 },
    { header: "В продаже", key: "forSale", width: 11 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const p of products) {
    const row = ws.addRow({
      name: p.name,
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      category: p.category ?? "",
      unit: p.unit ?? "",
      price: p.price,
      stock: p.stock,
      total: Math.round(p.price * Math.max(0, p.stock)),
      forSale: p.isForSale ? "да" : "нет",
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
    `Товары ${dayjs().format("YYYY-MM-DD")}.xlsx`,
  );
}
