import { describe, it, expect } from "vitest";

import { buildLabIntakePrintouts } from "./labIntakePrint";
import type { LabReceipt } from "../api/lab";

const receipt = (over: Partial<LabReceipt["order"]> = {}): LabReceipt => ({
  order: {
    id: 501,
    patientId: 9622,
    patientName: "Иванова Мария Петровна",
    branchName: "Центральный",
    status: "dispatched",
    totalAmount: "250.00",
    lisOrderCode: 777,
    titles: ["Глюкоза"],
    createdAt: "2026-09-09T09:00:00+06:00",
    ...over,
  },
  barcodeBase64: "QkFSQ09ERQ==",
  // Префикс настоящей PNG: печать регистрационного листа возможна только
  // для картинки, а ЛИС сегодня присылает под этим полем JasperPrint.
  ticketBase64: "iVBORw0KGgoTICKET",
});

describe("buildLabIntakePrintouts", () => {
  it("собирает все три формы разом", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt(),
      patientName: "Иванова Мария Петровна",
      patientBirthDate: "1990-05-17",
      preparationTexts: ["Натощак 8 часов"],
    });
    expect(printouts.labels).toContain("data:image/png;base64,QkFSQ09ERQ==");
    expect(printouts.labels).toContain("Иванова Мария Петровна");
    expect(printouts.labels).toContain("17.05.1990");
    expect(printouts.labels).toContain("777");
    expect(printouts.ticket).toContain("data:image/png;base64,iVBORw0KGgoTICKET");
    expect(printouts.preparation).toContain("Натощак 8 часов");
  });

  it("не картинка под регистрационным листом — печатать нечего", () => {
    // Ровно то, что живая ЛИС присылает сегодня: сериализованный
    // Java-объект JasperPrint вместо PNG (находка 17). Вставить его в
    // data:image нельзя, и лист напечатался бы битым — поэтому вместо
    // готового HTML возвращается null, а кнопка печати гаснет.
    const printouts = buildLabIntakePrintouts({
      receipt: { ...receipt(), ticketBase64: "rO0ABXNyACduZXQuc2Yu" },
      patientName: "Петров Иван",
      patientBirthDate: "1990-05-17",
      preparationTexts: [],
    });
    expect(printouts.ticket).toBeNull();
    // Этикетки и памятка от этого не страдают — они не про ЛИС-картинку.
    expect(printouts.labels).toContain("data:image/png;base64,QkFSQ09ERQ==");
  });

  it("дата рождения приходит в формате ISO из карты, а печатается по-русски", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt(),
      patientName: "Петров Иван",
      patientBirthDate: "2001-12-03",
      preparationTexts: [],
    });
    expect(printouts.labels).toContain("03.12.2001");
    expect(printouts.labels).not.toContain("2001-12-03");
  });

  it("нет даты рождения — пустая строка, а не мусор", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt(),
      patientName: "Петров Иван",
      patientBirthDate: null,
      preparationTexts: [],
    });
    expect(printouts.labels).not.toContain("null");
    expect(printouts.labels).not.toContain("undefined");
    expect(printouts.labels).not.toContain("Invalid Date");
  });

  it("нет номера заказа в ЛИС — прочерк", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt({ lisOrderCode: null }),
      patientName: "Петров Иван",
      patientBirthDate: "1990-05-17",
      preparationTexts: [],
    });
    expect(printouts.labels).toContain("Заказ: —");
  });

  it("пустой список подготовки печатает заглушку, а не пустой лист", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt(),
      patientName: "Петров Иван",
      patientBirthDate: "1990-05-17",
      preparationTexts: [],
    });
    expect(printouts.preparation).toContain("Особой подготовки не требуется");
  });

  it("этикетки и регистрационный лист используют разные картинки из ЛИС", () => {
    const printouts = buildLabIntakePrintouts({
      receipt: receipt(),
      patientName: "Петров Иван",
      patientBirthDate: "1990-05-17",
      preparationTexts: [],
    });
    // Штрихкод в регистрационный лист не подмешивается, а лист — в этикетки.
    expect(printouts.labels).not.toContain("data:image/png;base64,VElDS0VU");
    expect(printouts.ticket).not.toContain("data:image/png;base64,QkFSQ09ERQ==");
  });
});
