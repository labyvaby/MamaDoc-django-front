import { describe, expect, it } from "vitest";

import { pdfFileName } from "./pdfLayout";

describe("pdfFileName", () => {
  it("склеивает префикс и ФИО без пробелов и всегда даёт .pdf", () => {
    // Расширение критично: Android определяет тип файла по имени, и без .pdf
    // документ скачивался как «6583c625-…» без возможности открыть.
    expect(pdfFileName("conclusion", "Генералова Полина")).toBe(
      "conclusion_Генералова_Полина.pdf",
    );
  });

  it("схлопывает подряд идущие пробелы и обрезает края", () => {
    expect(pdfFileName("certificate", "  Иван   Петров  ")).toBe(
      "certificate_Иван_Петров.pdf",
    );
  });

  it("подставляет document, если ФИО пустое", () => {
    expect(pdfFileName("conclusion", "")).toBe("conclusion_document.pdf");
    expect(pdfFileName("conclusion", "   ")).toBe("conclusion_document.pdf");
  });
});
