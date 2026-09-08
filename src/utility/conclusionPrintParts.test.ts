import { describe, expect, it } from "vitest";

import {
  buildConclusionPrintParts,
  formatDiagnoses,
  type ConclusionColumns,
} from "./conclusionPrintParts";
import type { FormField, FormFieldSlot, FormTarget } from "../api/conclusionForms";

const columns: ConclusionColumns = {
  heightCm: "103",
  weightKg: "17",
  temperature: "36.6",
  complaints: "кашель",
  diagnosis: "A00 - Холера",
  anamnesis: "болеет 3 дня",
  objective: "Кожные покровы: чистые",
  conclusion: "наблюдение",
};

const field = (id: string, slot?: FormFieldSlot): FormField => ({
  id,
  label: id,
  type: "text",
  ...(slot ? { slot } : {}),
});

const parts = (fields: FormField[], target: FormTarget, manual = "") =>
  buildConclusionPrintParts({
    template: { fields, target },
    formValues: Object.fromEntries(fields.map((f) => [f.id, `набрано ${f.id}`])),
    manual,
    columns,
  });

describe("buildConclusionPrintParts — что печатает лист", () => {
  it("привязанное поле показывает значение колонки, а не набранное в бланке", () => {
    const { sheetValues } = parts([field("f1", "diagnosis")], "objective");
    expect(sheetValues.f1).toBe("A00 - Холера");
  });

  it("свободное поле печатает то, что набрал врач", () => {
    const { sheetValues } = parts([field("f1")], "objective");
    expect(sheetValues.f1).toBe("набрано f1");
  });
});

describe("buildConclusionPrintParts — что уходит в хвост", () => {
  it("колонка без бланка допечатывается — иначе диагноз не попадал на бумагу", () => {
    // Реальная жалоба 08.09.2026: бланк без строки диагноза печатался без него.
    const { trailer } = parts([field("f1")], "objective");
    expect(trailer.diagnosis).toBe("A00 - Холера");
    expect(trailer.conclusion).toBe("наблюдение");
  });

  it("привязанная слотом колонка в хвост не идёт — она уже строкой на листе", () => {
    const { trailer } = parts([field("f1", "diagnosis")], "objective");
    expect(trailer.diagnosis).toBeUndefined();
  });

  it("колонка-цель бланка в хвост не идёт — её строки уже напечатаны листом", () => {
    // Второй баг того же дня: «Объективно» печаталось дважды — строками
    // бланка и тем же текстом одним блоком в хвосте.
    const { trailer } = parts([field("f1")], "objective");
    expect(trailer.objective).toBeUndefined();
  });

  it("ручной хвост врача печатается, хотя колонка-цель покрыта листом", () => {
    // Дописанное врачом под строками бланка не представлено ни одной строкой
    // листа — без этого оно не попадало на бумагу вообще.
    const { trailer } = parts([field("f1")], "objective", "дополнительно: осмотрен ЛОРом");
    expect(trailer.objective).toBe("дополнительно: осмотрен ЛОРом");
  });

  it("пустой ручной хвост не превращается в пустую графу", () => {
    const { trailer } = parts([field("f1")], "objective", "   ");
    expect(trailer.objective).toBeUndefined();
  });

  it("показатели допечатываются, пока бланк не забрал их себе", () => {
    expect(parts([field("f1")], "objective").trailer.weightKg).toBe("17");
    expect(parts([field("f1", "weightKg")], "objective").trailer.weightKg).toBeUndefined();
  });

  it("бланк, забравший всё, оставляет хвост пустым — лишней страницы не будет", () => {
    const fields = [
      field("a", "heightCm"),
      field("b", "weightKg"),
      field("c", "temperature"),
      field("d", "complaints"),
      field("e", "diagnosis"),
      field("f", "anamnesis"),
      field("g", "conclusion"),
    ];
    expect(parts(fields, "objective").trailer).toEqual({});
  });
});

describe("formatDiagnoses", () => {
  it("название для пациента важнее кода", () => {
    expect(
      formatDiagnoses([{ diagnosisCode: "A00", title: "Холера", displayName: "Кишечная инфекция" }]),
    ).toBe("Кишечная инфекция");
  });

  it("без названия для пациента печатает код и диагноз", () => {
    expect(formatDiagnoses([{ diagnosisCode: "A00", title: "Холера" }])).toBe("A00 - Холера");
  });

  it("диагноз без кода — врач вписал его руками", () => {
    expect(formatDiagnoses([{ title: "ОРВИ" }])).toBe("ОРВИ");
  });

  it("несколько диагнозов разделяются точкой с запятой", () => {
    expect(formatDiagnoses([{ title: "ОРВИ" }, { diagnosisCode: "J06", title: "ОРИ" }])).toBe(
      "ОРВИ; J06 - ОРИ",
    );
  });
});
