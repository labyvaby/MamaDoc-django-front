import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { EMPTY_REQUISITES } from "../../../api/organization";
import { makeReport } from "../fixture";
import { buildForm2Xlsx, rowHeight } from "./buildForm2Xlsx";

async function readBack(blob: Blob): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook.worksheets[0];
}

describe("buildForm2Xlsx", () => {
  it("шапка, реквизиты, суммы и формулы", async () => {
    const sheet = await readBack(await buildForm2Xlsx({
      report: makeReport(),
      organizationName: "Мама Доктор",
      requisites: {
        ...EMPTY_REQUISITES, okpo: "31157422", inn: "00807202110267", directorName: "Сейдалиев К. Т.",
        chiefAccountantName: "Иванова А.", chiefAccountantPhone: "+996 555 000 111",
      },
      from: dayjs("2026-01-01"),
      to: dayjs("2026-02-28"),
    }));
    expect(sheet.getCell("M1").value).toBe("Форма №2");
    expect(sheet.getCell("A7").value).toBe("2026-жылдын 1-январынан 28-февралына чейин");
    expect(sheet.getCell("A8").value).toBe("ТҮШКӨН ПАЙДА ЖАНА ЗЫЯН ЖӨНҮНДӨГҮ ОТЧЕТ");
    expect(sheet.getCell("A11").value).toBe("за период с 1 января 2026 г. по 28 февраля 2026 г.");
    expect(sheet.getCell("L15").value).toBe("7100012");
    expect(sheet.getCell("L17").value).toBe("31157422");
    expect(sheet.getCell("D17").value).toBe("Мама Доктор");
    expect(sheet.getCell("D29").value).toBe("Сом");
    expect(sheet.getCell("D32").value).toBe("00807202110267");
    expect(sheet.getCell("G40").value).toBe("Иванова А., +996 555 000 111");
    expect(sheet.getCell("G44").value).toBe("Өткөн мезгил / За аналогичный период прошлого года");
    expect(sheet.getCell("F47").value).toBe("010");
    expect(sheet.getCell("I47").value).toBe(2200);
    expect(sheet.getCell("G47").value).toBe(2000);
    expect(sheet.getCell("I49").value).toMatchObject({ formula: "I47-I48", result: 1980 });
    expect(sheet.getCell("G73").value).toMatchObject({ formula: "G71+G72" });
    expect(sheet.getCell("B57").value).toBe("Амортизация");
    expect(sheet.getCell("B75").value).toBe("Руководитель  _____________________  Сейдалиев К. Т.");
    // Без явного вида листа Excel игнорирует высоту строк — длинные названия обрезаются.
    expect(sheet.views).toHaveLength(1);
    expect(sheet.getRow(66).height).toBeGreaterThan(sheet.getRow(55).height ?? 0);
  });

  it("высота строки растёт с длиной названия", () => {
    expect(rowHeight("Короткое", "Короткое")).toBe(15);
    expect(rowHeight("x".repeat(95), "y".repeat(40))).toBe(41);
  });

  it("целый год — заголовки как в бланке; юр. название из реквизитов", async () => {
    const sheet = await readBack(await buildForm2Xlsx({
      report: makeReport({ compare: null }),
      organizationName: "Org",
      requisites: { ...EMPTY_REQUISITES, legalName: "ОсОО «Мама Доктор»" },
      from: dayjs("2026-01-01"),
      to: dayjs("2026-12-31"),
    }));
    expect(sheet.getCell("G44").value).toBe("Өткөн жыл / За предыдущий год");
    expect(sheet.getCell("I44").value).toBe("Отчеттук жыл / За отчетный год");
    expect(sheet.getCell("G47").value).toBe(0);
    expect(sheet.getCell("D17").value).toBe("ОсОО «Мама Доктор»");
  });
});
