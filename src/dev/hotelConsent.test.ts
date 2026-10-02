import { describe, expect, it } from "vitest";

import { consentParagraphs, DEFAULT_CONSENT, fromServer, nextConsentVersion, renderConsent } from "./hotelConsent";

describe("renderConsent", () => {
  it("подставляет отель, юрлицо и адрес", () => {
    const text = renderConsent("«{отель}», {юрлицо}, {адрес}. Ещё раз: {отель}", {
      hotel: "Viva",
      legalName: "ОсОО «Вива Отель»",
      address: "г. Бишкек, ул. Токтогула 120",
    });
    expect(text).toBe("«Viva», ОсОО «Вива Отель», г. Бишкек, ул. Токтогула 120. Ещё раз: Viva");
  });

  it("без реквизитов — понятные заглушки, а не пустые места", () => {
    expect(renderConsent("{юрлицо} ({адрес})", { hotel: "Viva", legalName: " ", address: null })).toBe("владельцу отеля «Viva» (указан на ресепшене)");
  });

  it("в стандартном шаблоне не остаётся неподставленных полей", () => {
    expect(renderConsent(DEFAULT_CONSENT.body, { hotel: "Viva" })).not.toMatch(/\{[^}]+\}/);
  });
});

describe("consentParagraphs", () => {
  it("делит по пустой строке и выбрасывает пустые абзацы", () => {
    expect(consentParagraphs("Первый\n\n  Второй  \n \n\n\nТретий\nв две строки")).toEqual(["Первый", "Второй", "Третий\nв две строки"]);
    expect(consentParagraphs(DEFAULT_CONSENT.body)).toHaveLength(6);
  });
});

describe("nextConsentVersion", () => {
  it("растит младший номер", () => {
    expect(nextConsentVersion("1.0")).toBe("1.1");
    expect(nextConsentVersion("1.9")).toBe("1.10");
    expect(nextConsentVersion("2.3 ")).toBe("2.4");
    expect(nextConsentVersion("черновик")).toBe("1.0");
  });
});

describe("fromServer", () => {
  it("своя редакция сервера — как есть, без своей — стандартный шаблон с версией сервера", () => {
    expect(fromServer({ title: "Согласие", body: "Текст", version: "1.4", updatedAt: "2026-10-02T10:00:00+06:00", updatedByName: "Админ" })).toEqual({
      title: "Согласие",
      body: "Текст",
      version: "1.4",
      updatedAt: "2026-10-02T10:00:00+06:00",
    });
    expect(fromServer({ title: null, body: null, version: null, updatedAt: null, updatedByName: "" })).toEqual(DEFAULT_CONSENT);
    expect(fromServer({ title: null, body: " ", version: "1.2", updatedAt: null, updatedByName: "" }).version).toBe("1.2");
  });
});
