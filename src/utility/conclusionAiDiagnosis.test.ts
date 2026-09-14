import { describe, expect, it, vi } from "vitest";

import type { CatalogDiagnosis } from "../api/medical";
import {
  diagnosesAsText,
  resolveDiagnosesFromText,
  splitDiagnosisText,
} from "./conclusionAiDiagnosis";

const dx = (code: string, title: string, id = 1): CatalogDiagnosis => ({
  id,
  code,
  title,
  displayName: "",
  isActive: true,
  sortOrder: 0,
});

/**
 * Поле диагноза — чипы из каталога, ручка AI — текст. Проекция туда и
 * разбор обратно должны сходиться: код из ответа модели превращается в
 * каталожный чип, произвольный текст — в freeSolo-строку, как если бы врач
 * набрал её сам.
 */
describe("diagnosesAsText", () => {
  it("печатает выбранное так же, как документ: «код название» через «; »", () => {
    expect(
      diagnosesAsText([dx("J02.9", "Острый фарингит неуточнённый"), dx("", "Наблюдение")]),
    ).toBe("J02.9 Острый фарингит неуточнённый; Наблюдение");
    expect(diagnosesAsText([])).toBe("");
  });
});

describe("splitDiagnosisText", () => {
  it("режет по кодам МКБ и снимает подпись «Диагноз:»", () => {
    expect(
      splitDiagnosisText("Диагноз: J02.9 Острый фарингит неуточнённый. J06.9 ОРВИ."),
    ).toEqual([
      { code: "J02.9", text: "J02.9 Острый фарингит неуточнённый" },
      { code: "J06.9", text: "J06.9 ОРВИ" },
    ]);
  });

  it("текст без кодов — один сегмент, пустой — ничего", () => {
    expect(splitDiagnosisText("Острый бронхит.")).toEqual([
      { code: null, text: "Острый бронхит" },
    ]);
    expect(splitDiagnosisText("  ")).toEqual([]);
    expect(splitDiagnosisText("Диагноз: —")).toEqual([]);
  });

  it("текст до первого кода остаётся отдельным диагнозом", () => {
    expect(splitDiagnosisText("Острый бронхит. J20.9 Острый бронхит неуточнённый")).toEqual([
      { code: null, text: "Острый бронхит" },
      { code: "J20.9", text: "J20.9 Острый бронхит неуточнённый" },
    ]);
  });
});

describe("resolveDiagnosesFromText", () => {
  it("код из каталога — каталожный чип, неизвестный — строка с текстом", async () => {
    const lookup = vi.fn(async (code: string) =>
      code === "J02.9" ? [dx("J02", "Острый фарингит", 5), dx("J02.9", "Острый фарингит неуточнённый", 7)] : [],
    );
    const result = await resolveDiagnosesFromText(
      "J02.9 Острый фарингит. Z99.9 Что-то из будущего",
      [],
      lookup,
    );
    expect(result).toEqual([
      dx("J02.9", "Острый фарингит неуточнённый", 7),
      { id: -1, code: "", title: "Z99.9 Что-то из будущего", displayName: "", isActive: true, sortOrder: 0 },
    ]);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("уже выбранный код не ищет заново и не дублирует", async () => {
    const current = [dx("J02.9", "Острый фарингит неуточнённый", 7)];
    const lookup = vi.fn(async () => []);
    const result = await resolveDiagnosesFromText("J02.9 Фарингит; J02.9 Фарингит", current, lookup);
    expect(result).toEqual(current);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ошибка каталога не роняет применение — остаётся строка", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("network");
    });
    const result = await resolveDiagnosesFromText("K29.7 Гастрит", [], lookup);
    expect(result.map((d) => [d.code, d.title])).toEqual([["", "K29.7 Гастрит"]]);
  });
});
