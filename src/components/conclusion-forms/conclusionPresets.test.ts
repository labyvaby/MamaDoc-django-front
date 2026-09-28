import { describe, expect, it } from "vitest";

import {
  historyDiagnoses,
  mergeManual,
  planPresetTexts,
  presetFormValues,
  summarizeProgress,
} from "./conclusionPresets";

describe("planPresetTexts", () => {
  const all = () => true;

  it("без бланка кладёт каждую колонку в своё поле", () => {
    expect(
      planPresetTexts({
        texts: { complaints: "кашель", objective: "зев чистый", conclusion: "здоров" },
        formTarget: null,
        visible: () => false,
      }),
    ).toEqual({
      set: { complaints: "кашель", objective: "зев чистый", conclusion: "здоров" },
      manual: [],
    });
  });

  // Регрессия 28.09.2026: текст шаблона ложился в колонку, которую собирает
  // бланк, и пропадал при первой правке строки.
  it("колонку, которую собирает бланк, уводит в «Дополнительно»", () => {
    const plan = planPresetTexts({
      texts: { conclusion: "ОРВИ, лёгкое течение", objective: "зев гиперемирован" },
      formTarget: "conclusion",
      visible: all,
    });
    expect(plan.set).toEqual({ objective: "зев гиперемирован" });
    expect(plan.manual).toEqual(["ОРВИ, лёгкое течение"]);
  });

  it("спрятанную бланком колонку не теряет", () => {
    const plan = planPresetTexts({
      texts: { anamnesis: "болеет 3 дня" },
      formTarget: "conclusion",
      visible: (column) => column !== "anamnesis",
    });
    expect(plan.set).toEqual({});
    expect(plan.manual).toEqual(["болеет 3 дня"]);
  });

  it("пустые и пробельные тексты пропускает", () => {
    expect(
      planPresetTexts({ texts: { anamnesis: "  ", objective: null }, formTarget: null, visible: all }),
    ).toEqual({ set: {}, manual: [] });
  });
});

describe("presetFormValues", () => {
  const fields = [{ id: "skin" }, { id: "throat" }, { id: "heart" }];
  const defaults = { skin: "чистые", throat: "спокоен", heart: "тоны ясные" };

  it("значения заготовки поверх норм, пустое не стирает норму", () => {
    expect(presetFormValues(fields, defaults, { throat: "гиперемия", heart: "" })).toEqual({
      skin: "чистые",
      throat: "гиперемия",
      heart: "тоны ясные",
    });
  });

  it("строки, которых в бланке уже нет, отбрасывает", () => {
    expect(presetFormValues([{ id: "skin" }], defaults, { gone: "x", skin: "сыпь" })).toEqual({
      skin: "сыпь",
    });
  });
});

describe("mergeManual", () => {
  it("склеивает через пустую строку и не удваивает повторное применение", () => {
    expect(mergeManual("Режим дома", "Обильное питьё", "Режим дома", "")).toBe(
      "Режим дома\n\nОбильное питьё",
    );
  });
});

describe("summarizeProgress", () => {
  it("отделяет нетронутую норму от заполненного", () => {
    expect(
      summarizeProgress([
        { id: "a", value: "", defaultValue: "" },
        { id: "b", value: "норма", defaultValue: "норма" },
        { id: "c", value: "своё", defaultValue: "норма" },
        { id: "d", value: "текст" },
        { id: "e", value: " ", defaultValue: "норма" },
      ]),
    ).toEqual({ total: 5, filled: 2, norm: 1, firstEmpty: "a", firstNorm: "b" });
  });

  it("норма с пробелами по краям — всё ещё норма", () => {
    expect(summarizeProgress([{ id: "a", value: "норма \n", defaultValue: "\nнорма" }]).norm).toBe(1);
  });
});

describe("historyDiagnoses", () => {
  const history = [
    { diagnosisData: [{ diagnosis_code: "J06.9", title: "ОРВИ" }, { title: "без кода" }] },
    { diagnosisData: [{ diagnosis_code: "j06.9", title: "ОРВИ повтор" }, { diagnosisCode: "Z00.1", title: "Осмотр" }] },
  ];

  it("новые сверху, без повторов по коду и без записей без кода", () => {
    expect(historyDiagnoses(history, [])).toEqual([
      { code: "J06.9", title: "ОРВИ" },
      { code: "Z00.1", title: "Осмотр" },
    ]);
  });

  it("уже выбранные не предлагает, лимит соблюдает", () => {
    expect(historyDiagnoses(history, ["J06.9"])).toEqual([{ code: "Z00.1", title: "Осмотр" }]);
    expect(historyDiagnoses(history, [], 1)).toHaveLength(1);
  });
});
