import type {
  FamilyMember,
  HealthProfile,
  LifeAnamnesis,
  LifeAnamnesisSocial,
  NeonatalScreening,
  PerinatalHistory,
  RiskGroupRecord,
  SensitiveHistory,
} from "../../../api/health";
import { emptySensitiveHistory } from "./anamnesisForm";
import type { AnamnesisInput } from "./anamnesisTypes";

/**
 * Данные для тестов и проверки глазами: пустые записи раздела и демо-девочка
 * ТЗ §9 (родилась 2025-03-26, на 2026-10-04 — 1 г 6 мес). Код экрана их не
 * импортирует.
 */

export const DEMO_AT = "2026-10-04";
export const DEMO_BIRTH = "2025-03-26";

/** Абзац макета слово в слово (ТЗ §8: главный тест). */
export const DEMO_PARAGRAPH =
  "Анамнез жизни. Девочка от 2-й беременности, протекавшей с ранним токсикозом, угрозой прерывания в 10 нед, ОРВИ в 22 нед и анемией лёгкой степени в III триместре, 2-х срочных родов в сроке 39 нед, самостоятельных, безводный период 6 ч. Масса при рождении 3250 г, длина 50 см, окружность головы 34 см. Оценка по шкале Апгар 8/9 баллов. Закричала сразу. К груди приложена через 1 ч. Физиологическая желтуха. Неонатальный скрининг — без отклонений; аудиологический скрининг — прошла с обеих сторон. В роддоме привита против гепатита B и туберкулёза. Выписана на 3-и сутки с массой 3120 г. Вскармливание грудное, прикорм с 6 мес. Перенесённые заболевания: ОРВИ — 3 раза, острый бронхит (декабрь 2025), железодефицитная анемия (март 2026). Операций, травм, переливаний крови не было. Аллергоанамнез: сыпь на белок коровьего молока. Прививки по календарю. Контакт с туберкулёзом отрицается. Наследственность: у матери атопический дерматит, у бабушки по отцу сахарный диабет 2 типа, у дедушки по отцу гипертоническая болезнь (ИО 0,43). Семья полная, жилищные условия удовлетворительные (со слов матери).";

export const DEMO_CONCLUSION =
  "Заключение по анамнезу: генеалогический анамнез умеренно отягощён; биологический — факторы в 3 периодах (выраженная отягощённость); социальный — благополучный. Группы риска: аллергия, анемия — реализовались; ЦНС — снята в 1 год.";

const doctor = { id: 41, fullName: "Абдыкадырова А. Т." };

export function emptyPerinatal(): PerinatalHistory {
  return {
    exists: false,
    pregnancyNumber: null,
    birthNumber: null,
    conception: "",
    multiplePregnancy: null,
    fetusCount: null,
    fetusOrder: null,
    complications: null,
    infections: null,
    maternalDiseases: null,
    prenatalTests: null,
    motherSmoking: null,
    motherCigarettesPerDay: null,
    motherAlcohol: null,
    motherDrugs: null,
    informant: "",
    cesareanKind: "",
    cesareanIndication: "",
    obstetricAids: null,
    presentation: "",
    laborDurationHours: null,
    ruptureIntervalHours: null,
    deliveryComplications: null,
    deliveryComplicationsNote: "",
    birthPlace: "",
    firstCry: "",
    resuscitation: null,
    resuscitationNote: "",
    apgar10min: null,
    birthChestCircumferenceCm: null,
    dischargeWeightG: null,
    firstLatchHours: null,
    jaundice: "",
    jaundiceFirstDay: null,
    jaundiceUntilDay: null,
    maxBilirubinUmol: null,
    phototherapy: null,
    neonatalTransfer: "",
    dischargeDiagnosis: "",
    updatedAt: null,
    updatedBy: null,
  };
}

export function emptySocial(): LifeAnamnesisSocial {
  return {
    exists: false,
    familyComposition: "",
    housing: "",
    rooms: null,
    income: "",
    familyClimate: "",
    childWanted: null,
    sanitary: "",
    smokingAtHome: null,
    pets: null,
    parentsConsanguineous: null,
    consanguinityNote: "",
    infantDeathInFamily: null,
    infantDeathNote: "",
    hadOperations: null,
    hadInjuries: null,
    hadTransfusions: null,
    assessedOn: null,
    informant: "",
    genealogicalLevel: "",
    genealogicalReason: "",
    biologicalLevel: "",
    biologicalReason: "",
    socialLevel: "",
    socialReason: "",
    updatedAt: null,
    updatedBy: null,
  };
}

export function emptySensitive(): SensitiveHistory {
  return emptySensitiveHistory();
}

export function emptyProfile(): HealthProfile {
  return {
    exists: false,
    gestationalAgeWeeks: null,
    gestationalAgeDays: null,
    birthWeightG: null,
    birthLengthCm: null,
    birthHeadCircumferenceCm: null,
    apgar1min: null,
    apgar5min: null,
    deliveryType: "",
    maternityHospital: "",
    maternityDischargedOn: null,
    birthNoticeReceivedOn: null,
    complementaryFeedingOn: null,
    perinatalNotes: "",
    riskGroups: [],
    healthGroup: "",
    healthGroupSetOn: null,
    peGroup: "",
    bloodGroup: "",
    rhFactor: "",
    noKnownAllergies: false,
    allergiesReviewedAt: null,
    allergiesReviewedBy: null,
    updatedAt: null,
    updatedBy: null,
  };
}

let memberId = 100;

/** Строка паспорта семьи с полями по умолчанию. */
export function member(partial: Partial<FamilyMember> & Pick<FamilyMember, "relation">): FamilyMember {
  memberId += 1;
  return {
    id: memberId,
    relative: null,
    fullName: "",
    birthDate: null,
    conditions: "",
    therapistExamOn: null,
    gynecologistExamOn: null,
    fluorographyOn: null,
    notes: "",
    createdAt: "2025-04-26T10:00:00+06:00",
    updatedAt: "2025-04-26T10:00:00+06:00",
    line: "",
    sex: partial.relation === "mother" ? "female" : partial.relation === "father" ? "male" : "",
    vitalStatus: "alive",
    deathYear: null,
    deathAge: null,
    healthStatus: "unknown",
    diseases: [],
    education: "",
    employment: "",
    occupation: "",
    hasOccupationalHazards: null,
    occupationalHazards: "",
    habits: null,
    ...partial,
  };
}

export function screening(partial: Partial<NeonatalScreening> & Pick<NeonatalScreening, "kind">): NeonatalScreening {
  return {
    id: 1,
    performedOn: null,
    result: "",
    program: "",
    stage: "",
    method: "",
    rightEar: "",
    leftEar: "",
    reason: "",
    notes: "",
    createdAt: "2025-04-26T10:00:00+06:00",
    updatedAt: "2025-04-26T10:00:00+06:00",
    ...partial,
  };
}

let riskId = 1;

export function riskRecord(partial: Partial<RiskGroupRecord> & Pick<RiskGroupRecord, "group" | "status">): RiskGroupRecord {
  riskId += 1;
  return {
    id: riskId,
    establishedOn: "2025-03-31",
    basis: [],
    basisNote: "",
    source: "suggested",
    closedOn: null,
    outcomeCondition: null,
    outcomeNote: "",
    establishedBy: doctor,
    reviews: [],
    createdAt: "2025-03-31T10:00:00+06:00",
    updatedAt: "2025-03-31T10:00:00+06:00",
    ...partial,
  };
}

const disease = (code: string, title: string, group: FamilyMember["diseases"][number]["group"]) => ({
  code,
  title,
  group,
  hereditary: false,
  causeOfDeath: false,
});

export function demoProfile(): HealthProfile {
  return {
    ...emptyProfile(),
    exists: true,
    gestationalAgeWeeks: 39,
    gestationalAgeDays: 0,
    birthWeightG: 3250,
    birthLengthCm: 50,
    birthHeadCircumferenceCm: 34,
    apgar1min: 8,
    apgar5min: 9,
    deliveryType: "natural",
    maternityHospital: "Роддом № 4, Бишкек",
    maternityDischargedOn: "2025-03-28",
    complementaryFeedingOn: "2025-09-26",
    riskGroups: [],
    updatedAt: "2025-04-26T10:12:00+06:00",
    updatedBy: doctor,
  };
}

export function demoPerinatal(): PerinatalHistory {
  return {
    ...emptyPerinatal(),
    exists: true,
    pregnancyNumber: 2,
    birthNumber: 2,
    conception: "natural",
    multiplePregnancy: false,
    complications: [
      { code: "toxicosis", fromWeek: 6, toWeek: 12, trimester: null, severity: "mild", note: "" },
      { code: "miscarriage_threat", fromWeek: 10, toWeek: null, trimester: null, severity: null, note: "" },
      { code: "anemia", fromWeek: 30, toWeek: 39, trimester: null, severity: "mild", note: "Hb 102" },
    ],
    infections: [{ code: "arvi", week: 22, trimester: null, note: "" }],
    maternalDiseases: null,
    prenatalTests: [
      { kind: "screening", week: 12, result: "normal", note: "" },
      { kind: "ultrasound", week: 20, result: "normal", note: "" },
      { kind: "ultrasound", week: 32, result: "normal", note: "тазовое предлежание, к родам — головное" },
    ],
    informant: "exchange_card",
    obstetricAids: [],
    presentation: "cephalic",
    laborDurationHours: 7,
    ruptureIntervalHours: 6,
    deliveryComplications: null,
    birthPlace: "maternity",
    firstCry: "immediately",
    resuscitation: false,
    firstLatchHours: 1,
    jaundice: "physiological",
    jaundiceFirstDay: false,
    phototherapy: false,
    neonatalTransfer: "none",
    dischargeWeightG: 3120,
    updatedAt: "2025-04-26T10:12:00+06:00",
    updatedBy: doctor,
  };
}

export function demoSocial(): LifeAnamnesisSocial {
  return {
    ...emptySocial(),
    exists: true,
    familyComposition: "full",
    housing: "apartment",
    rooms: 3,
    income: "sufficient",
    familyClimate: "favorable",
    childWanted: true,
    sanitary: "satisfactory",
    smokingAtHome: false,
    pets: ["cat"],
    parentsConsanguineous: false,
    infantDeathInFamily: false,
    hadOperations: false,
    hadInjuries: false,
    hadTransfusions: false,
    assessedOn: "2025-04-26",
    informant: "mother",
    updatedAt: "2025-04-26T10:12:00+06:00",
    updatedBy: doctor,
  };
}

export function demoSensitive(): SensitiveHistory {
  return {
    ...emptySensitive(),
    exists: true,
    motherHbsag: "negative",
    motherHcv: "negative",
    motherHiv: "negative",
    motherSyphilis: "negative",
    tbContact: "no",
    householdInfections: [],
    asocialFamily: false,
  };
}

export function demoFamily(): FamilyMember[] {
  return [
    member({
      relation: "mother",
      fullName: "Демо: мама",
      birthDate: "1994-02-10",
      education: "higher",
      employment: "maternity_leave",
      habits: [],
      hasOccupationalHazards: false,
      healthStatus: "ill",
      diseases: [disease("atopic_dermatitis", "Атопический дерматит", "allergic")],
    }),
    member({
      relation: "father",
      fullName: "Демо: папа",
      birthDate: "1991-05-17",
      education: "vocational",
      employment: "working",
      habits: [],
      hasOccupationalHazards: false,
      healthStatus: "healthy",
    }),
    member({ relation: "sibling", sex: "male", fullName: "Демо: брат", birthDate: "2021-04-12", healthStatus: "healthy" }),
    member({
      relation: "grandfather",
      line: "paternal",
      sex: "male",
      fullName: "Демо: дедушка по отцу",
      birthDate: "1960-01-01",
      healthStatus: "ill",
      diseases: [disease("hypertension", "Гипертоническая болезнь", "cardiovascular")],
    }),
    member({
      relation: "grandmother",
      line: "paternal",
      sex: "female",
      fullName: "Демо: бабушка по отцу",
      birthDate: "1963-01-01",
      healthStatus: "ill",
      diseases: [disease("diabetes_2", "Сахарный диабет 2 типа", "endocrine")],
    }),
    member({ relation: "grandfather", line: "maternal", sex: "male", fullName: "Демо: дедушка по матери", birthDate: "1966-01-01", healthStatus: "healthy" }),
    member({ relation: "grandmother", line: "maternal", sex: "female", fullName: "Демо: бабушка по матери", birthDate: "1968-01-01", healthStatus: "healthy" }),
  ];
}

export function demoScreenings(): NeonatalScreening[] {
  return [
    screening({ id: 1, kind: "neonatal", performedOn: "2025-03-28", result: "normal", program: "гипотиреоз, фенилкетонурия, АГС" }),
    screening({ id: 2, kind: "hearing", performedOn: "2025-03-28", stage: "maternity", method: "oae", rightEar: "pass", leftEar: "pass" }),
  ];
}

export function demoRiskGroups(): RiskGroupRecord[] {
  const review = (id: number, reviewedOn: string, decision: "keep" | "remove" | "realized") => ({
    id,
    reviewedOn,
    decision,
    note: "",
    reviewedBy: doctor,
  });
  return [
    riskRecord({
      group: "cns",
      status: "removed",
      basis: ["preg.threat", "preg.anemia"],
      closedOn: "2026-03-26",
      reviews: [review(1, "2025-04-26", "keep"), review(2, "2025-06-26", "keep"), review(3, "2025-09-26", "keep"), review(4, "2026-03-26", "remove")],
    }),
    riskRecord({
      group: "allergic",
      status: "realized",
      basis: ["fam.allergy"],
      closedOn: "2025-06-15",
      outcomeNote: "пищевая аллергия на белок коровьего молока",
      reviews: [review(5, "2025-06-15", "realized")],
    }),
    riskRecord({
      group: "anemia",
      status: "realized",
      basis: ["preg.anemia"],
      closedOn: "2026-03-10",
      outcomeCondition: { id: 55, title: "Железодефицитная анемия", diagnosisCode: "D50.9" },
      reviews: [review(6, "2025-06-26", "keep"), review(7, "2025-09-26", "keep"), review(8, "2026-03-10", "realized")],
    }),
    riskRecord({ group: "infection", status: "declined", basis: ["preg.threat"], basisNote: "инфекций в III триместре и в родах не было" }),
    riskRecord({ group: "malformations", status: "declined", basis: ["preg.threat_early"], basisNote: "скрининги и УЗИ без отклонений" }),
    riskRecord({
      group: "trophic_endocrine",
      status: "declined",
      basis: ["preg.anemia", "mother.age_gt30"],
      basisNote: "наблюдается по группе «анемия»",
    }),
  ];
}

export function demoLifeAnamnesis(): LifeAnamnesis {
  return {
    perinatal: demoPerinatal(),
    social: demoSocial(),
    sensitiveAccess: true,
    sensitiveFilled: true,
    sensitive: demoSensitive(),
    screenings: demoScreenings(),
    riskGroups: demoRiskGroups(),
    lastChange: { at: "2025-04-26T10:12:00+06:00", by: { id: 41, fullName: "педиатр" } },
  };
}

/** Пустой вход: ничего не заполнено. */
export function blankInput(birthDate: string | null = DEMO_BIRTH): AnamnesisInput {
  return {
    sex: "",
    birthDate,
    profile: emptyProfile(),
    perinatal: emptyPerinatal(),
    social: emptySocial(),
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

/** Вход чистых функций для демо-девочки. */
export function demoInput(): AnamnesisInput {
  const life = demoLifeAnamnesis();
  return {
    sex: "female",
    birthDate: DEMO_BIRTH,
    profile: demoProfile(),
    perinatal: life.perinatal,
    social: life.social,
    sensitive: life.sensitive,
    sensitiveAccess: true,
    sensitiveFilled: true,
    screenings: life.screenings,
    riskGroups: life.riskGroups,
    family: demoFamily(),
    allergies: [{ allergen: "Белок коровьего молока", reaction: "Сыпь", category: "food", isConfirmed: true }],
    conditions: [
      { id: 51, diagnosisCode: "J06.9", title: "ОРВИ", diagnosedOn: "2025-10-14" },
      { id: 52, diagnosisCode: "J20.9", title: "Острый бронхит", diagnosedOn: "2025-12-12" },
      { id: 53, diagnosisCode: "J06.9", title: "ОРВИ", diagnosedOn: "2026-01-20" },
      { id: 55, diagnosisCode: "D50.9", title: "Железодефицитная анемия", diagnosedOn: "2026-03-10" },
      { id: 54, diagnosisCode: "J06.9", title: "ОРВИ", diagnosedOn: "2026-05-06" },
    ],
    hospitalizations: [],
    noPastIllnesses: null,
    feeding: [{ feedingType: "breast", startedOn: DEMO_BIRTH, switchReason: "" }],
    complementaryFeedingOn: "2025-09-26",
    surgeries: { items: [], noneOperations: true, noneInjuries: true, noneTransfusions: true },
    vaccinations: {
      records: [
        { vaccineName: "Вакцина против гепатита B", administeredAt: "2025-03-26T09:00:00+06:00", status: "done" },
        { vaccineName: "БЦЖ-М", administeredAt: "2025-03-28T09:00:00+06:00", status: "done" },
        { vaccineName: "Пентавалентная (АКДС-ВГВ-Hib)", administeredAt: "2025-05-26T09:00:00+06:00", status: "done" },
      ],
      schedule: [
        { vaccineName: "Пентавалентная (АКДС-ВГВ-Hib)", status: "done", scheduledDate: "2025-05-26" },
        { vaccineName: "КПК", status: "done", scheduledDate: "2026-03-26" },
        { vaccineName: "ОПВ", status: "planned", scheduledDate: "2026-09-26" },
      ],
    },
  };
}
