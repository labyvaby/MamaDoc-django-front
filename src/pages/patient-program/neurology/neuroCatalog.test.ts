import { describe, expect, it } from "vitest";

import {
  BEHAVIOR,
  COMPLAINTS,
  DIAGNOSES,
  FREQUENT_CONCLUSIONS,
  INVOLUNTARY,
  RECOMMENDATIONS,
  RED_FLAGS,
  SPEECH,
  STUDY_KINDS,
  diagnosisDef,
  diagnosisIcd,
  gendered,
} from "./neuroCatalog";
import { ALL_REFLEXES } from "./neuroNorms";

const ICD10 = /^[A-Z]\d{2}(\.\d{1,2})?$/;

const unique = (codes: ReadonlyArray<string | number>) => new Set(codes).size === codes.length;

describe("каталоги", () => {
  it("коды уникальны", () => {
    for (const list of [DIAGNOSES, RECOMMENDATIONS, RED_FLAGS, SPEECH, COMPLAINTS, BEHAVIOR, INVOLUNTARY, STUDY_KINDS, ALL_REFLEXES.map((item) => ({ value: item.code }))]) {
      expect(unique(list.map((item) => item.value))).toBe(true);
    }
  });

  it("у каждого пункта и варианта — код в формате МКБ-10", () => {
    for (const def of DIAGNOSES) {
      expect(def.icd).toMatch(ICD10);
      for (const variant of def.variants ?? []) expect(variant.icd).toMatch(ICD10);
      if (def.variants) expect(def.variants.some((variant) => variant.icd === def.icd)).toBe(true);
    }
  });

  it("код по варианту", () => {
    expect(diagnosisIcd("cp", "diplegia")).toBe("G80.1");
    expect(diagnosisIcd("cp", "")).toBe("G80.9");
    expect(diagnosisIcd("migraine", "aura")).toBe("G43.1");
    expect(diagnosisIcd("nope", "x")).toBe("");
  });

  it("«гипервозбудимость» — не F90.1: возбудимость новорождённого — P91.3", () => {
    expect(DIAGNOSES.some((def) => def.icd === "F90.1")).toBe(false);
    expect(diagnosisDef("cerebral_excitability")?.icd).toBe("P91.3");
    expect(diagnosisDef("iih")?.warning).toContain("только при подтверждении");
    expect(diagnosisDef("asd")?.warning).toContain("психиатр");
  });

  it("заключения речи с кодом ведут в каталог диагнозов", () => {
    for (const item of SPEECH) {
      if (item.diagnosis) expect(diagnosisDef(item.diagnosis)).toBeDefined();
    }
    for (const code of FREQUENT_CONCLUSIONS) expect(diagnosisDef(code)).toBeDefined();
  });

  it("окончания по полу", () => {
    expect(gendered("Ходит сам{а}", "female")).toBe("Ходит сама");
    expect(gendered("Ходит сам{а}", "male")).toBe("Ходит сам");
    expect(gendered("Ходит сам{а}", null)).toBe("Ходит сам(а)");
  });
});
