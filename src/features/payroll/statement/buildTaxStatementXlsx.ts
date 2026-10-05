/**
 * Налоговая ведомость за месяц (.xlsx) для бухгалтера: по каждому
 * оформленному сотруднику — режим, база, подоходный налог, Соцфонд за
 * работника и за работодателя, к выплате. Строится из отчёта ЗП целиком,
 * без дополнительных запросов: все суммы бэк уже посчитал.
 *
 * Отдельно от платёжной ведомости: та повторяет банковский шаблон и лишних
 * колонок не терпит.
 */
import type { PayrollRow } from "../../../api/payroll";

export const TAX_REGIME_LABELS: Record<string, string> = {
  employment: "Трудовой договор",
  civil: "Договор ГПХ",
  patent: "ИП на патенте",
  unofficial: "Без оформления",
};

export interface TaxStatementRow {
  fullName: string;
  regime: string;
  earnings: number;
  taxBase: number;
  incomeTax: number;
  socialFundEmployee: number;
  socialFundEmployer: number;
  netSalary: number;
}

const num = (value: string | undefined) => Number.parseFloat(value || "0") || 0;

/** Строки ведомости: только те, у кого есть налоги или налоговый профиль. */
export function taxStatementRows(rows: PayrollRow[]): TaxStatementRow[] {
  return rows
    .filter(
      (row) =>
        (row.taxRegime && row.taxRegime !== "unofficial") ||
        num(row.incomeTax) > 0 ||
        num(row.socialFundEmployee) > 0 ||
        num(row.socialFundEmployer) > 0,
    )
    .map((row) => ({
      fullName: row.fullName.trim(),
      regime: TAX_REGIME_LABELS[row.taxRegime ?? ""] ?? "—",
      earnings: num(row.earnings),
      taxBase: num(row.taxBase),
      incomeTax: num(row.incomeTax),
      socialFundEmployee: num(row.socialFundEmployee),
      socialFundEmployer: num(row.socialFundEmployer),
      netSalary: num(row.netSalary),
    }));
}

const HEADERS = [
  "№",
  "ФИО",
  "Режим",
  "Начислено",
  "База налогов",
  "Подоходный налог",
  "Соцфонд (работник)",
  "Соцфонд (работодатель)",
  "К выплате",
];

const COLUMN_WIDTHS = [6, 34, 20, 15, 15, 17, 19, 22, 15];

/** Денежные поля в порядке колонок D…I — формат #,##0.00 и сумма в «Итого». */
const MONEY_KEYS = [
  "earnings",
  "taxBase",
  "incomeTax",
  "socialFundEmployee",
  "socialFundEmployer",
  "netSalary",
] as const;
const FIRST_MONEY_COLUMN = 4;
const MONEY_COLUMNS = MONEY_KEYS.map((_, i) => FIRST_MONEY_COLUMN + i);

export async function buildTaxStatementXlsx(input: {
  rows: TaxStatementRow[];
  /** «Октябрь 2026» — в заголовке. */
  monthLabel: string;
  organizationName?: string;
}): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Налоги");
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const thin = { style: "thin" as const };
  const bordered = { top: thin, left: thin, bottom: thin, right: thin };

  const title = sheet.addRow([
    `Налоги с зарплаты · ${input.monthLabel}${input.organizationName ? ` · ${input.organizationName}` : ""}`,
  ]);
  sheet.mergeCells(title.number, 1, title.number, HEADERS.length);
  title.getCell(1).font = { bold: true, size: 12 };
  sheet.addRow([]);

  const header = sheet.addRow(HEADERS);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = bordered;
  });

  input.rows.forEach((row, index) => {
    const dataRow = sheet.addRow([
      index + 1,
      row.fullName,
      row.regime,
      ...MONEY_KEYS.map((key) => row[key]),
    ]);
    dataRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = bordered;
    });
    dataRow.getCell(1).alignment = { horizontal: "center" };
    MONEY_COLUMNS.forEach((col) => {
      dataRow.getCell(col).numFmt = "#,##0.00";
    });
  });

  const totals = sheet.addRow([
    "",
    "Итого",
    "",
    ...MONEY_KEYS.map((key) => input.rows.reduce((sum, row) => sum + row[key], 0)),
  ]);
  totals.font = { bold: true };
  totals.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = bordered;
  });
  MONEY_COLUMNS.forEach((col) => {
    totals.getCell(col).numFmt = "#,##0.00";
  });

  sheet.addRow([]);
  const toPay = input.rows.reduce(
    (sum, row) => sum + row.incomeTax + row.socialFundEmployee + row.socialFundEmployer,
    0,
  );
  const note = sheet.addRow([
    "",
    `Перечислить в бюджет и Соцфонд: ${toPay.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с`,
  ]);
  note.getCell(2).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
