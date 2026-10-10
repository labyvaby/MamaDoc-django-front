import { describe, expect, it } from "vitest";

import { frequentIllness, inRubrics, termHalves, termText, termTrimesters } from "./anamnesisFactors";
import { THRESHOLDS, anamnesisFactors } from "./anamnesisRules";
import { DEMO_AT, blankInput, demoInput, member } from "./anamnesisFixtures";
import type { AnamnesisInput } from "./anamnesisTypes";

const codes = (input: AnamnesisInput, at = DEMO_AT) => anamnesisFactors(input, at).map((factor) => factor.code);

describe("сроки беременности", () => {
  it("половины, триместры и подписи", () => {
    expect(termHalves({ fromWeek: 18, toWeek: 24, trimester: null }, 2)).toEqual([1, 2]);
    expect(termHalves({ fromWeek: 20, toWeek: null, trimester: null }, 2)).toEqual([1]);
    expect(termHalves({ week: 21, trimester: null }, 1)).toEqual([2]);
    expect(termHalves({ week: null, trimester: 2 }, 1)).toEqual([2]);
    expect(termHalves({ fromWeek: null, toWeek: null, trimester: null }, 2)).toEqual([2]);
    expect(termTrimesters({ fromWeek: 12, toWeek: 15, trimester: null })).toEqual([1, 2]);
    expect(termText({ fromWeek: 6, toWeek: 12, trimester: null })).toBe("6–12 нед");
    expect(termText({ week: null, trimester: 3 })).toBe("III триместр");
  });

  it("рубрики МКБ", () => {
    expect(inRubrics("P12.0", "P10", "P15")).toBe(true);
    expect(inRubrics("P16", "P10", "P15")).toBe(false);
    expect(inRubrics("d50.9", "D50", "D64")).toBe(true);
    expect(inRubrics("", "D50")).toBe(false);
  });
});

describe("collectFactors", () => {
  it("демо: угроза (в т. ч. ранняя), анемия у матери, возраст матери, аллергия у матери, анемия", () => {
    expect(codes(demoInput())).toEqual(["preg.threat", "preg.threat_early", "preg.anemia", "mother.age_gt30", "dx.anemia", "fam.allergy"]);
  });

  it("стремительные и затяжные роды по повторности", () => {
    const input = blankInput();
    input.perinatal = { ...input.perinatal!, laborDurationHours: 3, birthNumber: 1 };
    expect(codes(input)).toContain("birth.rapid");
    input.perinatal = { ...input.perinatal!, birthNumber: 2 };
    expect(codes(input)).not.toContain("birth.rapid");
    input.perinatal = { ...input.perinatal!, laborDurationHours: 14 };
    expect(codes(input)).toContain("birth.prolonged");
    input.perinatal = { ...input.perinatal!, birthNumber: null };
    expect(codes(input)).not.toContain("birth.prolonged");
    input.perinatal = { ...input.perinatal!, laborDurationHours: 1.5 };
    expect(codes(input)).toContain("birth.rapid");
  });

  it("безводный период, недоношенность, Апгар, масса, убыль, желтуха, билирубин", () => {
    const input = blankInput();
    input.perinatal = {
      ...input.perinatal!,
      ruptureIntervalHours: THRESHOLDS.ruptureHours,
      dischargeWeightG: 1300,
      jaundice: "pathological",
      jaundiceFirstDay: true,
      maxBilirubinUmol: 210,
      neonatalTransfer: "icu",
    };
    input.profile = { ...input.profile!, gestationalAgeWeeks: 31, birthWeightG: 1450, apgar1min: 6, apgar5min: 7 };
    expect(codes(input)).toEqual([
      "birth.preterm",
      "birth.very_preterm",
      "birth.long_rupture",
      "nb.apgar_moderate",
      "nb.apgar_low",
      "nb.lbw",
      "nb.lt2000",
      "nb.vlbw",
      "nb.weight_loss",
      "nb.jaundice_pathological",
      "nb.jaundice_day1",
      "nb.bilirubin_high",
      "nb.transfer",
    ]);
  });

  it("короткий интервал между родами, заменное переливание, острая болезнь до 3 мес, ранняя смесь", () => {
    const input = blankInput("2025-03-26");
    input.family = [member({ relation: "sibling", sex: "male", birthDate: "2023-09-01" })];
    input.surgeries = {
      items: [{ kind: "transfusion", performedOn: "2025-03-29", title: "Заменное переливание", transfusionProduct: "exchange" }],
      noneOperations: false,
      noneInjuries: false,
      noneTransfusions: false,
    };
    input.conditions = [{ id: 1, diagnosisCode: "J21.0", title: "Бронхиолит", diagnosedOn: "2025-05-20" }];
    input.feeding = [{ feedingType: "mixed", startedOn: "2025-07-01", switchReason: "hypogalactia" }];
    expect(codes(input)).toEqual(["preg.short_interval", "nb.exchange_transfusion", "dx.acute_first3m", "feed.early_switch"]);
  });

  it("часто болеющий: порог по полным годам", () => {
    const input = blankInput("2025-03-26");
    input.conditions = ["2025-10-10", "2025-12-01", "2026-02-01", "2026-05-01", "2026-07-01"].map((date, index) => ({
      id: index,
      diagnosisCode: index % 2 ? "J20.9" : "J06.9",
      title: "ОРЗ",
      diagnosedOn: date,
    }));
    expect(frequentIllness(input, DEMO_AT, THRESHOLDS)).toEqual({ count: 5, threshold: 6, isFrequent: false });
    input.conditions.push({ id: 9, diagnosisCode: "J00", title: "Назофарингит", diagnosedOn: "2026-09-01" });
    expect(frequentIllness(input, DEMO_AT, THRESHOLDS)?.isFrequent).toBe(true);
    // До года порог 4.
    expect(frequentIllness({ ...input, birthDate: "2025-11-01" }, "2026-09-30", THRESHOLDS)?.threshold).toBe(4);
  });

  it("семья, быт и закрытые сведения", () => {
    const input = blankInput();
    input.family = [
      member({ relation: "mother", birthDate: "2008-06-01", habits: ["smoking"], education: "secondary", employment: "abroad" }),
      member({
        relation: "grandmother",
        line: "paternal",
        sex: "female",
        healthStatus: "ill",
        diseases: [
          { code: "hearing_loss", title: "Тугоухость и глухота", group: "hearing", hereditary: false, causeOfDeath: false },
          { code: "anemia", title: "Анемия", group: "blood", hereditary: false, causeOfDeath: false },
          { code: "chromosomal", title: "Синдром Дауна", group: "hereditary", hereditary: true, causeOfDeath: false },
        ],
      }),
    ];
    input.social = { ...input.social!, familyComposition: "single_mother", income: "insufficient", housing: "dormitory", familyClimate: "conflict", smokingAtHome: true, infantDeathInFamily: true };
    input.sensitive = { ...demoInput().sensitive!, asocialFamily: true, tbContact: "yes" };
    expect(codes(input)).toEqual([
      "mother.age_lt18",
      "fam.hearing",
      "fam.anemia",
      "fam.malformation",
      "fam.genetic",
      "fam.infant_death",
      "fam.parents_habits",
      "soc.incomplete",
      "soc.low_income",
      "soc.housing",
      "soc.climate",
      "soc.migration",
      "soc.smoking_home",
      "soc.low_education",
      "sensitive.asocial",
      "sensitive.tb_contact",
    ]);
    // Без права закрытые факторы не считаются.
    expect(codes({ ...input, sensitive: null })).not.toContain("sensitive.asocial");
  });
});
