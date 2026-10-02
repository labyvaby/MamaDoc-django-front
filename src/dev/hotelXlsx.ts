/**
 * Выгрузка отчётов отеля в .xlsx в одном оформлении: заголовок, строки
 * условий (период, валюта, дата формирования), блок итогов «показатель —
 * значение» и таблицы с тёмной шапкой, зеброй, итоговой строкой и
 * правильными форматами чисел и дат — чтобы файл можно было сразу отправить
 * собственнику или бухгалтеру, не правя руками.
 *
 * exceljs грузится динамическим import — в основной бандл не попадает
 * (как в exportHotelDailyReportXlsx.ts).
 */
import dayjs from "dayjs";
import type { Cell, Worksheet } from "exceljs";

import { downloadBlob } from "../utility/download";

export type XlsxValue = string | number | null | undefined;
/** money — сумма; int — целое; date — "YYYY-MM-DD"; datetime — ISO; percent — 64.5 → «64,5%». */
export type XlsxKind = "text" | "money" | "int" | "date" | "datetime" | "percent";

export interface XlsxColumn {
  header: string;
  width?: number;
  kind?: XlsxKind;
}

export interface XlsxTable {
  title?: string;
  columns: XlsxColumn[];
  rows: XlsxValue[][];
  totals?: XlsxValue[];
}

export interface XlsxSheet {
  /** Имя листа — до 31 символа, без []:*?/\ */
  name: string;
  title: string;
  meta?: string[];
  summary?: { label: string; value: XlsxValue; kind?: XlsxKind }[];
  tables: XlsxTable[];
}

const INK = "FF0F172A";
const MUTED = "FF64748B";
const LINE = "FFE2E8F0";
const ZEBRA = "FFF8FAFC";
const TOTAL_BG = "FFEEF2F7";

const thin = { style: "thin" as const, color: { argb: LINE } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

/** "2026-10-01" → дата Excel без сдвига часового пояса. */
function excelDate(iso: string): Date | null {
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  return new Date(Date.UTC(d.year(), d.month(), d.date()));
}

/** ISO с временем → «настенное» время объекта как есть, без UTC-сдвига в Excel. */
function excelDateTime(iso: string): Date | null {
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  return new Date(Date.UTC(d.year(), d.month(), d.date(), d.hour(), d.minute()));
}

function toCellValue(value: XlsxValue, kind: XlsxKind): string | number | Date | null {
  if (value == null || value === "") return null;
  if (kind === "date" && typeof value === "string") return excelDate(value) ?? value;
  if (kind === "datetime" && typeof value === "string") return excelDateTime(value) ?? value;
  if ((kind === "money" || kind === "int" || kind === "percent") && typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

function numFmt(kind: XlsxKind, integers: boolean): string | undefined {
  switch (kind) {
    case "money":
      return integers ? "#,##0;[Red]-#,##0" : "#,##0.00;[Red]-#,##0.00";
    case "int":
      return "#,##0";
    case "date":
      return "dd.mm.yyyy";
    case "datetime":
      return "dd.mm.yyyy hh:mm";
    case "percent":
      return '0.0"%"';
    default:
      return undefined;
  }
}

function isIntegerColumn(rows: XlsxValue[][], totals: XlsxValue[] | undefined, index: number): boolean {
  const all = totals ? [...rows, totals] : rows;
  return all.every((row) => {
    const v = row[index];
    if (v == null || v === "") return true;
    const n = Number(v);
    return !Number.isFinite(n) || Number.isInteger(n);
  });
}

function styleCell(cell: Cell, opts: { kind: XlsxKind; integers: boolean; zebra?: boolean; total?: boolean }) {
  const fmt = numFmt(opts.kind, opts.integers);
  if (fmt) cell.numFmt = fmt;
  cell.border = opts.total ? { ...BORDER, top: { style: "medium", color: { argb: INK } } } : BORDER;
  cell.alignment = {
    vertical: "middle",
    horizontal: opts.kind === "text" ? "left" : opts.kind === "date" || opts.kind === "datetime" ? "center" : "right",
    wrapText: opts.kind === "text",
  };
  if (opts.total) {
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
  } else if (opts.zebra) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
  }
}

function writeTable(ws: Worksheet, table: XlsxTable, startRow: number): { headerRow: number; lastRow: number } {
  let r = startRow;
  if (table.title) {
    const t = ws.getRow(r);
    t.getCell(1).value = table.title;
    t.getCell(1).font = { bold: true, size: 12, color: { argb: INK } };
    t.height = 20;
    r += 1;
  }
  const headerRow = r;
  const header = ws.getRow(r);
  table.columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER;
  });
  header.height = 24;
  r += 1;

  const integers = table.columns.map((_, i) => isIntegerColumn(table.rows, table.totals, i));
  table.rows.forEach((values, rowIndex) => {
    const row = ws.getRow(r);
    table.columns.forEach((col, i) => {
      const kind = col.kind ?? "text";
      const cell = row.getCell(i + 1);
      cell.value = toCellValue(values[i], kind);
      styleCell(cell, { kind, integers: integers[i], zebra: rowIndex % 2 === 1 });
    });
    r += 1;
  });
  if (table.totals) {
    const row = ws.getRow(r);
    table.columns.forEach((col, i) => {
      const kind = col.kind ?? "text";
      const cell = row.getCell(i + 1);
      cell.value = toCellValue(table.totals?.[i], kind);
      styleCell(cell, { kind, integers: integers[i], total: true });
    });
    row.height = 20;
    r += 1;
  }
  return { headerRow, lastRow: r - 1 };
}

function columnWidths(sheet: XlsxSheet): number[] {
  const count = Math.max(...sheet.tables.map((t) => t.columns.length), 2);
  const widths = new Array<number>(count).fill(10);
  for (const table of sheet.tables) {
    table.columns.forEach((col, i) => {
      if (col.width) {
        widths[i] = Math.max(widths[i], col.width);
        return;
      }
      const longest = Math.max(
        col.header.length,
        ...table.rows.slice(0, 300).map((row) => String(row[i] ?? "").length),
      );
      const base = col.kind === "date" ? 12 : col.kind === "datetime" ? 17 : col.kind === "money" ? 14 : 8;
      widths[i] = Math.max(widths[i], Math.min(48, Math.max(base, longest + 2)));
    });
  }
  return widths;
}

export async function downloadXlsx(fileName: string, sheets: XlsxSheet[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aximo CRM";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31), {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      views: [{ showGridLines: false }],
    });
    ws.columns = columnWidths(sheet).map((width) => ({ width }));

    let r = 1;
    const title = ws.getRow(r);
    title.getCell(1).value = sheet.title;
    title.getCell(1).font = { bold: true, size: 16, color: { argb: INK } };
    title.height = 26;
    r += 1;
    for (const line of [...(sheet.meta ?? []), `Сформировано: ${dayjs().format("DD.MM.YYYY HH:mm")}`]) {
      const row = ws.getRow(r);
      row.getCell(1).value = line;
      row.getCell(1).font = { size: 10, color: { argb: MUTED } };
      r += 1;
    }
    r += 1;

    if (sheet.summary?.length) {
      for (const item of sheet.summary) {
        const kind = item.kind ?? "text";
        const row = ws.getRow(r);
        const label = row.getCell(1);
        label.value = item.label;
        label.font = { size: 10, color: { argb: MUTED } };
        label.border = { bottom: thin };
        const value = row.getCell(2);
        value.value = toCellValue(item.value, kind);
        const fmt = numFmt(kind, Number.isInteger(Number(item.value)));
        if (fmt) value.numFmt = fmt;
        value.font = { bold: true, size: 11, color: { argb: INK } };
        value.alignment = { horizontal: kind === "text" ? "left" : "right" };
        value.border = { bottom: thin };
        r += 1;
      }
      r += 1;
    }

    let first: { headerRow: number; lastRow: number } | null = null;
    sheet.tables.forEach((table, index) => {
      const placed = writeTable(ws, table, r);
      if (index === 0) first = placed;
      r = placed.lastRow + 3;
    });

    // Одна таблица — закрепляем шапку и включаем фильтры, как в выгрузке Exely.
    const single = first as { headerRow: number; lastRow: number } | null;
    if (sheet.tables.length === 1 && single && sheet.tables[0].rows.length > 0) {
      ws.views = [{ state: "frozen", ySplit: single.headerRow, showGridLines: false }];
      ws.autoFilter = {
        from: { row: single.headerRow, column: 1 },
        to: { row: single.headerRow + sheet.tables[0].rows.length, column: sheet.tables[0].columns.length },
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

/** «Отчёт 01.10.2026–07.10.2026.xlsx» — без символов, которые ломают имя файла в Windows. */
export function xlsxFileName(base: string, from: string, to?: string): string {
  const f = dayjs(from).format("DD.MM.YYYY");
  const t = to && to !== from ? `–${dayjs(to).format("DD.MM.YYYY")}` : "";
  return `${base} ${f}${t}.xlsx`.replace(/[<>:"/\\|?*]/g, " ");
}
