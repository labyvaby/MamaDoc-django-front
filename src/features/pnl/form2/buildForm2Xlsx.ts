/**
 * «Форма №2» — Отчёт о прибылях и убытках по шаблону заказчика (Шаблон ОПУ.xls).
 * Колонка «за предыдущий» — тот же период годом раньше (compare), «за отчётный» —
 * выбранный период. Итоговые строки — формулы: бухгалтер впишет амортизацию
 * или налог, и чистая прибыль пересчитается.
 */
import type { Dayjs } from "dayjs";
import type { Cell, Worksheet } from "exceljs";

import type { OrganizationRequisites } from "../../../api/organization";
import type { PnlReport } from "../../../api/pnl";
import { num } from "../model";
import { FORM2_FORMULAS, FORM2_REQUISITE_ROWS, FORM2_ROWS } from "./layout";
import { isFullYear, kyrgyzPeriod, russianPeriod } from "./periodText";

export interface Form2Input {
  report: PnlReport;
  organizationName: string;
  requisites: OrganizationRequisites;
  from: Dayjs;
  to: Dayjs;
}

const FONT = { name: "Times New Roman", size: 10 };
const THIN = { style: "thin" as const };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const UNDERLINE = { bottom: THIN };
const VALUE_COLUMNS = [
  { col: "G", next: "H", previous: true },
  { col: "I", next: "J", previous: false },
];

const center = (cell: Cell): Cell => {
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  return cell;
};

function writer(sheet: Worksheet) {
  return (address: string, value: string | number, merge?: string, bold = false): Cell => {
    if (merge) sheet.mergeCells(`${address}:${merge}`);
    const cell = sheet.getCell(address);
    cell.value = value;
    cell.font = { ...FONT, bold };
    return cell;
  };
}

export async function buildForm2Xlsx(input: Form2Input): Promise<Blob> {
  const ExcelJSModule = (await import("exceljs")).default;
  const workbook = new ExcelJSModule.Workbook();
  const sheet = workbook.addWorksheet("Форма №2");
  sheet.columns = [9, 9, 9, 12, 9, 9, 10, 9, 10, 10, 12, 12, 12].map((width) => ({ width }));
  const put = writer(sheet);

  // Шапка формы
  put("A1", "№2 форма");
  put("A2", "ФОЭСтин негизинде");
  put("A3", "жылдык финансылык отчеттуулукка");
  put("A4", "ФОСАМК менен сунушталган");
  for (const [address, text] of [
    ["M1", "Форма №2"], ["M2", "Рекомендована ГКСФОА"], ["M3", "для годовой финансовой отчетности"], ["M4", "в соответствии с МСФО"],
  ] as const) {
    put(address, text).alignment = { horizontal: "right" };
  }
  center(put("A7", kyrgyzPeriod(input.from, input.to), "M7"));
  center(put("A8", "ТҮШКӨН ПАЙДА ЖАНА ЗЫЯН ЖӨНҮНДӨГҮ ОТЧЕТ", "M8", true));
  center(put("A10", "ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ", "M10", true));
  center(put("A11", russianPeriod(input.from, input.to), "M11"));

  // Коды и реквизиты
  const req = input.requisites;
  const field = (name: string): string => {
    if (name === "__unit") return "Сом";
    if (name === "__none") return "";
    if (name === "legalName") return req.legalName || input.organizationName;
    return req[name as keyof OrganizationRequisites] ?? "";
  };
  center(put("L14", "коды", "M14", true));
  put("J15", "форма по ГКУД");
  center(put("L15", "7100012", "M15")).border = BOX;
  for (const item of FORM2_REQUISITE_ROWS) {
    put(`A${item.row}`, item.ky);
    put(`A${item.row + 1}`, item.ru);
    put(`D${item.row}`, field(item.field), `I${item.row}`).border = UNDERLINE;
    if (item.code) {
      put(`J${item.row}`, item.code.label);
      center(put(`L${item.row}`, field(item.code.field), `M${item.row}`)).border = BOX;
    }
  }
  put("A32", "ИНН");
  put("D32", req.inn, "I32").border = UNDERLINE;
  put("A34", "Көзөмөл суммасы");
  put("A35", "Контрольная сумма");
  put("D34", "", "I34").border = UNDERLINE;
  put("A37", "Дареги");
  put("A38", "Адрес");
  put("D37", req.legalAddress, "L37").border = UNDERLINE;
  put("A40", "Башкы бухгалтердин ысымы, телефону");
  put("A41", "ФИО номер телефона главного бухгалтера");
  put("G40", [req.chiefAccountantName, req.chiefAccountantPhone].filter(Boolean).join(", "), "L40").border = UNDERLINE;

  // Таблица
  const fullYear = isFullYear(input.from, input.to);
  const headers: [string, string, string?][] = [
    ["A44", "Көрсөткүчтүн аталышы", "E44"],
    ["F44", "Саптардын коду / Код строк"],
    ["G44", fullYear ? "Өткөн жыл / За предыдущий год" : "Өткөн мезгил / За аналогичный период прошлого года", "H44"],
    ["I44", fullYear ? "Отчеттук жыл / За отчетный год" : "Отчеттук мезгил / За отчетный период", "J44"],
    ["K44", "Наименование показателей", "M44"],
  ];
  for (const [address, text, merge] of headers) center(put(address, text, merge, true)).border = BOX;
  sheet.getRow(44).height = 42;
  for (const [address, n, merge] of [
    ["A45", 1, "E45"], ["F45", 2], ["G45", 3, "H45"], ["I45", 4, "J45"], ["K45", 5, "M45"],
  ] as [string, number, string?][]) {
    center(put(address, n, merge)).border = BOX;
  }

  const lineTotal = (code: string) => num(input.report.lines.find((l) => l.code === code)?.total);
  const amount = (code: string, previous: boolean) =>
    Math.round(previous ? num(input.report.compare?.totals[code]) : lineTotal(code));
  const rowOf: Record<string, number> = Object.fromEntries(
    FORM2_ROWS.filter((r) => r.code).map((r) => [r.code as string, r.row]),
  );

  for (const item of FORM2_ROWS) {
    const r = item.row;
    if (item.indent) {
      put(`B${r}`, item.ky, `E${r}`);
      put(`L${r}`, item.ru, `M${r}`);
    } else {
      put(`A${r}`, item.ky, `E${r}`, !item.code);
      put(`K${r}`, item.ru, `M${r}`, !item.code);
    }
    for (const col of ["A", "B", "K", "L"]) sheet.getCell(`${col}${r}`).alignment = { wrapText: true, vertical: "middle" };
    if (item.code) {
      center(put(`F${r}`, item.code));
      const formula = FORM2_FORMULAS[item.code];
      for (const { col, next, previous } of VALUE_COLUMNS) {
        sheet.mergeCells(`${col}${r}:${next}${r}`);
        const cell = sheet.getCell(`${col}${r}`);
        const result = amount(item.code, previous);
        cell.value = formula
          ? { formula: formula.map(([sign, code], i) => `${sign < 0 ? "-" : i ? "+" : ""}${col}${rowOf[code]}`).join(""), result }
          : result;
        cell.numFmt = "#,##0";
        cell.font = { ...FONT, bold: Boolean(formula) };
      }
    }
    for (const col of ["A", "F", "G", "I", "K"]) sheet.getCell(`${col}${r}`).border = BOX;
    sheet.getRow(r).height = 30;
  }

  put("B75", `Руководитель  _____________________  ${req.directorName}`);
  put("B76", `Главный бухгалтер _________________  ${req.chiefAccountantName}`);

  sheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
