/** Таблица в xlsx на клиенте (справочники, гайд §3.1 «⇩ XLSX»): заголовок жирным, ширина по содержимому. */
export async function buildTableXlsx(sheetName: string, headers: string[], rows: (string | number | null)[][]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Лист");
  sheet.addRow(headers).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row.map((v) => (v == null ? "" : v))));
  sheet.columns.forEach((column, i) => {
    const longest = Math.max(headers[i]?.length ?? 0, ...rows.map((r) => String(r[i] ?? "").length));
    column.width = Math.min(60, Math.max(8, longest + 2));
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
