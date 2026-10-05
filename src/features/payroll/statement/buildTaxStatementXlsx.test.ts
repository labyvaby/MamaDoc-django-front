import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import type { PayrollRow } from "../../../api/payroll";
import { buildTaxStatementXlsx, taxStatementRows } from "./buildTaxStatementXlsx";

const row = (overrides: Partial<PayrollRow>): PayrollRow => ({
  employeeId: 1,
  fullName: "Сотрудник",
  clinicalRole: "other",
  roleName: "",
  appointmentsCount: 0,
  distributedAppointments: "0.00",
  createdByCount: 0,
  totalCount: 0,
  waitingCount: 0,
  cancelledCount: 0,
  discountedCount: 0,
  paidCount: 0,
  servicePercentPay: "0.00",
  serviceFixedPay: "0.00",
  appointmentPay: "0.00",
  dayHours: "0.00",
  nightHours: "0.00",
  hourlyPay: "0.00",
  earnings: "0.00",
  advances: "0.00",
  netSalary: "0.00",
  ...overrides,
});

describe("taxStatementRows", () => {
  it("берёт только оформленных и тех, у кого есть налоги", () => {
    const rows = taxStatementRows([
      row({
        fullName: " Айгуль ",
        taxRegime: "employment",
        earnings: "30000.00",
        taxBase: "20000.00",
        incomeTax: "1800.00",
        socialFundEmployee: "2000.00",
        socialFundEmployer: "3450.00",
        netSalary: "26200.00",
      }),
      row({ fullName: "Без оформления", taxRegime: "unofficial", earnings: "5000.00" }),
      row({ fullName: "Старый бэк", earnings: "5000.00" }),
      row({ fullName: "ИП", taxRegime: "patent" }),
    ]);
    expect(rows.map((r) => [r.fullName, r.regime])).toEqual([
      ["Айгуль", "Трудовой договор"],
      ["ИП", "ИП на патенте"],
    ]);
    expect(rows[0].incomeTax).toBe(1800);
    expect(rows[0].socialFundEmployer).toBe(3450);
  });
});

describe("buildTaxStatementXlsx", () => {
  it("строки, итоги и сумма к перечислению", async () => {
    const blob = await buildTaxStatementXlsx({
      monthLabel: "Октябрь 2026",
      rows: taxStatementRows([
        row({
          fullName: "Айгуль",
          taxRegime: "employment",
          earnings: "30000.00",
          taxBase: "20000.00",
          incomeTax: "1800.00",
          socialFundEmployee: "2000.00",
          socialFundEmployer: "3450.00",
          netSalary: "26200.00",
        }),
        row({
          fullName: "Бакыт",
          taxRegime: "civil",
          earnings: "10000.00",
          taxBase: "10000.00",
          incomeTax: "900.00",
          socialFundEmployee: "1000.00",
          socialFundEmployer: "1725.00",
          netSalary: "8100.00",
        }),
      ]),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.worksheets[0];

    expect(String(sheet.getCell("A1").value)).toContain("Октябрь 2026");
    expect(sheet.getCell("B3").value).toBe("ФИО");
    expect(sheet.getCell("B4").value).toBe("Айгуль");
    expect(sheet.getCell("C5").value).toBe("Договор ГПХ");
    expect(sheet.getCell("F4").value).toBe(1800);
    expect(sheet.getCell("F4").numFmt).toBe("#,##0.00");
    // Итоговая строка: ПН 2700, Соцфонд работодателя 5175, к выплате 34300.
    expect(sheet.getCell("B6").value).toBe("Итого");
    expect(sheet.getCell("F6").value).toBe(2700);
    expect(sheet.getCell("H6").value).toBe(5175);
    expect(sheet.getCell("I6").value).toBe(34300);
    // 2700 + 3000 + 5175 — в бюджет и Соцфонд.
    expect(String(sheet.getCell("B8").value)).toContain("10");
    expect(String(sheet.getCell("B8").value)).toContain("875,00");
  });
});
