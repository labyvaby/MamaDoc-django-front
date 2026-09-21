import { describe, expect, it } from "vitest";

import {
  buildRegistrationSheetHtml,
  registrationSheetTotals,
  type RegistrationSheetData,
} from "./labRegistrationSheet";

const data = (over: Partial<RegistrationSheetData> = {}): RegistrationSheetData => ({
  clinicName: "Мама Доктор",
  branchName: "Центральный",
  patientName: "Мыктыбаева Мадина",
  birthDate: "2001-09-24",
  gender: "female",
  registeredAt: "2026-07-06T09:14:00+06:00",
  regCode: 23456,
  referringDoctorName: "",
  lines: [
    { id: 1, testId: 10, titleSnapshot: "Общий анализ мочи (ОАМ)", price: "400.00", countItem: 1, isExpress: false, isBroughtIn: false },
    { id: 2, testId: 11, titleSnapshot: "Мазок на флору (УГИ) жен.", price: "400.00", countItem: 1, isExpress: false, isBroughtIn: false },
  ],
  instruments: [
    { id: 5, instrumentId: 7, titleSnapshot: "Забор биоматериала", price: "200.00", count: 1 },
  ],
  answers: [],
  discountPercent: 0,
  totalAmount: 1000,
  paidAmount: 1000,
  maxRequiredDays: 0,
  barcodeBase64: "iVBORw0KGgoBARCODE",
  withPrices: true,
  ...over,
});

describe("registrationSheetTotals", () => {
  it("расходники вошли в итог — печатаются с ценой", () => {
    const totals = registrationSheetTotals(data());
    expect(totals).toEqual({
      testsGross: 800,
      discount: 0,
      instrumentsTotal: 200,
      instrumentsCharged: true,
      total: 1000,
      paid: 1000,
      debt: 0,
    });
  });

  it("организация расходники не берёт — итог без них, цена по ним не печатается", () => {
    const totals = registrationSheetTotals(data({ totalAmount: 800, paidAmount: 800 }));
    expect(totals.instrumentsCharged).toBe(false);
    expect(buildRegistrationSheetHtml(data({ totalAmount: 800, paidAmount: 800 }))).not.toContain(
      "Расходные материалы",
    );
  });

  it("скидка считается от анализов, долг — от итога", () => {
    const totals = registrationSheetTotals(
      data({ discountPercent: 10, totalAmount: 920, paidAmount: 500 }),
    );
    expect(totals.discount).toBe(80);
    expect(totals.instrumentsCharged).toBe(true);
    expect(totals.debt).toBe(420);
  });

  it("скидка на ровной половине тыйына округляется как Decimal ROUND_HALF_UP у бэкенда", () => {
    // 1.45 × 10 % = 0.145: float даёт 0.14, бэкенд — 0.15; итог бэкенда с
    // расходниками = 1.45 − 0.15 + 200 = 201.30, и расходники обязаны
    // остаться «взятыми», а не выпасть из-за тыйына.
    const line = data().lines[0];
    const totals = registrationSheetTotals(
      data({
        lines: [{ ...line, price: "1.45" }],
        discountPercent: 10,
        totalAmount: 201.3,
        paidAmount: 201.3,
      }),
    );
    expect(totals.discount).toBe(0.15);
    expect(totals.instrumentsCharged).toBe(true);
  });
});

describe("buildRegistrationSheetHtml", () => {
  it("собирает лист: клиника, пациент, состав, итог, штрихкод и рег. №", () => {
    const html = buildRegistrationSheetHtml(data());
    expect(html).toContain("Мама Доктор");
    expect(html).toContain("Мыктыбаева Мадина");
    expect(html).toContain("24-09-2001");
    expect(html).toContain("А. / Жен.");
    expect(html).toContain("06.07.2026");
    expect(html).toContain("1. Общий анализ мочи (ОАМ)");
    expect(html).toContain("Забор биоматериала / Расходные материалы");
    expect(html).toContain("Сумма итого");
    expect(html).toContain("data:image/png;base64,iVBORw0KGgoBARCODE");
    expect(html).toContain("рег. № <b>23456</b>");
    expect(html).toContain("Дата результата");
    // Талоны: по одному на анализ плюс сводный — три штуки при двух анализах.
    expect(html.match(/class="stub"/g)).toHaveLength(3);
  });

  it("неотправленный заказ — без штрихкода и номера, с пометкой", () => {
    const html = buildRegistrationSheetHtml(data({ regCode: null, barcodeBase64: "" }));
    expect(html).not.toContain("data:image/png");
    expect(html).toContain("рег. № <b>—</b>");
    expect(html).toContain("ещё не передан в лабораторию");
  });

  it("экспресс и приносной помечаются у строки", () => {
    const line = data().lines[0];
    const html = buildRegistrationSheetHtml(
      data({ lines: [{ ...line, isExpress: true, isBroughtIn: true }] }),
    );
    expect(html).toContain('<span class="tag">экспресс</span>');
    expect(html).toContain('<span class="tag">приносной</span>');
  });

  it("срок готовности неизвестен — строки с датой результата нет", () => {
    expect(buildRegistrationSheetHtml(data({ maxRequiredDays: null }))).not.toContain(
      "Дата результата",
    );
  });

  it("экранирует HTML в названиях", () => {
    const line = data().lines[0];
    const html = buildRegistrationSheetHtml(
      data({ lines: [{ ...line, titleSnapshot: "<b>Витамин D</b> & Co" }] }),
    );
    expect(html).toContain("&lt;b&gt;Витамин D&lt;/b&gt; &amp; Co");
  });

  it("без права на финансы — ни колонки «Цена», ни итогов", () => {
    const html = buildRegistrationSheetHtml(data({ withPrices: false }));
    expect(html).not.toContain("цена");
    expect(html).not.toContain("Сумма итого");
    expect(html).toContain("Общий анализ мочи (ОАМ)");
  });
});
