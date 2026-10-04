import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildPnlXlsx, columnLetter } from "./buildPnlXlsx";
import { makeReport } from "./fixture";

async function readBack(blob: Blob): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook.worksheets[0];
}

function rowByCode(sheet: ExcelJS.Worksheet, code: string): ExcelJS.Row {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow((row) => {
    if (row.getCell(2).value === code) found = row;
  });
  if (!found) throw new Error(`нет строки ${code}`);
  return found;
}

describe("columnLetter", () => {
  it("A, Z, AA", () => {
    expect([columnLetter(1), columnLetter(26), columnLetter(27)]).toEqual(["A", "Z", "AA"]);
  });
});

describe("buildPnlXlsx", () => {
  it("шапка, строки с кодами, знаки, формулы, группировка", async () => {
    const sheet = await readBack(await buildPnlXlsx({
      report: makeReport(),
      organizationName: "Мама Доктор",
      periodLabel: "январь–февраль 2026",
      branchLabel: "Все филиалы",
      generatedAt: new Date(2026, 9, 4, 12, 30),
    }));
    expect(sheet.name).toBe("Прибыли и убытки");
    expect(sheet.getCell("A1").value).toBe("Прибыли и убытки");
    expect(sheet.getCell("A3").value).toBe("Период: январь–февраль 2026");
    expect(sheet.getCell("A5").value).toBe("Сформировано: 04.10.2026 12:30");
    expect(sheet.getRow(7).values).toEqual([undefined, "Статья", "Код", "янв 2026", "фев 2026", "Итого", "% выр."]);

    const revenue = rowByCode(sheet, "010");
    expect(revenue.getCell(3).value).toMatchObject({ formula: `SUM(C${revenue.number + 1}:C${revenue.number + 2})`, result: 1000 });
    expect(sheet.getRow(revenue.number + 1).outlineLevel).toBe(1);
    expect(sheet.getRow(revenue.number + 1).getCell(3).value).toBe(900);

    const cost = rowByCode(sheet, "020");
    expect(sheet.getRow(cost.number + 1).getCell(3).value).toBe(-100);

    const gross = rowByCode(sheet, "030");
    expect(gross.getCell(3).value).toMatchObject({ formula: `C${revenue.number}+C${cost.number}`, result: 900 });
    expect(gross.getCell(5).value).toMatchObject({ formula: `SUM(C${gross.number}:D${gross.number})`, result: 1980 });
    expect(rowByCode(sheet, "071").getCell(3).value).toBe(0);

    expect(sheet.getCell(`C${revenue.number}`).numFmt).toBe("#,##0;[Red]-#,##0");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 7 });
  });

  it("при нулевой выручке доли пустые", async () => {
    const report = makeReport();
    for (const line of report.lines) {
      line.total = "0.00";
      line.months = { "2026-01": "0.00", "2026-02": "0.00" };
      line.children = [];
    }
    const sheet = await readBack(await buildPnlXlsx({
      report, organizationName: "Org", periodLabel: "2026", branchLabel: "Все филиалы", generatedAt: new Date(2026, 0, 1),
    }));
    const revenue = rowByCode(sheet, "010");
    // exceljs не сохраняет пустой кешированный результат — проверяем формулу и отсутствие числа.
    const share = revenue.getCell(6).value as { formula: string; result?: unknown };
    expect(share.formula).toBe(`IF(E${revenue.number}=0,"",ABS(E${revenue.number})/E${revenue.number})`);
    expect(share.result ?? "").toBe("");
  });
});
