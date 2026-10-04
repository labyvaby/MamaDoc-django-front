import { describe, expect, it } from "vitest";

import { allergyPhrase, appendParagraph, buildLifeAnamnesisParagraph, hearingWords } from "./anamnesisParagraph";
import {
  DEMO_AT,
  DEMO_CONCLUSION,
  DEMO_PARAGRAPH,
  demoInput,
  emptyPerinatal,
  emptyProfile,
  member,
  screening,
} from "./anamnesisFixtures";
import type { AnamnesisInput } from "./anamnesisTypes";

const FULL = { at: DEMO_AT, canSeeSensitive: true, canSeeVaccinations: true };

function build(input: AnamnesisInput, options: Partial<typeof FULL> = {}) {
  return buildLifeAnamnesisParagraph(input, { ...FULL, ...options });
}

function emptyInput(): AnamnesisInput {
  return {
    sex: "",
    birthDate: "2025-03-26",
    profile: null,
    perinatal: null,
    social: null,
    sensitive: null,
    sensitiveAccess: false,
    sensitiveFilled: false,
    screenings: [],
    riskGroups: [],
    family: [],
    allergies: [],
    conditions: [],
    hospitalizations: [],
    noPastIllnesses: null,
    feeding: [],
    complementaryFeedingOn: null,
    surgeries: null,
    vaccinations: null,
  };
}

describe("buildLifeAnamnesisParagraph — демо-девочка ТЗ §9", () => {
  it("даёт абзац макета слово в слово", () => {
    const result = build(demoInput());
    expect(result.body).toBe(DEMO_PARAGRAPH);
    expect(result.conclusion).toBe(DEMO_CONCLUSION);
    expect(result.text).toBe(`${DEMO_PARAGRAPH}\n${DEMO_CONCLUSION}`);
    expect(result.empty).toBe(false);
  });

  it("без права на закрытые сведения нет фразы о туберкулёзе", () => {
    const result = build(demoInput(), { canSeeSensitive: false });
    expect(result.body).not.toContain("Контакт с туберкулёзом");
    expect(result.body).toContain("Прививки по календарю. Наследственность:");
  });

  it("без права на прививки нет фраз о прививках", () => {
    const result = build(demoInput(), { canSeeVaccinations: false });
    expect(result.body).not.toContain("привита");
    expect(result.body).not.toContain("Прививки");
  });

  it("просрочки календаря — «с отступлениями»", () => {
    const input = demoInput();
    input.vaccinations!.schedule.push({ vaccineName: "КПК", status: "overdue", scheduledDate: "2026-04-01" });
    expect(build(input).body).toContain("Прививки с отступлениями от календаря: КПК.");
  });
});

describe("род, порядковые, пропуски", () => {
  it("мальчик и пол не указан — мужской род", () => {
    const boy = build({ ...demoInput(), sex: "male" }).body;
    expect(boy).toContain("Мальчик от 2-й беременности");
    expect(boy).toContain("Закричал сразу.");
    expect(boy).toContain("К груди приложен через 1 ч.");
    expect(boy).toContain("В роддоме привит против");
    expect(boy).toContain("Выписан на 3-и сутки");
    expect(boy).toContain("прошёл с обеих сторон");
    const unknown = build({ ...demoInput(), sex: "" }).body;
    expect(unknown).toContain("Ребёнок от 2-й беременности");
    expect(unknown).toContain("Закричал сразу.");
  });

  it("сутки выписки и желтухи: 1-е, 3-и, 13-е, 23-и, до 7-х суток", () => {
    const input = demoInput();
    const discharge = (date: string) => {
      input.profile = { ...input.profile!, maternityDischargedOn: date };
      return build(input).body;
    };
    expect(discharge("2025-03-26")).toContain("на 1-е сутки");
    expect(discharge("2025-04-07")).toContain("на 13-е сутки");
    expect(discharge("2025-04-17")).toContain("на 23-и сутки");
    input.perinatal = { ...input.perinatal!, jaundiceUntilDay: 7 };
    expect(build(input).body).toContain("Физиологическая желтуха до 7-х суток.");
  });

  it("пустые поля выпадают, пустой вход — пустой абзац", () => {
    expect(build(emptyInput()).empty).toBe(true);
    const input = demoInput();
    input.profile = { ...input.profile!, birthHeadCircumferenceCm: null, apgar5min: null };
    input.perinatal = { ...input.perinatal!, firstLatchHours: null, ruptureIntervalHours: null };
    const body = build(input).body;
    expect(body).toContain("Масса при рождении 3250 г, длина 50 см.");
    expect(body).toContain("Оценка по шкале Апгар на 1-й минуте 8 баллов.");
    expect(body).not.toContain("К груди");
    expect(body).not.toContain("безводный период");
  });

  it("отрицания — только при подтверждённом «нет»", () => {
    const input = demoInput();
    input.perinatal = { ...input.perinatal!, jaundice: "none" };
    input.surgeries = { items: [], noneOperations: false, noneInjuries: false, noneTransfusions: true };
    let body = build(input).body;
    expect(body).toContain("Желтухи не было.");
    expect(body).toContain("Переливаний крови не было.");
    expect(body).not.toContain("Операций");
    input.surgeries = null;
    input.sensitive = { ...input.sensitive!, tbContact: "" };
    input.allergies = [];
    input.profile = { ...input.profile!, noKnownAllergies: false };
    body = build(input).body;
    expect(body).not.toContain("Переливаний");
    expect(body).not.toContain("Контакт с туберкулёзом");
    expect(body).not.toContain("Аллергоанамнез");
    input.profile = { ...input.profile!, noKnownAllergies: true };
    expect(build(input).body).toContain("Аллергоанамнез не отягощён.");
  });

  it("«без осложнений» — только если оба списка пусты", () => {
    const input = demoInput();
    input.perinatal = { ...input.perinatal!, complications: [], infections: [] };
    expect(build(input).body).toContain("Девочка от 2-й беременности, протекавшей без осложнений, 2-х срочных родов");
    input.perinatal = { ...input.perinatal!, complications: [], infections: null };
    expect(build(input).body).toContain("Девочка от 2-й беременности, 2-х срочных родов");
  });

  it("сроки осложнений: разовое, отрезок в триместре, через триместры, выраженный токсикоз, другое", () => {
    const input = demoInput();
    input.perinatal = {
      ...emptyPerinatal(),
      pregnancyNumber: 1,
      complications: [
        { code: "toxicosis", fromWeek: null, toWeek: null, trimester: null, severity: "severe", note: "" },
        { code: "anemia", fromWeek: 20, toWeek: 30, trimester: null, severity: "moderate", note: "" },
        { code: "preeclampsia", fromWeek: null, toWeek: null, trimester: 3, severity: null, note: "" },
        { code: "other", fromWeek: 25, toWeek: null, trimester: null, severity: null, note: "отёки" },
      ],
      infections: [],
    };
    expect(build(input).body).toContain(
      "Девочка от 1-й беременности, протекавшей с выраженным ранним токсикозом, анемией средней степени с 20 нед и преэклампсией в III триместре, а также: отёки в 25 нед",
    );
  });

  it("роды: кесарево, тазовое, пособия, стремительные, осложнения, многоплодная", () => {
    const input = demoInput();
    input.profile = { ...input.profile!, deliveryType: "cesarean", gestationalAgeWeeks: 35, gestationalAgeDays: 4 };
    input.perinatal = {
      ...input.perinatal!,
      birthNumber: 1,
      multiplePregnancy: true,
      fetusCount: 2,
      fetusOrder: 1,
      cesareanKind: "emergency",
      cesareanIndication: "слабость родовой деятельности",
      presentation: "breech",
      obstetricAids: ["breech_aid"],
      laborDurationHours: 3.5,
      deliveryComplications: ["cord_entanglement"],
      ruptureIntervalHours: 6.5,
      informant: "mother",
    };
    expect(build(input).body).toContain(
      "Девочка от 2-й беременности, из двойни, первая, протекавшей с ранним токсикозом, угрозой прерывания в 10 нед, ОРВИ в 22 нед и анемией лёгкой степени в III триместре, 1-х преждевременных родов в сроке 35 нед 4 дн, путём экстренного кесарева сечения (слабость родовой деятельности), в тазовом предлежании, с применением пособия при тазовом предлежании, стремительных (3,5 ч), осложнённых обвитием пуповины, безводный период 6,5 ч (со слов матери).",
    );
  });

  it("свой аллерген — «аллерген — реакция», готовый — винительный падеж", () => {
    expect(allergyPhrase({ allergen: "Рыба", reaction: "Крапивница" })).toBe("крапивница на рыбу");
    expect(allergyPhrase({ allergen: "Пыльца деревьев", reaction: "" })).toBe("аллергия на пыльцу деревьев");
    expect(allergyPhrase({ allergen: "Хурма", reaction: "Отёк Квинке" })).toBe("Хурма — отёк Квинке");
  });

  it("слух по ушам", () => {
    expect(hearingWords({ rightEar: "pass", leftEar: "refer" }, "female")).toBe("прошла справа, не прошла слева");
    expect(hearingWords({ rightEar: "not_done", leftEar: "not_done" }, "male")).toBe("не проводился");
    expect(hearingWords({ rightEar: "pass", leftEar: "" }, "male")).toBe("прошёл справа");
  });

  it("наследственность: умерший, кровнородственный брак, «не отягощена»", () => {
    const input = demoInput();
    input.family = input.family.map((row) =>
      row.relation === "grandfather" && row.line === "paternal" ? { ...row, vitalStatus: "deceased", deathAge: 62 } : row,
    );
    input.social = { ...input.social!, parentsConsanguineous: true, consanguinityNote: "троюродные" };
    expect(build(input).body).toContain(
      "у дедушки по отцу гипертоническая болезнь (умер в 62 года) (ИО 0,43); брак родителей кровнородственный (троюродные).",
    );
    const healthy = demoInput();
    healthy.family = healthy.family.map((row) => ({ ...row, healthStatus: "healthy", diseases: [] }));
    expect(build(healthy).body).toContain("Наследственность не отягощена.");
    // «Мало сведений»: болезни есть, а ИО нет; без болезней — фразы нет.
    const few = demoInput();
    few.family = few.family.slice(0, 2);
    expect(build(few).body).toContain("Наследственность: у матери атопический дерматит.");
    few.family = [member({ relation: "father", healthStatus: "healthy" })];
    expect(build(few).body).not.toContain("Наследственность");
  });

  it("болезни: стационар, одинаковые болезни вместе", () => {
    const input = demoInput();
    input.conditions.push({ id: 60, diagnosisCode: "J20.9", title: "Острый бронхит", diagnosedOn: "2026-06-01" });
    input.hospitalizations = [{ conditionId: 60, admittedOn: "2026-06-01" }];
    expect(build(input).body).toContain("острый бронхит (декабрь 2025, июнь 2026, стационар)");
  });
});

describe("с 3 лет — короткая версия", () => {
  it("фразы 1–10 — одной, болезни по возрасту, ОРЗ за год", () => {
    const input: AnamnesisInput = {
      ...emptyInput(),
      sex: "male",
      birthDate: "2019-02-01",
      profile: {
        ...emptyProfile(),
        gestationalAgeWeeks: 40,
        gestationalAgeDays: 0,
        birthWeightG: 3600,
        apgar1min: 8,
        apgar5min: 9,
        deliveryType: "natural",
        noKnownAllergies: false,
        bloodGroup: "",
        rhFactor: "",
      },
      perinatal: { ...emptyPerinatal(), pregnancyNumber: 1, birthNumber: 1, jaundice: "physiological", firstCry: "immediately" },
      feeding: [
        { feedingType: "breast", startedOn: "2019-02-01", switchReason: "" },
        { feedingType: "general", startedOn: "2020-04-01", switchReason: "" },
      ],
      conditions: [
        { id: 1, diagnosisCode: "B01.9", title: "Ветряная оспа", diagnosedOn: "2023-03-10" },
        { id: 2, diagnosisCode: "J18.9", title: "Внебольничная пневмония", diagnosedOn: "2024-05-01" },
        { id: 3, diagnosisCode: "J06.9", title: "ОРВИ", diagnosedOn: "2026-01-10" },
        { id: 4, diagnosisCode: "J20.9", title: "Острый бронхит", diagnosedOn: "2026-03-10" },
        { id: 5, diagnosisCode: "J06.9", title: "ОРВИ", diagnosedOn: "2026-09-01" },
      ],
      hospitalizations: [{ conditionId: 2, admittedOn: "2024-05-01" }],
      surgeries: {
        items: [{ kind: "operation", performedOn: "2025-03-01", title: "Аппендэктомия" }],
        noneOperations: false,
        noneInjuries: false,
        noneTransfusions: true,
      },
      family: [member({ relation: "father", healthStatus: "ill", diseases: [{ code: "ulcer", title: "Язвенная болезнь", group: "digestive", hereditary: false, causeOfDeath: false }] })],
      screenings: [screening({ kind: "hearing", rightEar: "pass", leftEar: "pass" })],
    };
    const body = build(input).body;
    expect(body).toContain(
      "Анамнез жизни. Мальчик от 1-й беременности, 1-х срочных самостоятельных родов в 40 нед, масса при рождении 3600 г, оценка по шкале Апгар 8/9 баллов, период новорождённости без особенностей. На грудном вскармливании до 1 года 2 мес.",
    );
    expect(body).toContain(
      "Перенесённые заболевания: ветряная оспа (4 года), внебольничная пневмония (5 лет, стационар); ОРЗ 3 раза за последний год.",
    );
    expect(body).toContain("Операции: аппендэктомия (6 лет). Переливаний крови не было.");
    expect(body).toContain("Наследственность: у отца язвенная болезнь.");
    expect(body).not.toContain("Закричал");
  });
});

describe("вставка в поле «Анамнез»", () => {
  it("пустое поле — абзац, не пустое — через пустую строку", () => {
    expect(appendParagraph("", "Анамнез жизни. …")).toBe("Анамнез жизни. …");
    expect(appendParagraph("  \n", "А")).toBe("А");
    expect(appendParagraph("Со слов мамы: часто срыгивает.\n", "Анамнез жизни. …")).toBe("Со слов мамы: часто срыгивает.\n\nАнамнез жизни. …");
  });
});
