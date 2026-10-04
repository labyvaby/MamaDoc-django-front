import { describe, expect, it } from "vitest";

import type { FamilyMember, RiskGroup } from "../../../api/health";
import {
  DEFAULT_SETTINGS,
  anamnesisFlags,
  assessBiological,
  assessGenealogical,
  assessSocial,
  completeness,
  firstFillTarget,
  recordStatusAt,
  reviewPlan,
  suggestRiskGroups,
} from "./anamnesisRules";
import { DEMO_AT, blankInput, demoInput, member, riskRecord, screening } from "./anamnesisFixtures";
import type { AnamnesisInput } from "./anamnesisTypes";

const ill = (code: string, title: string, group: FamilyMember["diseases"][number]["group"], extra: Partial<FamilyMember["diseases"][number]> = {}) => ({
  code,
  title,
  group,
  hereditary: false,
  causeOfDeath: false,
  ...extra,
});

/** Семья с ИО num/den: мать с num болезнями и здоровые родственники трёх поколений. */
function familyWithIndex(num: number, den: number): FamilyMember[] {
  const rows: FamilyMember[] = [
    member({
      relation: "mother",
      healthStatus: num ? "ill" : "healthy",
      diseases: Array.from({ length: num }, (_, index) => ill(`d${index}`, `Болезнь ${index}`, "other")),
    }),
    member({ relation: "grandmother", line: "maternal", sex: "female", healthStatus: "healthy" }),
  ];
  while (rows.length < den) rows.push(member({ relation: "aunt", line: "paternal", sex: "female", healthStatus: "healthy" }));
  return rows;
}

describe("генеалогический анамнез (§3.1)", () => {
  it("демо: 3 болезни у 7 родственников — 0,43, умеренная, без направленности", () => {
    const result = assessGenealogical(demoInput());
    expect(result.numerator).toBe(3);
    expect(result.denominator).toBe(7);
    expect(result.index).toBeCloseTo(3 / 7);
    expect(result.generations).toBe(3);
    expect(result.insufficient).toBe(false);
    expect(result.level).toBe("moderate");
    expect(result.directions).toEqual([]);
    expect(result.groups.map((group) => group.group)).toEqual(["allergic", "cardiovascular", "endocrine"]);
  });

  it("ребёнок и «нет сведений» не в знаменателе, «есть болезни» без списка — тоже", () => {
    const input = demoInput();
    input.family.push(member({ relation: "uncle", line: "maternal", sex: "male", healthStatus: "unknown" }));
    input.family.push(member({ relation: "aunt", line: "maternal", sex: "female", healthStatus: "ill", diseases: [] }));
    const result = assessGenealogical(input);
    expect(result.denominator).toBe(7);
    expect(result.illWithoutList).toHaveLength(1);
    // Не кровные (отчим) не считаются.
    input.family.push(member({ relation: "stepfather", healthStatus: "ill", diseases: [ill("hypertension", "Гипертония", "cardiovascular")] }));
    expect(assessGenealogical(input).denominator).toBe(7);
  });

  it("причина смерти — одна из болезней, дважды не считается", () => {
    const input = demoInput();
    input.family = input.family.map((row) =>
      row.relation === "grandfather" && row.line === "paternal"
        ? { ...row, vitalStatus: "deceased", diseases: [{ ...row.diseases[0], causeOfDeath: true }] }
        : row,
    );
    expect(assessGenealogical(input).numerator).toBe(3);
  });

  it("направленность — ИО группы больше 0,4", () => {
    const input = blankInput();
    input.family = familyWithIndex(0, 10);
    input.family[0] = member({
      relation: "mother",
      healthStatus: "ill",
      diseases: [ill("asthma", "Астма", "allergic"), ill("urticaria", "Крапивница", "allergic"), ill("hay_fever", "Поллиноз", "allergic"), ill("atopic_dermatitis", "АтД", "allergic")],
    });
    expect(assessGenealogical(input).directions).toEqual([]); // 4/10 = 0,4 — не больше
    input.family[1] = member({ relation: "grandmother", line: "maternal", sex: "female", healthStatus: "ill", diseases: [ill("asthma", "Астма", "allergic")] });
    expect(assessGenealogical(input).directions.map((item) => item.group)).toEqual(["allergic"]);
  });

  it("мало сведений: 5 человек или 2 поколения", () => {
    const five = blankInput();
    five.family = familyWithIndex(1, 5);
    const a = assessGenealogical(five);
    expect(a.insufficient).toBe(true);
    expect(a.level).toBeNull();
    const twoGenerations = blankInput();
    twoGenerations.family = [
      member({ relation: "mother", healthStatus: "healthy" }),
      member({ relation: "father", healthStatus: "healthy" }),
      ...Array.from({ length: 5 }, () => member({ relation: "uncle", line: "paternal", sex: "male", healthStatus: "healthy" })),
    ];
    const b = assessGenealogical(twoGenerations);
    expect(b.generations).toBe(2);
    expect(b.insufficient).toBe(true);
    // Ручная оценка при «мало сведений» — уровень есть.
    twoGenerations.social = { ...twoGenerations.social!, genealogicalLevel: "low", genealogicalReason: "со слов матери" };
    expect(assessGenealogical(twoGenerations).level).toBe("low");
  });

  it.each([
    [0, 20, "none", "favorable", "favorable"],
    [4, 20, "low", "favorable", "favorable"],
    [5, 20, "moderate", "favorable", "favorable"],
    [6, 20, "moderate", "favorable", "favorable"],
    [54, 100, "moderate", "favorable", "conditional"],
    [11, 20, "pronounced", "favorable", "conditional"],
    [14, 20, "pronounced", "favorable", "conditional"],
    [84, 100, "pronounced", "burdened", "unfavorable"],
    [17, 20, "high", "burdened", "unfavorable"],
  ] as const)("ИО %i/%i: Кильдиярова %s, Минск %s, Уфа %s", (num, den, kildiyarova, minsk, ufa) => {
    const input = blankInput();
    input.family = familyWithIndex(num, den);
    expect(assessGenealogical(input, "kildiyarova").level).toBe(kildiyarova);
    expect(assessGenealogical(input, "minsk").level).toBe(minsk);
    expect(assessGenealogical(input, "ufa").level).toBe(ufa);
  });

  it("наследственная болезнь — флаг генетика", () => {
    const input = demoInput();
    input.family.push(member({ relation: "cousin", line: "maternal", sex: "male", healthStatus: "ill", diseases: [ill("cystic_fibrosis", "Муковисцидоз", "respiratory", { hereditary: true })] }));
    expect(assessGenealogical(input).genetic).toBe(true);
    expect(anamnesisFlags(input, DEMO_AT).map((flag) => flag.code)).toContain("genetic");
  });
});

describe("биологический анамнез (§3.2)", () => {
  it("демо: Бер. I, Бер. II и «После» — 3 периода, выраженная", () => {
    const result = assessBiological(demoInput(), DEMO_AT);
    expect(result.periods.map((period) => period.state)).toEqual(["factors", "factors", "clear", "clear", "clear", "factors"]);
    expect(result.count).toBe(3);
    expect(result.level).toBe("pronounced");
    expect(result.periods[0].factors).toEqual(["Угроза прерывания (10 нед)"]);
    expect(result.periods[1].factors).toEqual(["Анемия (30–39 нед)", "ОРВИ (22 нед)"]);
    expect(result.periods[5].factors).toEqual(["Анемия (Железодефицитная анемия)"]);
    expect(result.suggestHigh).toBe(false);
  });

  it("каждый период — по своему полю", () => {
    const at = "2026-10-04";
    const state = (input: AnamnesisInput) => assessBiological(input, at).periods.map((period) => period.state);
    const base = blankInput("2025-01-01");

    const p1 = blankInput("2025-01-01");
    p1.perinatal = { ...p1.perinatal!, maternalDiseases: [{ code: "thyroid", note: "" }] };
    expect(state(p1)[0]).toBe("factors");

    const p2 = blankInput("2025-01-01");
    p2.perinatal = { ...p2.perinatal!, multiplePregnancy: true, fetusCount: 2 };
    expect(state(p2)[1]).toBe("factors");

    const p3 = blankInput("2025-01-01");
    p3.perinatal = { ...p3.perinatal!, presentation: "breech" };
    expect(state(p3)[2]).toBe("factors");

    const p4 = blankInput("2025-01-01");
    p4.perinatal = { ...p4.perinatal!, jaundice: "pathological" };
    expect(state(p4)[3]).toBe("factors");

    const p5 = blankInput("2025-01-01");
    p5.perinatal = { ...p5.perinatal!, jaundice: "prolonged" };
    expect(state(p5)[4]).toBe("factors");

    const p6 = blankInput("2025-01-01");
    p6.feeding = [{ feedingType: "formula", startedOn: "2025-02-01", switchReason: "hypogalactia" }];
    expect(state(p6)[5]).toBe("factors");

    expect(state(base)).toEqual(["nodata", "nodata", "nodata", "nodata", "clear", "clear"]);
    expect(assessBiological(base, at).level).toBeNull();
  });

  it("отрезок через 20-ю неделю — в обоих периодах; триместр без недель; лёгкий токсикоз не считается", () => {
    const input = blankInput();
    input.perinatal = {
      ...input.perinatal!,
      complications: [
        { code: "polyhydramnios", fromWeek: 18, toWeek: 24, trimester: null, severity: null, note: "" },
        { code: "toxicosis", fromWeek: 6, toWeek: 12, trimester: null, severity: "mild", note: "" },
      ],
      infections: [{ code: "flu", week: null, trimester: 2, note: "" }],
    };
    const periods = assessBiological(input, DEMO_AT).periods;
    expect(periods[0].factors).toEqual(["Многоводие (18–24 нед)"]);
    expect(periods[1].factors).toEqual(["Многоводие (18–24 нед)", "Грипп (II триместр)"]);
    input.perinatal = { ...input.perinatal!, complications: [], infections: [{ code: "cmv", week: null, trimester: 1, note: "" }] };
    expect(assessBiological(input, DEMO_AT).periods.map((period) => period.state).slice(0, 2)).toEqual(["factors", "clear"]);
  });

  it("периоды 5–6 «ещё не наступили» по возрасту", () => {
    const input = blankInput("2026-10-01");
    expect(assessBiological(input, "2026-10-04").periods.slice(4).map((period) => period.state)).toEqual(["notyet", "notyet"]);
    expect(assessBiological(input, "2026-10-16").periods.slice(4).map((period) => period.state)).toEqual(["clear", "notyet"]);
    expect(assessBiological(input, "2026-11-04").periods.slice(4).map((period) => period.state)).toEqual(["clear", "clear"]);
  });

  it("фактор максимальной силы предлагает «высокую»; шкала Минска", () => {
    const input = blankInput();
    input.profile = { ...input.profile!, apgar1min: 3, apgar5min: 6 };
    const result = assessBiological(input, DEMO_AT);
    expect(result.strongest.map((factor) => factor.code)).toEqual(["nb.apgar_severe"]);
    expect(result.level).toBe("low");
    expect(result.suggestHigh).toBe(true);
    input.social = { ...input.social!, biologicalLevel: "high", biologicalReason: "Апгар 3 балла" };
    expect(assessBiological(input, DEMO_AT).suggestHigh).toBe(false);
    const minsk = assessBiological(demoInput(), DEMO_AT, { ...DEFAULT_SETTINGS, scales: { ...DEFAULT_SETTINGS.scales, biological: "minsk" } });
    expect(minsk.level).toBe("unfavorable");
  });
});

describe("социальный анамнез (§3.3)", () => {
  it("демо — благополучный, все 8 параметров известны", () => {
    const result = assessSocial(demoInput(), { canSeeSensitive: true });
    expect(result.params.map((param) => param.state)).toEqual(Array(8).fill("ok"));
    expect(result.level).toBe("favorable");
    expect(result.restricted).toBe(false);
  });

  it("каждый параметр даёт риск", () => {
    const risky = (patch: (input: AnamnesisInput) => void) => {
      const input = demoInput();
      patch(input);
      return assessSocial(input, { canSeeSensitive: true }).params.filter((param) => param.state === "risk").map((param) => param.index);
    };
    expect(risky((input) => (input.social!.familyComposition = "single_mother"))).toEqual([1]);
    expect(risky((input) => (input.family[0] = { ...input.family[0], birthDate: "2008-01-01" }))).toEqual([2]);
    expect(risky((input) => (input.family[1] = { ...input.family[1], hasOccupationalHazards: true }))).toEqual([3]);
    expect(
      risky((input) => {
        input.family[0] = { ...input.family[0], education: "secondary" };
        input.family[1] = { ...input.family[1], education: "incomplete_secondary" };
      }),
    ).toEqual([3]);
    expect(risky((input) => (input.social!.childWanted = false))).toEqual([4]);
    expect(risky((input) => (input.family[1] = { ...input.family[1], habits: ["smoking"] }))).toEqual([5]);
    expect(risky((input) => (input.sensitive = { ...input.sensitive!, asocialFamily: true }))).toEqual([5]);
    expect(risky((input) => (input.social!.housing = "dormitory"))).toEqual([6]);
    expect(risky((input) => (input.social!.income = "insufficient"))).toEqual([7]);
    expect(risky((input) => (input.social!.sanitary = "unsatisfactory"))).toEqual([8]);
  });

  it("неизвестные параметры, «не оценивался», простая шкала", () => {
    const blank = assessSocial(blankInput(), { canSeeSensitive: true });
    expect(blank.notAssessed).toBe(true);
    expect(blank.level).toBeNull();
    const input = demoInput();
    input.social = { ...input.social!, income: "", housing: "room", sanitary: "unsatisfactory" };
    const result = assessSocial(input, { canSeeSensitive: true });
    expect(result.unknownCount).toBe(1);
    expect(result.riskCount).toBe(2);
    expect(result.level).toBe("low");
    expect(assessSocial(input, { canSeeSensitive: true }, "binary").level).toBe("unfavorable");
  });

  it("без права на закрытые сведения асоциальное поведение скрыто", () => {
    const input = demoInput();
    input.sensitive = { ...input.sensitive!, asocialFamily: true };
    const result = assessSocial(input, { canSeeSensitive: false });
    expect(result.riskCount).toBe(0);
    expect(result.restricted).toBe(true);
  });
});

describe("группы риска (§3.4)", () => {
  const base = () => {
    const input = blankInput("2024-10-01");
    input.family = [
      member({ relation: "mother", birthDate: "1997-01-01", habits: [], healthStatus: "healthy" }),
      member({ relation: "father", birthDate: "1995-01-01", habits: [], healthStatus: "healthy" }),
    ];
    return input;
  };
  const suggested = (input: AnamnesisInput, at = DEMO_AT) => suggestRiskGroups(input, at).map((item) => item.group);

  it.each<[RiskGroup, (input: AnamnesisInput) => void]>([
    ["cns", (input) => (input.perinatal!.complications = [{ code: "miscarriage_threat", fromWeek: 14, toWeek: null, trimester: null, severity: null, note: "" }])],
    ["infection", (input) => (input.perinatal!.ruptureIntervalHours = 20)],
    ["trophic_endocrine", (input) => (input.family[0] = { ...input.family[0], birthDate: "1990-01-01" })],
    ["malformations", (input) => (input.social!.parentsConsanguineous = true)],
    ["allergic", (input) => (input.family[0] = { ...input.family[0], healthStatus: "ill", diseases: [ill("asthma", "Бронхиальная астма", "allergic")] })],
    ["social", (input) => input.family.push(member({ relation: "sibling", sex: "male" }), member({ relation: "sibling", sex: "female" }))],
    ["hearing", (input) => (input.perinatal!.infections = [{ code: "flu", week: 24, trimester: null, note: "" }])],
    ["anemia", (input) => (input.perinatal!.complications = [{ code: "placental_insufficiency", fromWeek: 30, toWeek: null, trimester: null, severity: null, note: "" }])],
    ["sids", (input) => (input.social!.smokingAtHome = true)],
    [
      "frequent_ari",
      (input) => {
        input.conditions = ["2025-11-01", "2026-01-01", "2026-02-01", "2026-04-01", "2026-06-01", "2026-08-01"].map((date, index) => ({
          id: index + 1,
          diagnosisCode: "J06.9",
          title: "ОРВИ",
          diagnosedOn: date,
        }));
      },
    ],
  ])("группа %s предлагается по своему фактору", (group, patch) => {
    const input = base();
    expect(suggested(input)).toEqual([]);
    patch(input);
    expect(suggested(input)).toContain(group);
  });

  it("демо: предложений нет — снятые, реализованные и отклонённые записи гасят факторы", () => {
    expect(suggestRiskGroups(demoInput(), DEMO_AT)).toEqual([]);
  });

  it("запись подавляет предложение, новый фактор снова предлагает; действующая и ошибочная", () => {
    const input = demoInput();
    input.riskGroups = input.riskGroups.filter((record) => record.group !== "infection");
    expect(suggested(input)).toEqual(["infection"]);
    input.riskGroups.push(riskRecord({ group: "infection", status: "declined", basis: ["preg.threat"] }));
    expect(suggested(input)).toEqual([]);
    input.perinatal = { ...input.perinatal!, ruptureIntervalHours: 19 };
    expect(suggestRiskGroups(input, DEMO_AT).find((item) => item.group === "infection")?.factors.map((factor) => factor.code)).toEqual([
      "preg.threat",
      "birth.long_rupture",
    ]);
    input.riskGroups.push(riskRecord({ group: "infection", status: "active", basis: [] }));
    expect(suggested(input)).toEqual([]);
    input.riskGroups = input.riskGroups.map((record) => (record.group === "infection" ? { ...record, status: "refuted" } : record));
    expect(suggested(input)).toEqual(["infection"]);
  });

  it("выраженный токсикоз для ВПР — только до 20 нед", () => {
    const input = base();
    input.perinatal!.complications = [{ code: "toxicosis", fromWeek: 24, toWeek: 30, trimester: null, severity: "severe", note: "" }];
    expect(suggested(input)).not.toContain("malformations");
    input.perinatal!.complications = [{ code: "toxicosis", fromWeek: 8, toWeek: 12, trimester: null, severity: "severe", note: "" }];
    expect(suggested(input)).toContain("malformations");
  });

  it("план пересмотров: 1, 3, 6, 12 мес после установки, скоро и просрочен", () => {
    const record = riskRecord({ group: "cns", status: "active", establishedOn: "2025-03-31", reviews: [] });
    const plan = reviewPlan(record, "2025-03-26", "2025-04-05");
    expect(plan.terms.slice(0, 5).map((term) => `${term.label} ${term.date}`)).toEqual([
      "1 мес 2025-04-26",
      "3 мес 2025-06-26",
      "6 мес 2025-09-26",
      "1 год 2026-03-26",
      "2 года 2027-03-26",
    ]);
    expect(plan.next?.label).toBe("1 мес");
    expect(plan.state).toBe("planned");
    expect(reviewPlan(record, "2025-03-26", "2025-04-13").state).toBe("soon");
    expect(reviewPlan(record, "2025-03-26", "2025-05-10").state).toBe("soon");
    expect(reviewPlan(record, "2025-03-26", "2025-05-11").state).toBe("overdue");
    const reviewed = { ...record, reviews: [{ id: 1, reviewedOn: "2025-04-26", decision: "keep" as const, note: "", reviewedBy: null }] };
    expect(reviewPlan(reviewed, "2025-03-26", "2025-06-15").next?.label).toBe("3 мес");
    expect(anamnesisFlags({ ...demoInput(), riskGroups: [reviewed] }, "2025-06-15").map((flag) => flag.text)).toContain(
      "Пересмотр группы «ЦНС» — 3 мес, до 26.06.2025",
    );
  });

  it("когда предлагать снять", () => {
    const cns = riskRecord({ group: "cns", status: "active", establishedOn: "2025-03-31" });
    expect(reviewPlan(cns, "2025-03-26", "2026-01-01").removalHint).toBeNull();
    expect(reviewPlan(cns, "2025-03-26", "2026-03-26").removalHint).toBe("можно снимать: ЦНС — с 12 мес");
    const infection = riskRecord({ group: "infection", status: "active", establishedOn: "2025-03-31" });
    expect(reviewPlan(infection, "2025-03-26", "2025-06-26").removalHint).toBe("можно снимать: ВУИ — с 3 мес");
    const ari = riskRecord({ group: "frequent_ari", status: "active", establishedOn: "2025-03-31" });
    expect(reviewPlan(ari, "2025-03-26", "2026-01-01", { frequentIll: false }).removalHint).toContain("порог часто болеющего не достигнут");
    expect(reviewPlan(riskRecord({ group: "allergic", status: "active" }), "2025-03-26", "2026-06-01").removalHint).toBeNull();
  });

  it("состояние записи на дату приёма", () => {
    const cns = demoInput().riskGroups[0];
    expect(recordStatusAt(cns, "2026-03-25")).toBe("active");
    expect(recordStatusAt(cns, "2026-03-26")).toBe("removed");
    expect(recordStatusAt(cns, "2025-03-30")).toBeNull();
  });
});

describe("флаги (§3.5)", () => {
  it("демо — флагов нет", () => {
    expect(anamnesisFlags(demoInput(), DEMO_AT)).toEqual([]);
  });

  it("слух, ABR, неонатальный скрининг, Апгар на 10-й, желтуха", () => {
    const input = blankInput("2026-09-25");
    input.screenings = [screening({ kind: "hearing", performedOn: "2026-09-27", rightEar: "refer", leftEar: "pass" })];
    input.profile = { ...input.profile!, apgar1min: 5, apgar5min: 6, gestationalAgeWeeks: 37 };
    input.perinatal = { ...input.perinatal!, maxBilirubinUmol: 250 };
    const texts = anamnesisFlags(input, "2026-10-04").map((flag) => flag.text);
    expect(texts).toEqual([
      "Слух: повторить ОАЭ и ABR в 4–6 нед (до 06.11.2026)",
      "Есть факторы риска тугоухости — ABR в 3–4 мес независимо от скрининга",
      "Укажите оценку по Апгар на 10-й минуте",
      "Риск значительной желтухи",
    ]);
    const older = blankInput("2026-09-01");
    expect(anamnesisFlags(older, "2026-10-04").map((flag) => flag.text)).toEqual(["Нет сведений о неонатальном скрининге"]);
    older.perinatal = { ...older.perinatal!, birthPlace: "home" };
    expect(anamnesisFlags(older, "2026-10-04").map((flag) => flag.text)).toContain("Слух: повторить ОАЭ и ABR в 4–6 нед (до 13.10.2026)");
    expect(anamnesisFlags(older, "2026-11-04").map((flag) => flag.text)).toContain("Слух: повторить ОАЭ и ABR — срок 4–6 нед прошёл");
  });
});

describe("заполнено N из 19 (§3.6)", () => {
  it("демо — 16 из 19: болезни и привычки матери, осложнения родов", () => {
    const result = completeness(demoInput());
    expect(result.filled).toBe(16);
    expect(result.total).toBe(19);
    expect(result.missing.map((item) => item.index)).toEqual([5, 6, 10]);
    expect(firstFillTarget(result)).toBe("pregnancy");
  });

  it("пустой раздел — 0 из 19, закрытые сведения на цифру не влияют", () => {
    expect(completeness(blankInput()).filled).toBe(0);
    const input = demoInput();
    const withSensitive = completeness(input).filled;
    expect(completeness({ ...input, sensitive: null }).filled).toBe(withSensitive);
  });
});
