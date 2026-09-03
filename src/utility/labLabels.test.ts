import { describe, it, expect } from "vitest";

import {
  buildLabelsHtml,
  buildTicketHtml,
  buildPreparationHtml,
  type LabelData,
} from "./labLabels";

const data: LabelData = {
  patientName: "Иванова Мария Петровна",
  birthDate: "17.05.1990",
  orderCode: 55,
  barcodeBase64: "QkFSQ09ERQ==",
};

describe("buildLabelsHtml", () => {
  it("вставляет штрихкод из ЛИС картинкой", () => {
    const html = buildLabelsHtml(data);
    expect(html).toContain("data:image/png;base64,QkFSQ09ERQ==");
  });

  it("печатает ФИО, дату рождения и номер заказа", () => {
    const html = buildLabelsHtml(data);
    expect(html).toContain("Иванова Мария Петровна");
    expect(html).toContain("17.05.1990");
    expect(html).toContain("55");
  });

  it("экранирует разметку в имени", () => {
    // ФИО приходит из карты пациента, куда его вводит человек. Незакрытый
    // тег в имени сломал бы весь печатный лист.
    const html = buildLabelsHtml({ ...data, patientName: "<b>Х</b> & Y" });
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<b>Х</b>");
  });

  it("без штрихкода не вставляет пустую картинку", () => {
    const html = buildLabelsHtml({ ...data, barcodeBase64: "" });
    expect(html).not.toContain("data:image/png;base64,");
  });

  it("без номера заказа печатает прочерк, а не undefined", () => {
    const html = buildLabelsHtml({ ...data, orderCode: null });
    expect(html).toContain("Заказ: —");
    expect(html).not.toContain("undefined");
  });
});

describe("buildTicketHtml", () => {
  it("вставляет регистрационный лист из ЛИС картинкой", () => {
    const html = buildTicketHtml({ ...data, ticketBase64: "VElDS0VU" });
    expect(html).toContain("data:image/png;base64,VElDS0VU");
  });
});

describe("buildPreparationHtml", () => {
  it("печатает каждый текст отдельным блоком", () => {
    const html = buildPreparationHtml(data, [
      "Натощак 8 часов",
      "Не курить за час",
    ]);
    expect(html).toContain("Натощак 8 часов");
    expect(html).toContain("Не курить за час");
  });

  it("экранирует разметку в тексте подготовки", () => {
    const html = buildPreparationHtml(data, ["<script>x</script>"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("пустой список даёт понятную заглушку, а не пустой лист", () => {
    const html = buildPreparationHtml(data, []);
    expect(html).toContain("Особой подготовки не требуется");
  });
});
