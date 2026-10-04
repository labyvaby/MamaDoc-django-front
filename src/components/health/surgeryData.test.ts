import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import type { Surgery } from "../../api/health";
import {
  anesthesiaSummary,
  autoTitle,
  buildSurgeryPayload,
  cleanSurgeryForm,
  emptySurgeryForm,
  injuriesHint,
  injuriesInLastYear,
  injuryTitle,
  recentTransfusion,
  surgeryDetailsLine,
  surgeryFormProblem,
  surgeryToForm,
  transfusionLead,
  transfusionTitle,
} from "./surgeryData";

const TODAY = dayjs("2026-10-04");

let nextId = 1;
const surgery = (overrides: Partial<Surgery> = {}): Surgery => ({
  id: nextId++,
  kind: "operation",
  status: "recorded",
  performedOn: "2025-11-14",
  datePrecision: "day",
  title: "Грыжесечение паховой грыжи справа",
  injuryType: "",
  bodyPart: "",
  side: "",
  treatments: [],
  transfusionProduct: "",
  reason: "",
  facility: "",
  surgeon: "",
  anesthesia: "",
  anesthesiaTolerance: "",
  anesthesiaNotes: "",
  complications: "",
  outcome: "",
  hospitalizationId: null,
  hospitalization: null,
  attachments: [],
  notes: "",
  createdAt: "",
  updatedAt: "",
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

describe("строка наркоза", () => {
  it("is absent without general anesthesia or sedation", () => {
    expect(anesthesiaSummary([])).toBeNull();
    expect(anesthesiaSummary([surgery({ anesthesia: "local", anesthesiaTolerance: "good" })])).toBeNull();
    expect(anesthesiaSummary([surgery({ anesthesia: "general", anesthesiaTolerance: "good", status: "refuted" })])).toBeNull();
  });

  it("counts general anesthesia and sedation separately", () => {
    expect(anesthesiaSummary([surgery({ anesthesia: "general", anesthesiaTolerance: "good" })])).toEqual({
      text: "Наркоз: общий — 1 раз, без осложнений",
      danger: false,
    });
    expect(
      anesthesiaSummary([
        surgery({ anesthesia: "general", anesthesiaTolerance: "good" }),
        surgery({ anesthesia: "general", anesthesiaTolerance: "good" }),
        surgery({ anesthesia: "sedation", anesthesiaTolerance: "good" }),
      ])?.text,
    ).toBe("Наркоз: общий — 2 раза, седация — 1 раз, без осложнений");
  });

  it("says when tolerance is not recorded", () => {
    expect(anesthesiaSummary([surgery({ anesthesia: "sedation" })])?.text).toBe("Наркоз: седация — 1 раз, как перенёс — не указано");
  });

  it("shows complications in red with the date and description of the latest one", () => {
    const result = anesthesiaSummary([
      surgery({ anesthesia: "general", anesthesiaTolerance: "good" }),
      surgery({ anesthesia: "general", anesthesiaTolerance: "complications", anesthesiaNotes: "ларингоспазм", performedOn: "2026-05-12" }),
    ]);
    expect(result).toEqual({ text: "Наркоз: были осложнения (12.05.2026) — ларингоспазм", danger: true });
  });
});

describe("подсказки о травмах и переливании", () => {
  const injury = (performedOn: string, datePrecision: Surgery["datePrecision"] = "day") =>
    surgery({ kind: "injury", injuryType: "bruise", performedOn, datePrecision });

  it("counts injuries for 12 months and hints from the third", () => {
    const two = [injury("2026-07-18"), injury("2026-02-01", "month")];
    expect(injuriesInLastYear(two, TODAY)).toBe(2);
    expect(injuriesHint(two, TODAY)).toBeNull();
    const three = [...two, injury("2025-10-04")];
    expect(injuriesHint(three, TODAY)).toBe("3 травмы за 12 месяцев — поговорите с родителями о безопасности дома и на прогулке");
    // День раньше окна, «только год» и ошибочно внесённая не считаются.
    expect(injuriesInLastYear([injury("2025-10-03"), injury("2026-01-01", "year"), { ...injury("2026-05-01"), status: "refuted" }], TODAY)).toBe(0);
  });

  it("hints about live vaccines within 11 months of a transfusion", () => {
    const recent = surgery({ kind: "transfusion", transfusionProduct: "immunoglobulin", title: "Введение иммуноглобулина", performedOn: "2025-11-04" });
    expect(recentTransfusion([recent], TODAY)).toBe(recent);
    expect(transfusionLead(recent)).toBe("Введение иммуноглобулина 04.11.2025");
    expect(recentTransfusion([{ ...recent, performedOn: "2025-11-03" }], TODAY)).toBeNull();
    // «Месяц» — по последнему дню месяца: подсказка лучше лишний раз.
    expect(recentTransfusion([{ ...recent, performedOn: "2025-10-01", datePrecision: "month" }], TODAY)).toBeNull();
    expect(recentTransfusion([{ ...recent, performedOn: "2025-11-01", datePrecision: "month" }], TODAY)).not.toBeNull();
    expect(recentTransfusion([{ ...recent, status: "refuted" }], TODAY)).toBeNull();
  });
});

describe("названия и форма", () => {
  it("composes injury and transfusion titles", () => {
    expect(injuryTitle("fracture", "Предплечье", "left")).toBe("Перелом — предплечье, слева");
    expect(injuryTitle("wound", "Подбородок", "")).toBe("Рана — подбородок");
    expect(injuryTitle("concussion", "", "")).toBe("Сотрясение");
    expect(transfusionTitle("red_cells")).toBe("Переливание эритроцитной массы");
    expect(transfusionTitle("immunoglobulin")).toBe("Введение иммуноглобулина");
    expect(autoTitle({ ...emptySurgeryForm("operation"), injuryType: "bruise" })).toBe("");
  });

  it("clears the fields of another kind on save", () => {
    const form = {
      ...emptySurgeryForm("injury"),
      injuryType: "fracture" as const,
      treatments: ["cast" as const],
      transfusionProduct: "plasma" as const,
      anesthesia: "none" as const,
      anesthesiaTolerance: "complications" as const,
      anesthesiaNotes: "что-то",
    };
    expect(cleanSurgeryForm(form)).toMatchObject({
      injuryType: "fracture",
      treatments: ["cast"],
      transfusionProduct: "",
      anesthesiaTolerance: "",
      anesthesiaNotes: "",
    });
    const asOperation = cleanSurgeryForm({ ...form, kind: "operation" });
    expect(asOperation).toMatchObject({ injuryType: "", treatments: [] });
    const asTransfusion = cleanSurgeryForm({ ...form, kind: "transfusion", anesthesia: "general" });
    expect(asTransfusion).toMatchObject({ transfusionProduct: "plasma", anesthesia: "", injuryType: "" });
  });

  it("explains why the record cannot be saved yet", () => {
    const injury = emptySurgeryForm("injury");
    expect(surgeryFormProblem(injury, "2025-03-26", TODAY)).toBe("Укажите вид травмы");
    expect(surgeryFormProblem({ ...injury, injuryType: "wound" }, "2025-03-26", TODAY)).toBe("Укажите дату");
    expect(surgeryFormProblem({ ...injury, injuryType: "wound", performedOn: "2025-03-01" }, "2025-03-26", TODAY)).toBe("Дата раньше рождения");
    expect(surgeryFormProblem({ ...injury, injuryType: "wound", performedOn: "2026-07-18" }, "2025-03-26", TODAY)).toBeNull();
    expect(surgeryFormProblem({ ...emptySurgeryForm("operation"), performedOn: "2025-11-14" }, null, TODAY)).toBe("Укажите, что сделали");
    expect(surgeryFormProblem(emptySurgeryForm("transfusion"), null, TODAY)).toBe("Укажите, что переливали");
    expect(
      surgeryFormProblem(
        { ...emptySurgeryForm("operation"), title: "Аденотомия", performedOn: "2025-11-14", anesthesia: "general", anesthesiaTolerance: "complications" },
        null,
        TODAY,
      ),
    ).toBe("Опишите осложнение наркоза");
  });

  it("sends only filled fields on create and clears with null on update", () => {
    const form = {
      ...emptySurgeryForm("injury"),
      injuryType: "wound" as const,
      bodyPart: "Подбородок",
      performedOn: "2026-07-18",
      treatments: ["sutures" as const],
      anesthesia: "local" as const,
      anesthesiaTolerance: "good" as const,
      facility: " Травмпункт ",
      outcome: "recovered" as const,
    };
    expect(buildSurgeryPayload(form, "create")).toEqual({
      kind: "injury",
      performedOn: "2026-07-18",
      datePrecision: "day",
      title: "Рана — подбородок",
      injuryType: "wound",
      anesthesia: "local",
      anesthesiaTolerance: "good",
      outcome: "recovered",
      bodyPart: "Подбородок",
      facility: "Травмпункт",
      treatments: ["sutures"],
    });
    const update = buildSurgeryPayload({ ...form, kind: "operation", title: "ПХО раны подбородка", performedOn: "2026-07-20", datePrecision: "month" }, "update");
    expect(update).toMatchObject({
      kind: "operation",
      status: "recorded",
      performedOn: "2026-07-01",
      title: "ПХО раны подбородка",
      injuryType: null,
      side: null,
      transfusionProduct: null,
      treatments: [],
      surgeon: "",
      hospitalizationId: null,
      attachments: [],
    });
  });

  it("round-trips a saved record and writes its details line", () => {
    const saved = surgery({
      facility: "Городская детская больница",
      anesthesia: "general",
      anesthesiaTolerance: "good",
      outcome: "recovered",
      hospitalization: { id: 3, facility: "ГДБ", admittedOn: "2025-11-14", dischargedOn: "2025-11-15" },
      attachments: [
        { url: "/media/a.jpg", name: "Выписка.jpg", kind: "discharge" },
        { url: "/media/b.jpg", name: "Снимок.jpg", kind: "image" },
      ],
    });
    expect(surgeryToForm(saved)).toMatchObject({ kind: "operation", anesthesia: "general", attachments: saved.attachments });
    expect(surgeryDetailsLine(saved)).toBe(
      "Городская детская больница · общий наркоз, без осложнений · выздоровление · стационар 14–15.11.2025 · выписка, снимок (2)",
    );
    expect(surgeryDetailsLine(surgery({ kind: "transfusion", complications: "озноб" }))).toBe("реакция: озноб");
  });
});
