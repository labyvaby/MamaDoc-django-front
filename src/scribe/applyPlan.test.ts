import { describe, expect, it } from "vitest";
import { planScribeApply, type FormSnapshot } from "./applyPlan";

const empty: FormSnapshot = {
  complaints: "",
  anamnesis: "",
  objective: "",
  conclusion: "",
  weightKg: "",
  heightCm: "",
  temperature: "",
};

const result = {
  sections: { complaints: "Кашель 3 дня", anamnesis: "", objective: "Зев красный", conclusion: "ОРВИ" },
  diagnoses: [],
  vitals: { weightKg: 12.4, heightCm: null, temperature: 37.4 },
};

describe("planScribeApply", () => {
  it("пустые поля — сразу, пустой ответ — пропуск", () => {
    const plan = planScribeApply(empty, result, ["complaints", "anamnesis", "objective", "conclusion"]);
    expect(plan.direct).toEqual({ complaints: "Кашель 3 дня", objective: "Зев красный", conclusion: "ОРВИ" });
    expect(plan.review).toEqual([]);
    expect(plan.vitals).toEqual({ weightKg: "12.4", temperature: "37.4" });
  });

  it("заполненное — в сравнение, совпадающее — пропуск", () => {
    const form = { ...empty, complaints: "кашель", objective: "Зев красный ", weightKg: "12" };
    const plan = planScribeApply(form, result, ["complaints", "objective", "conclusion"]);
    expect(plan.direct).toEqual({ conclusion: "ОРВИ" });
    expect(plan.review).toEqual([{ key: "complaints", suggestion: "Кашель 3 дня" }]);
    expect(plan.vitals).toEqual({ temperature: "37.4" });
  });

  it("недоступные поля не трогаются", () => {
    const plan = planScribeApply(empty, result, ["conclusion"]);
    expect(plan.direct).toEqual({ conclusion: "ОРВИ" });
  });
});
