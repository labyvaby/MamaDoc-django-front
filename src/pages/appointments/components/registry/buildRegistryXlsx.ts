/**
 * Выгрузка среза журнала в .xlsx — то, ради чего раньше открывали таблицу и
 * копировали руками.
 *
 * Пишем ровно тот срез, который виден на экране (период, условия, фильтр
 * оплаты), поэтому файл всегда сходится с итогами на странице. exceljs
 * подгружается динамически: библиотека ~700 КБ и нужна только в момент
 * выгрузки.
 */
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../../api/appointments";
import { downloadBlob } from "../../../../utility/download";
import { moneyOf, type LinesOf } from "./registryStats";

export interface RegistryExportInput {
  items: DjangoAppointment[];
  linesOf: LinesOf;
  /** Заголовок листа: «Все приёмы · август 2026». */
  title: string;
  sheetName: string;
  /** Подпись колонки исполнителя: «Врач» / «Медсестра». */
  performerHeader: string;
  servicesHeader: string;
  paymentLabel: (appt: DjangoAppointment) => string;
  statusLabel: (appt: DjangoAppointment) => string;
  /** Деньги выгружаем только при праве finance.view. */
  withMoney: boolean;
  /** Прибавлять ли товары приёма к сумме — как в журнале на экране. */
  withProducts?: boolean;
}

const MONEY_FORMAT = "#,##0";

export async function buildRegistryXlsx(input: RegistryExportInput): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(input.sheetName);

  // Деньги строк считаем заранее: от них зависит, нужна ли колонка «Возврат»
  // (в обычном месяце она пустая во всю высоту листа).
  const moneyByAppt = input.items.map((appt) => moneyOf(appt, input.linesOf(appt), input.withProducts));
  const withRefunds = input.withMoney && moneyByAppt.some((money) => money.refunded > 0);
  const moneyHeaders = input.withMoney
    ? ["Начислено", "Оплачено", "Остаток", ...(withRefunds ? ["Возврат"] : [])]
    : [];

  const headers = [
    "Дата",
    "Время",
    "Пациент",
    "Телефон",
    input.performerHeader,
    input.servicesHeader,
    "Статус визита",
    "Статус оплаты",
    ...moneyHeaders,
  ];

  sheet.columns = [
    { width: 12 },
    { width: 9 },
    { width: 28 },
    { width: 16 },
    { width: 24 },
    { width: 38 },
    { width: 16 },
    { width: 16 },
    ...moneyHeaders.map(() => ({ width: 13 })),
  ];

  const titleRow = sheet.addRow([input.title]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, headers.length);
  titleRow.getCell(1).font = { bold: true, size: 12 };

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin" } };
  });

  const moneyCells = (money: { accrued: number; paid: number; debt: number; refunded: number }) =>
    input.withMoney
      ? [money.accrued, money.paid, money.debt, ...(withRefunds ? [-money.refunded] : [])]
      : [];
  const firstMoneyColumn = headers.length - moneyHeaders.length + 1;
  const total = { accrued: 0, paid: 0, debt: 0, refunded: 0 };

  input.items.forEach((appt, index) => {
    const lines = input.linesOf(appt);
    const money = moneyByAppt[index];
    total.accrued += money.accrued;
    total.paid += money.paid;
    total.debt += money.debt;
    total.refunded += money.refunded;

    const at = dayjs(appt.scheduledAt);
    const row = sheet.addRow([
      at.format("DD.MM.YYYY"),
      at.format("HH:mm"),
      appt.patient?.fullName ?? "",
      appt.patient?.phone ?? "",
      Array.from(
        new Set(lines.map((line) => line.employee?.fullName).filter(Boolean) as string[]),
      ).join(", "),
      lines.map((line) => line.service?.name).filter(Boolean).join(", "),
      input.statusLabel(appt),
      input.paymentLabel(appt),
      ...moneyCells(money),
    ]);

    for (let column = firstMoneyColumn; column <= headers.length; column += 1) {
      row.getCell(column).numFmt = MONEY_FORMAT;
    }
  });

  if (input.withMoney) {
    const totalRow = sheet.addRow([
      "Итого",
      "",
      `${input.items.length} записей`,
      "",
      "",
      "",
      "",
      "",
      ...moneyCells(total),
    ]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" } };
    });
    for (let column = firstMoneyColumn; column <= headers.length; column += 1) {
      totalRow.getCell(column).numFmt = MONEY_FORMAT;
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Собрать и отдать файл браузеру. Имя — «Все приёмы 2026-08.xlsx». */
export async function exportRegistry(
  input: RegistryExportInput,
  fileName: string,
): Promise<void> {
  downloadBlob(await buildRegistryXlsx(input), fileName);
}
