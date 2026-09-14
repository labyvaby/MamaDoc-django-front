import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { isAiUnavailableError, normalizeAiSuggestion } from "./medical";

/**
 * Ответ AI-помощника — предложение рядом с полем, и показывать его есть
 * смысл только когда там есть текст. Гайд (13.09.2026) прямо просит не
 * полагаться на точное `""`: модель может вернуть пробелы или заглушку вроде
 * «данных не предоставлено», когда ей не на что опереться.
 */
describe("normalizeAiSuggestion", () => {
  it("берёт текст первого предложения и обрезает пробелы", () => {
    expect(
      normalizeAiSuggestion({
        suggestions: [
          { text: "  Жалуется на боль в горле.\n", confidence: 0.75 },
          { text: "второй вариант" },
        ],
      }),
    ).toBe("Жалуется на боль в горле.");
  });

  it("возвращает null для пустого ответа и одних пробелов", () => {
    expect(normalizeAiSuggestion({ suggestions: [] })).toBeNull();
    expect(normalizeAiSuggestion({ suggestions: [{ text: "" }] })).toBeNull();
    expect(normalizeAiSuggestion({ suggestions: [{ text: " \n\t " }] })).toBeNull();
    expect(normalizeAiSuggestion({ suggestions: [{ text: null }] })).toBeNull();
    expect(normalizeAiSuggestion({})).toBeNull();
    expect(normalizeAiSuggestion(null)).toBeNull();
  });

  it("не показывает заглушку модели как предложение", () => {
    for (const text of [
      "Данных не предоставлено.",
      "данные не предоставлены",
      "Нет данных",
      "Недостаточно данных.",
      "«Информация отсутствует»",
      "N/A",
      "—",
    ]) {
      expect(normalizeAiSuggestion({ suggestions: [{ text }] }), text).toBeNull();
    }
  });

  it("не режет нормальный текст, в котором заглушка — часть фразы", () => {
    const text = "Анамнез: данных о хронических заболеваниях не предоставлено, аллергии отрицает.";
    expect(normalizeAiSuggestion({ suggestions: [{ text }] })).toBe(text);
  });
});

describe("isAiUnavailableError", () => {
  it("502–504 — «AI временно недоступен», остальное — обычная ошибка", () => {
    expect(isAiUnavailableError(new ApiError("bad gateway", 502, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("unavailable", 503, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("timeout", 504, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("forbidden", 403, null))).toBe(false);
    expect(isAiUnavailableError(new ApiError("server", 500, null))).toBe(false);
    expect(isAiUnavailableError(new Error("network"))).toBe(false);
  });
});
