/**
 * Excel «как на экране»: строки формы с кодами, детали сгруппированы (+/−),
 * месяцы, «Итого», «% выр.». Расходы в файле отрицательные — тогда каждая
 * итоговая строка формы есть простая сумма своих слагаемых, и правка любой
 * цифры бухгалтером пересчитывает всё формулами.
 */
import type { PnlReport } from "../../api/pnl";
import { EXPENSE_CODES, num } from "./model";
import { monthLabel } from "./period";

export interface PnlXlsxInput {
  report: PnlReport;
  organizationName: string;
  periodLabel: string;
  branchLabel: string;
  generatedAt: Date;
}

const HEADER_ROW = 7;
const FIRST_MONTH_COL = 3;
const MONEY = "#,##0;[Red]-#,##0";
const FILLS: Record<string, string> = { group: "FFF3F4F8", total: "FFEEEDFD", net: "FFE6F4EA" };
const DETAIL_COLOR = "FF5B6478";

/** Итог = сумма знаковых слагаемых (расходы в файле уже со знаком «−»). */
const TOTAL_TERMS: Record<string, string[]> = {
  "030": ["010", "020"],
  "060": ["040", "050"],
  "090": ["070", "080"],
  "100": ["030", "060", "090"],
  "150": ["110", "120", "130", "140"],
  "160": ["100", "150"],
  "180": ["160", "170"],
  "200": ["180", "190"],
};

export function columnLetter(col: number): string {
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export async function buildPnlXlsx(input: PnlXlsxInput): Promise<Blob> {
  const ExcelJSModule = (await import("exceljs")).default;
  const workbook = new ExcelJSModule.Workbook();
  workbook.created = input.generatedAt;
  const sheet = workbook.addWorksheet("Прибыли и убытки", {
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });

  const months = input.report.months.map((m) => m.key);
  const totalCol = FIRST_MONTH_COL + months.length;
  const pctCol = totalCol + 1;
  sheet.columns = [{ width: 46 }, { width: 6 }, ...months.map(() => ({ width: 13 })), { width: 15 }, { width: 9 }];

  sheet.getCell("A1").value = "Прибыли и убытки";
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = input.organizationName;
  sheet.getCell("A3").value = `Период: ${input.periodLabel}`;
  sheet.getCell("A4").value = `Филиал: ${input.branchLabel}`;
  sheet.getCell("A5").value = `Сформировано: ${stamp(input.generatedAt)}`;

  const header = sheet.getRow(HEADER_ROW);
  header.values = ["Статья", "Код", ...months.map((key) => monthLabel(key, true)), "Итого", "% выр."];
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin" } };
  });

  // Раскладка: строка формы, затем её детали.
  const rowOf: Record<string, number> = {};
  const values: Record<number, number[]> = {};
  let next = HEADER_ROW + 1;
  const layout = input.report.lines.map((line) => {
    const row = next++;
    const children = line.children.map(() => next++);
    rowOf[line.code] = row;
    return { line, row, children };
  });

  for (const { line, row, children } of layout) {
    const sign = EXPENSE_CODES.has(line.code) ? -1 : 1;
    const excelRow = sheet.getRow(row);
    excelRow.getCell(1).value = line.title;
    excelRow.getCell(2).value = line.code;
    // `|| 0` — у пустой расходной строки иначе получится -0.
    values[row] = months.map((key) => sign * num(line.months[key]) || 0);
    months.forEach((_key, i) => {
      const col = FIRST_MONTH_COL + i;
      const letter = columnLetter(col);
      const result = values[row][i];
      const cell = excelRow.getCell(col);
      if (line.kind === "total") {
        cell.value = { formula: TOTAL_TERMS[line.code].map((code) => `${letter}${rowOf[code]}`).join("+"), result };
      } else if (children.length > 0) {
        cell.value = { formula: `SUM(${letter}${children[0]}:${letter}${children[children.length - 1]})`, result };
      } else {
        cell.value = result;
      }
    });
    const style = line.code === "200" ? "net" : line.kind === "total" ? "total" : line.kind === "group" ? "group" : null;
    if (style) {
      excelRow.font = { bold: true };
      for (let col = 1; col <= pctCol; col++) {
        excelRow.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILLS[style] } };
      }
    }
    children.forEach((childRow, j) => {
      const child = line.children[j];
      const xr = sheet.getRow(childRow);
      xr.outlineLevel = 1;
      xr.getCell(1).value = child.title;
      xr.getCell(1).alignment = { indent: 2 };
      values[childRow] = months.map((key) => sign * num(child.months[key]) || 0);
      months.forEach((_key, i) => {
        xr.getCell(FIRST_MONTH_COL + i).value = values[childRow][i];
      });
      xr.font = { color: { argb: DETAIL_COLOR } };
    });
  }

  const revenueRow = rowOf["010"];
  const revenueTotal = (values[revenueRow] ?? []).reduce((a, b) => a + b, 0);
  const firstLetter = columnLetter(FIRST_MONTH_COL);
  const lastLetter = columnLetter(totalCol - 1);
  const totalLetter = columnLetter(totalCol);
  for (let row = HEADER_ROW + 1; row < next; row++) {
    const excelRow = sheet.getRow(row);
    const total = (values[row] ?? []).reduce((a, b) => a + b, 0);
    excelRow.getCell(totalCol).value = { formula: `SUM(${firstLetter}${row}:${lastLetter}${row})`, result: total };
    excelRow.getCell(pctCol).value = {
      formula: `IF(${totalLetter}${revenueRow}=0,"",ABS(${totalLetter}${row})/${totalLetter}${revenueRow})`,
      result: revenueTotal ? Math.abs(total) / revenueTotal : "",
    };
    excelRow.getCell(pctCol).numFmt = "0%";
    for (let col = FIRST_MONTH_COL; col <= totalCol; col++) excelRow.getCell(col).numFmt = MONEY;
  }

  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: HEADER_ROW }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
