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
  ticketBase64: "VElDS0VU",
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
    expect(printouts.ticket).toContain("data:image/png;base64,VElDS0VU");
    expect(printouts.preparation).toContain("Натощак 8 часов");
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
