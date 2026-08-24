/**
 * Платёжная ведомость («Список сотрудников») в формате .xlsx.
 *
 * Повторяет бумажный образец бухгалтерии: шапка «Детали платежа», строки
 * «№ / ФИО / Номер карты/Счета / Сумма / Рабочих дней / Статус операции» и
 * подпись исполнителя внизу. Файл уходит в банк, поэтому номер счёта пишется
 * текстом (`@`), иначе Excel показывает 16 цифр как 1,24207E+15.
 *
 * exceljs грузится динамическим import — библиотека ~700 КБ и нужна только в
 * момент выгрузки, в основной бандл её тянуть незачем.
 */

export interface PayrollStatementRow {
  fullName: string;
  /** Номер карты/счёта. Пусто, если не заполнен в карточке сотрудника. */
  accountNumber: string;
  /** Сумма к выплате. */
  amount: number;
  /** Отработанных дней за месяц. null — посчитать не удалось. */
  workDays: number | null;
  /** «Полный» / «По совместительству» — заполняется вручную в форме. */
  employmentType: string;
}

export interface PayrollStatementInput {
  /** Заголовок первой строки, по умолчанию «Детали платежа». */
  title?: string;
  rows: PayrollStatementRow[];
  /** ФИО подписанта в строке «Исполнитель:». */
  executorName: string;
  sheetName?: string;
}

const HEADERS = [
  "№",
  "ФИО",
  "",
  "Номер карты/Счета",
  "Сумма",
  "Рабочих дней",
  "Статус операции",
];

/** Ширины колонок из образца (A…G). */
const COLUMN_WIDTHS = [20.7, 32.2, 10.7, 30.7, 20.7, 20.7, 60.7];

export async function buildPayrollStatementXlsx(
  input: PayrollStatementInput,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(input.sheetName ?? "Ведомость");

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const thin = { style: "thin" as const };
  const bordered = { top: thin, left: thin, bottom: thin, right: thin };

  // Строка 1 — заголовок на всю ширину.
  const titleRow = sheet.addRow([input.title ?? "Детали платежа"]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 7);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 11 };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  titleCell.border = {
    top: { style: "medium" },
    bottom: { style: "medium" },
    left: thin,
    right: thin,
  };

  // Строка 2 — шапка таблицы. ФИО занимает B:C, как в образце.
  const headerRow = sheet.addRow(HEADERS);
  sheet.mergeCells(headerRow.number, 2, headerRow.number, 3);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = bordered;
  });

  input.rows.forEach((row, index) => {
    const dataRow = sheet.addRow([
      index + 1,
      row.fullName.trim(),
      "",
      row.accountNumber.trim(),
      row.amount,
      row.workDays,
      row.employmentType,
    ]);
    sheet.mergeCells(dataRow.number, 2, dataRow.number, 3);

    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = bordered;
      cell.alignment = { vertical: "middle" };
    });

    dataRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    // Номер счёта — только текст, иначе Excel съедает ведущие нули и уводит
    // 16-значный номер в экспоненциальную запись.
    const accountCell = dataRow.getCell(4);
    accountCell.numFmt = "@";
    accountCell.value = row.accountNumber.trim();
    const amountCell = dataRow.getCell(5);
    amountCell.numFmt = "#,##0.00";
    amountCell.alignment = { horizontal: "right", vertical: "middle" };
    dataRow.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
  });

  // Подпись исполнителя — отдельной строкой под таблицей, без рамок.
  sheet.addRow([]);
  const executorRow = sheet.addRow(["Исполнитель:", input.executorName.trim()]);
  executorRow.getCell(1).font = { bold: true, size: 11 };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Скачивание общее для всех выгрузок (ведомость ЗП, журнал реестров) — живёт
// в utility/download.ts; здесь реэкспорт, чтобы не менять вызовы ведомости.
export { downloadBlob } from "../../../utility/download";
