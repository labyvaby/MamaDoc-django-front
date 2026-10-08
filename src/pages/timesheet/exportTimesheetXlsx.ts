/**
 * Табель месяца в .xlsx — по образцу унифицированного табеля: на сотрудника
 * две строки (отметка и часы), справа итоги, снизу легенда. Цвет ячейки —
 * цвет отметки, как на экране, чтобы распечатка читалась так же.
 *
 * exceljs грузится динамическим import — библиотека ~700 КБ и нужна только в
 * момент выгрузки.
 */

import type { TimesheetCode, TimesheetGrid, TimesheetRow } from "../../api/timesheet";
import { formatHours, monthLabel, toNumber, WEEKDAY_SHORT } from "./model";

export interface TimesheetExportOptions {
  organizationName?: string;
  branchName?: string | null;
  generatedAt?: Date;
}

const TOTALS: { title: string; value: (row: TimesheetRow) => number | string }[] = [
  { title: "Дней", value: (row) => row.totals.workedDays },
  { title: "Часов", value: (row) => toNumber(row.totals.hours) },
  { title: "Ночных", value: (row) => toNumber(row.totals.nightHours) },
  { title: "Переработка, ч", value: (row) => toNumber(row.totals.overtimeHours) },
  { title: "Отпуск", value: (row) => row.totals.vacationDays },
  { title: "Больничный", value: (row) => row.totals.sickDays },
  { title: "Неявки", value: (row) => row.totals.absenceDays },
  { title: "Пропуски", value: (row) => row.totals.missingDays },
];

/** #RRGGBB → ARGB с прозрачностью на белом (как alpha-заливка на экране). */
function tint(hex: string, strength: number): string {
  const clean = hex.replace("#", "");
  const mix = (offset: number) => {
    const channel = parseInt(clean.slice(offset, offset + 2), 16);
    return Math.round(255 - (255 - channel) * strength)
      .toString(16)
      .padStart(2, "0");
  };
  return `FF${mix(0)}${mix(2)}${mix(4)}`.toUpperCase();
}

function ink(hex: string): string {
  const clean = hex.replace("#", "");
  const dark = (offset: number) =>
    Math.round(parseInt(clean.slice(offset, offset + 2), 16) * 0.62)
      .toString(16)
      .padStart(2, "0");
  return `FF${dark(0)}${dark(2)}${dark(4)}`.toUpperCase();
}

export function timesheetFileName(month: string): string {
  return `Табель_${month}.xlsx`;
}

export async function buildTimesheetXlsx(
  grid: TimesheetGrid,
  options: TimesheetExportOptions = {},
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = options.generatedAt ?? new Date();
  const sheet = workbook.addWorksheet("Табель", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const codes = new Map<string, TimesheetCode>(grid.codes.map((code) => [code.key, code]));
  const dayCount = grid.days.length;
  const firstDayColumn = 4;
  const firstTotalColumn = firstDayColumn + dayCount;
  const lastColumn = firstTotalColumn + TOTALS.length - 1;

  sheet.columns = [
    { width: 5 },
    { width: 30 },
    { width: 18 },
    ...grid.days.map(() => ({ width: 4.6 })),
    ...TOTALS.map(() => ({ width: 10 })),
  ];

  const thin = { style: "thin" as const, color: { argb: "FFD0D5DD" } };
  const bordered = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };

  // 1–2: заголовок.
  sheet.mergeCells(1, 1, 1, lastColumn);
  const title = sheet.getCell(1, 1);
  title.value = `Табель учёта рабочего времени — ${monthLabel(grid.month)}`;
  title.font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, lastColumn);
  const subtitle = sheet.getCell(2, 1);
  const place = [options.organizationName, options.branchName ?? grid.scope.branchName].filter(Boolean).join(" · ");
  const generated = (options.generatedAt ?? new Date()).toLocaleDateString("ru-RU");
  subtitle.value = `${place ? `${place} · ` : ""}сформирован ${generated}${grid.closed ? " · месяц закрыт" : ""}`;
  subtitle.font = { size: 10, color: { argb: "FF667085" } };

  // 4–5: шапка таблицы (номер дня и день недели).
  const headerTop = sheet.getRow(4);
  const headerBottom = sheet.getRow(5);
  for (const [column, label] of [
    [1, "№"],
    [2, "Сотрудник"],
    [3, "Должность"],
  ] as const) {
    sheet.mergeCells(4, column, 5, column);
    headerTop.getCell(column).value = label;
  }
  grid.days.forEach((day, index) => {
    const column = firstDayColumn + index;
    headerTop.getCell(column).value = day.day;
    headerBottom.getCell(column).value = WEEKDAY_SHORT[day.weekday];
    const off = day.isWeekend || Boolean(day.holiday);
    for (const cell of [headerTop.getCell(column), headerBottom.getCell(column)]) {
      if (off) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: day.holiday ? "FFFCE7F3" : "FFF2F4F7" } };
        cell.font = { bold: true, color: { argb: day.holiday ? "FFBE185D" : "FFB42318" } };
      }
    }
    if (day.holiday) headerTop.getCell(column).note = day.holiday;
  });
  TOTALS.forEach((total, index) => {
    const column = firstTotalColumn + index;
    sheet.mergeCells(4, column, 5, column);
    headerTop.getCell(column).value = total.title;
  });
  for (const row of [headerTop, headerBottom]) {
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      if (column > lastColumn) return;
      cell.alignment = center;
      cell.border = bordered;
      cell.font = { bold: true, size: 9, ...(cell.font ?? {}) };
      if (!cell.fill || (cell.fill as { pattern?: string }).pattern !== "solid") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      }
    });
  }

  // Строки сотрудников: отметка + часы.
  grid.rows.forEach((row, index) => {
    const top = 6 + index * 2;
    const codeRow = sheet.getRow(top);
    const hoursRow = sheet.getRow(top + 1);
    for (const [column, value] of [
      [1, index + 1],
      [2, row.employee.fullName],
      [3, row.employee.roleName || row.employee.specializations[0] || ""],
    ] as const) {
      sheet.mergeCells(top, column, top + 1, column);
      codeRow.getCell(column).value = value;
    }
    row.cells.forEach((cell) => {
      const column = firstDayColumn + cell.day - 1;
      const code = cell.code ? codes.get(cell.code) : undefined;
      const letterCell = codeRow.getCell(column);
      const hoursCell = hoursRow.getCell(column);
      letterCell.value = code ? code.letter : cell.state === "missing" ? "×" : "";
      const hours = toNumber(cell.hours);
      hoursCell.value = hours ? Number(formatHours(hours).replace(",", ".")) : null;
      if (code) {
        const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: tint(code.color, 0.22) } };
        letterCell.fill = fill;
        hoursCell.fill = fill;
        letterCell.font = { bold: true, size: 9, color: { argb: ink(code.color) } };
        hoursCell.font = { size: 8, color: { argb: ink(code.color) } };
      } else if (cell.state === "missing") {
        letterCell.font = { bold: true, size: 9, color: { argb: "FFD92D20" } };
      }
    });
    TOTALS.forEach((total, totalIndex) => {
      const column = firstTotalColumn + totalIndex;
      sheet.mergeCells(top, column, top + 1, column);
      codeRow.getCell(column).value = total.value(row);
      codeRow.getCell(column).font = { bold: true, size: 10 };
    });
    for (const sheetRow of [codeRow, hoursRow]) {
      sheetRow.height = 15;
      for (let column = 1; column <= lastColumn; column += 1) {
        const cell = sheetRow.getCell(column);
        cell.border = bordered;
        cell.alignment = column === 2 || column === 3 ? { vertical: "middle", wrapText: true } : center;
      }
    }
  });

  // Итог по дням: сколько человек на работе.
  const totalRowIndex = 6 + grid.rows.length * 2;
  const totalRow = sheet.getRow(totalRowIndex);
  sheet.mergeCells(totalRowIndex, 1, totalRowIndex, 3);
  totalRow.getCell(1).value = "Явка по дням";
  totalRow.getCell(1).font = { bold: true };
  grid.daily.forEach((stat) => {
    const cell = totalRow.getCell(firstDayColumn + stat.day - 1);
    cell.value = stat.present;
    cell.alignment = center;
    cell.font = { bold: true, size: 9 };
  });
  TOTALS.forEach((total, index) => {
    const values = grid.rows.map((row) => Number(total.value(row)) || 0);
    totalRow.getCell(firstTotalColumn + index).value = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
    totalRow.getCell(firstTotalColumn + index).font = { bold: true };
    totalRow.getCell(firstTotalColumn + index).alignment = center;
  });
  for (let column = 1; column <= lastColumn; column += 1) {
    totalRow.getCell(column).border = bordered;
    totalRow.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  }

  // Легенда.
  const legend = workbook.addWorksheet("Обозначения");
  legend.columns = [{ width: 8 }, { width: 28 }, { width: 26 }];
  legend.addRow(["Код", "Значение", "Особенности"]).font = { bold: true };
  for (const code of grid.codes) {
    const notes = [
      code.blocksBooking ? "закрывает запись клиентов" : "",
      code.isPaid ? "оплачивается" : "",
      code.isActive ? "" : "скрыта",
    ]
      .filter(Boolean)
      .join(", ");
    const row = legend.addRow([code.letter, code.name, notes]);
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: tint(code.color, 0.25) } };
    row.getCell(1).font = { bold: true, color: { argb: ink(code.color) } };
    row.getCell(1).alignment = { horizontal: "center" };
  }
  legend.addRow([]);
  legend.addRow(["×", "Пропуск: рабочий день по графику без отметок"]);
  if (grid.holidays.length) {
    legend.addRow([]);
    legend.addRow(["", "Праздники месяца"]).font = { bold: true };
    for (const holiday of grid.holidays) legend.addRow([holiday.date.slice(8, 10), holiday.name]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
