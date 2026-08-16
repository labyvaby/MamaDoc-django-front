import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { buildPayrollStatementXlsx } from "./buildPayrollStatementXlsx";

async function readBack(blob: Blob): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook.worksheets[0];
}

/**
 * Файл уходит в банк, поэтому важны две вещи: колонки совпадают с бумажным
 * образцом бухгалтерии и номер счёта остаётся текстом (иначе Excel показывает
 * 16 цифр как 1,24207E+15 и обрезает ведущие нули).
 */
describe("buildPayrollStatementXlsx", () => {
  it("собирает шапку, строки и подпись исполнителя", async () => {
    const sheet = await readBack(
      await buildPayrollStatementXlsx({
        rows: [
          {
            fullName: "Шералиева Бермет Озубековна",
            accountNumber: "1242070069056142",
            amount: 10000,
            workDays: 10,
            employmentType: "Полный",
          },
          {
            fullName: "Кулушова Адинай",
            accountNumber: "",
            amount: 20000.5,
            workDays: null,
            employmentType: "По совместительству",
          },
        ],
        executorName: "Исаева Айсулуу Камиловна",
      }),
    );

    expect(sheet.getCell("A1").value).toBe("Детали платежа");
    // C2 повторяет B2: exceljs отдаёт объединённой ячейке значение мастера.
    expect(sheet.getRow(2).values).toEqual([
      undefined,
      "№",
      "ФИО",
      "ФИО",
      "Номер карты/Счета",
      "Сумма",
      "Рабочих дней",
      "Статус операции",
    ]);

    expect(sheet.getCell("A3").value).toBe(1);
    expect(sheet.getCell("B3").value).toBe("Шералиева Бермет Озубековна");
    expect(sheet.getCell("D3").value).toBe("1242070069056142");
    expect(sheet.getCell("D3").numFmt).toBe("@");
    expect(sheet.getCell("E3").value).toBe(10000);
    expect(sheet.getCell("F3").value).toBe(10);
    expect(sheet.getCell("G3").value).toBe("Полный");

    // Незаполненный счёт и несчитанные дни остаются пустыми ячейками.
    expect(sheet.getCell("D4").value).toBe("");
    expect(sheet.getCell("F4").value).toBeNull();
    expect(sheet.getCell("E4").value).toBe(20000.5);

    // Подпись — через пустую строку после таблицы.
    expect(sheet.getCell("A6").value).toBe("Исполнитель:");
    expect(sheet.getCell("B6").value).toBe("Исаева Айсулуу Камиловна");
  });

  it("не падает на пустом списке", async () => {
    const sheet = await readBack(
      await buildPayrollStatementXlsx({ rows: [], executorName: "" }),
    );

    expect(sheet.getCell("A1").value).toBe("Детали платежа");
  });
});
