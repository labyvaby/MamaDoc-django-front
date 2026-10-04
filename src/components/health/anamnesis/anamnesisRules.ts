import dayjs from "dayjs";

import type { FamilyDiseaseGroup, FamilyMember, RiskGroup, RiskGroupRecord } from "../../../api/health";
import {
  collectFactors,
  factorText,
  frequentIllness,
  inRubrics,
  socialParameters,
  termHalves,
  termText,
  type Factor,
  type FactorThresholds,
  type SocialParam,
} from "./anamnesisFactors";
import {
  COMPLICATIONS,
  DEFAULT_SCALES,
  INFECTIONS,
  MATERNAL_DISEASES,
  RELATION_META,
  RISK_GROUP_META,
  RISK_GROUP_ORDER,
  type AnamnesisInput,
  type AnamnesisScales,
  type AssessmentLevel,
  type BiologicalScale,
  type GenealogicalScale,
  type Generation,
  type SocialScale,
} from "./anamnesisTypes";
import { FAMILY_DISEASE_GROUPS } from "./familyDiseases";
import { ageParts, dateText, plural } from "./russian";

/**
 * Правила раздела «Анамнез жизни» (ТЗ §3): три оценки анамнеза, предложения
 * групп риска, план пересмотров, флаги и «заполнено N из 19». Всё — на дату
 * `at` (книжка — сегодня, заключение — дата приёма), без React и запросов.
 */

// ── Пороги: одно место (ТЗ §3.9 — значения утверждает врач клиники) ─────────

export const THRESHOLDS = {
  // §3.1 генеалогический анамнез
  genealogicalMinRelatives: 6,
  genealogicalMinGenerations: 3,
  /** Направленность — ИО группы болезней больше 0,4 (в сотых). */
  directionIndex: 40,
  /** Кильдиярова: границы low | moderate | pronounced | high, в сотых [П]. */
  kildiyarovaGenealogical: [25, 55, 85],
  /** Минск: до 0,7 включительно — не отягощён. */
  minskGenealogical: 70,
  /** Уфа: до 0,3 включительно — благополучный, до 0,7 — условно. */
  ufaGenealogical: [30, 70],
  // §3.4 факторы
  ruptureHours: 18,
  malformationMotherAge: 35,
  rapidLaborPrimipara: 4,
  rapidLaborMultipara: 2,
  prolongedLaborPrimipara: 18,
  prolongedLaborMultipara: 12,
  pretermWeeks: 37,
  veryPretermWeeks: 32,
  postTermWeeks: 42,
  weightLossPercent: 8,
  bilirubinHigh: 200,
  shortBirthIntervalMonths: 21,
  earlySwitchMonths: 6,
  largeFamilyChildren: 3,
  threatEarlyWeek: 10,
  acuteFirstMonths: 3,
  exchangeTransfusionDays: 28,
  frequentAri: [
    { maxYears: 0, count: 4 },
    { maxYears: 3, count: 6 },
    { maxYears: 5, count: 5 },
    { maxYears: Number.POSITIVE_INFINITY, count: 4 },
  ],
  // §3.4 пересмотры групп
  reviewMonths: [1, 3, 6, 12],
  reviewSoonDays: 14,
  reviewOverdueDays: 14,
  // §3.5 флаги
  hearingRetestWeeks: 6,
  neonatalScreeningDays: 14,
  jaundiceRiskDays: 14,
  jaundiceRiskWeeks: 38,
  // §3.6 полнота
  completenessItems: 19,
} as const;

export interface AnamnesisSettings {
  scales: AnamnesisScales;
  /** Безводный период — фактор с N ч (КР 18, РФ 12). */
  ruptureHours: number;
  /** Возраст матери — фактор ВПР старше N лет (35 или 30). */
  malformationMotherAge: number;
}

export const DEFAULT_SETTINGS: AnamnesisSettings = {
  scales: DEFAULT_SCALES,
  ruptureHours: THRESHOLDS.ruptureHours,
  malformationMotherAge: THRESHOLDS.malformationMotherAge,
};

function factorThresholds(settings: AnamnesisSettings): FactorThresholds {
  return { ...THRESHOLDS, ruptureHours: settings.ruptureHours, malformationMotherAge: settings.malformationMotherAge };
}

/** Все факторы ребёнка на дату с порогами организации. */
export function anamnesisFactors(input: AnamnesisInput, at: string, settings: AnamnesisSettings = DEFAULT_SETTINGS): Factor[] {
  return collectFactors(input, at, factorThresholds(settings));
}

export interface ManualAssessment {
  level: AssessmentLevel;
  reason: string;
}

function manualOf(level: string | undefined, reason: string | undefined): ManualAssessment | null {
  return level ? { level: level as AssessmentLevel, reason: reason ?? "" } : null;
}

// ── §3.1 Генеалогический анамнез ────────────────────────────────────────────

export interface GroupIndex {
  group: FamilyDiseaseGroup;
  count: number;
  index: number;
  /** ИО группы > 0,4 — направленность. */
  direction: boolean;
}

export interface GenealogicalAssessment {
  scale: GenealogicalScale;
  /** Болезней в списках родственников знаменателя. */
  numerator: number;
  /** Родственников, о здоровье которых что-то известно. */
  denominator: number;
  /** ИО; null — знаменатель 0. */
  index: number | null;
  generations: number;
  /** Меньше 6 человек или меньше 3 поколений: ИО серый, уровень — только ручной. */
  insufficient: boolean;
  computedLevel: AssessmentLevel | null;
  manual: ManualAssessment | null;
  /** Итог: ручная оценка, иначе расчёт; null — не оценивается. */
  level: AssessmentLevel | null;
  groups: GroupIndex[];
  directions: GroupIndex[];
  /** Наследственная (моногенная или хромосомная) болезнь — обсудить генетика. */
  genetic: boolean;
  /** Родственники знаменателя. */
  counted: FamilyMember[];
  /** Болезни есть, а списка нет — окно просит указать болезни. */
  illWithoutList: FamilyMember[];
}

function generationOf(member: FamilyMember): Generation | null {
  return RELATION_META[member.relation]?.generation ?? null;
}

/** Уровень по точной дроби num/den: сравнения в сотых без округления. */
function genealogicalLevel(scale: GenealogicalScale, num: number, den: number): AssessmentLevel {
  const below = (hundredths: number) => num * 100 < hundredths * den;
  const atMost = (hundredths: number) => num * 100 <= hundredths * den;
  if (scale === "minsk") return atMost(THRESHOLDS.minskGenealogical) ? "favorable" : "burdened";
  if (scale === "ufa") {
    if (atMost(THRESHOLDS.ufaGenealogical[0])) return "favorable";
    return atMost(THRESHOLDS.ufaGenealogical[1]) ? "conditional" : "unfavorable";
  }
  const [low, moderate, high] = THRESHOLDS.kildiyarovaGenealogical;
  if (num === 0) return "none";
  if (below(low)) return "low";
  if (below(moderate)) return "moderate";
  if (below(high)) return "pronounced";
  return "high";
}

export function assessGenealogical(input: AnamnesisInput, scale: GenealogicalScale = DEFAULT_SCALES.genealogical): GenealogicalAssessment {
  const blood = input.family.filter((member) => RELATION_META[member.relation]?.blood);
  const counted = blood.filter(
    (member) => member.healthStatus === "healthy" || (member.healthStatus === "ill" && (member.diseases?.length ?? 0) > 0),
  );
  const illWithoutList = blood.filter((member) => member.healthStatus === "ill" && !(member.diseases?.length ?? 0));
  const numerator = counted.reduce((sum, member) => sum + (member.healthStatus === "ill" ? member.diseases.length : 0), 0);
  const denominator = counted.length;
  // Поколение III — ребёнок, засчитывается всегда.
  const generationSet = new Set<number>([3]);
  for (const member of counted) {
    const generation = generationOf(member);
    if (generation != null) generationSet.add(generation);
  }
  const generations = generationSet.size;
  const insufficient = denominator < THRESHOLDS.genealogicalMinRelatives || generations < THRESHOLDS.genealogicalMinGenerations;
  const computedLevel = denominator > 0 && !insufficient ? genealogicalLevel(scale, numerator, denominator) : null;

  const groupCounts = new Map<FamilyDiseaseGroup, number>();
  for (const member of counted) {
    if (member.healthStatus !== "ill") continue;
    for (const disease of member.diseases) {
      if (disease.group === "other") continue;
      groupCounts.set(disease.group, (groupCounts.get(disease.group) ?? 0) + 1);
    }
  }
  const groups: GroupIndex[] = FAMILY_DISEASE_GROUPS.filter((item) => groupCounts.has(item.value)).map((item) => {
    const count = groupCounts.get(item.value) ?? 0;
    return {
      group: item.value,
      count,
      index: denominator ? count / denominator : 0,
      direction: denominator > 0 && count * 100 > THRESHOLDS.directionIndex * denominator,
    };
  });
  const manual = manualOf(input.social?.genealogicalLevel, input.social?.genealogicalReason);
  return {
    scale,
    numerator,
    denominator,
    index: denominator ? numerator / denominator : null,
    generations,
    insufficient,
    computedLevel,
    manual,
    level: manual?.level ?? computedLevel,
    groups,
    directions: groups.filter((group) => group.direction),
    genetic: blood.some((member) => member.diseases?.some((disease) => disease.hereditary)),
    counted,
    illWithoutList,
  };
}

// ── §3.2 Биологический анамнез ──────────────────────────────────────────────

export type PeriodState = "factors" | "clear" | "nodata" | "notyet";

export interface BioPeriod {
  index: number;
  title: string;
  short: string;
  state: PeriodState;
  /** Сработавшие факторы — подсказка при наведении. */
  factors: string[];
}

export interface BiologicalAssessment {
  scale: BiologicalScale;
  periods: BioPeriod[];
  /** Периодов с факторами. */
  count: number;
  computedLevel: AssessmentLevel | null;
  manual: ManualAssessment | null;
  level: AssessmentLevel | null;
  /** Фактор максимальной силы, если есть. */
  strongest: Factor[];
  /** Предложить «высокую»: есть фактор максимальной силы, а расчёт ниже и ручной оценки нет. */
  suggestHigh: boolean;
}

const PERIODS: ReadonlyArray<{ title: string; short: string }> = [
  { title: "Беременность, I половина", short: "Бер. I" },
  { title: "Беременность, II половина", short: "Бер. II" },
  { title: "Роды", short: "Роды" },
  { title: "Ранний неонатальный, 0–7 сутки", short: "0–7" },
  { title: "Неонатальный, 8–28 сутки", short: "8–28" },
  { title: "После 28 суток", short: "После" },
];

const PERIOD3 = [
  "birth.cs_emergency",
  "birth.aids",
  "birth.breech",
  "birth.rapid",
  "birth.prolonged",
  "birth.long_rupture",
  "birth.weak_labor",
  "birth.early_rupture",
  "birth.abruption",
  "birth.cord",
  "birth.bleeding",
  "birth.abnormal_fluid",
  "birth.fever",
  "birth.chorioamnionitis",
  "birth.out_of_hospital",
  "nb.apgar_moderate",
  "nb.apgar_severe",
  "nb.cry_late",
  "nb.resuscitation",
  "dx.birth_trauma",
  "birth.preterm",
  "birth.post_term",
];
const PERIOD4 = ["nb.jaundice_pathological", "nb.jaundice_day1", "nb.weight_loss", "nb.transfer", "nb.exchange_transfusion"];
const PERIOD5 = ["nb.jaundice_prolonged"];
const PERIOD6 = ["feed.early_switch", "ill.frequent", "dx.anemia", "dx.rickets", "dx.malnutrition"];
const STRONGEST = ["nb.apgar_severe", "nb.resuscitation", "dx.birth_trauma", "dx.seizures", "dx.ivh"];

function biologicalLevel(scale: BiologicalScale, count: number): AssessmentLevel {
  if (scale === "minsk") return count === 0 ? "favorable" : count === 1 ? "conditional" : "unfavorable";
  if (count === 0) return "none";
  if (count === 1) return "low";
  if (count === 2) return "moderate";
  if (count <= 4) return "pronounced";
  return "high";
}

export function assessBiological(
  input: AnamnesisInput,
  at: string,
  settings: AnamnesisSettings = DEFAULT_SETTINGS,
  factorsInput?: Factor[],
): BiologicalAssessment {
  const scale = settings.scales.biological;
  const factors = factorsInput ?? anamnesisFactors(input, at, settings);
  const has = (code: string) => factors.find((factor) => factor.code === code);
  const p = input.perinatal;
  const profile = input.profile;
  const lists: string[][] = [[], [], [], [], [], []];
  const push = (period: number, text: string) => {
    if (!lists[period].includes(text)) lists[period].push(text);
  };

  // Беременность: каждый пункт осложнений и инфекций — по своей половине; лёгкий токсикоз не фактор.
  for (const item of p?.complications ?? []) {
    if (item.code === "toxicosis" && item.severity === "mild") continue;
    const meta = COMPLICATIONS[item.code];
    const name = item.code === "other" ? item.note || meta.label : meta.label;
    const term = termText(item);
    const text = term ? `${name} (${term})` : name;
    for (const half of termHalves(item, meta.half)) push(half - 1, text);
  }
  for (const item of p?.infections ?? []) {
    const meta = INFECTIONS[item.code];
    const name = item.code === "other" ? item.note || "Инфекция" : meta.label;
    const term = termText(item);
    const text = term ? `${name} (${term})` : name;
    for (const half of termHalves(item, 1)) push(half - 1, text);
  }
  for (const disease of p?.maternalDiseases ?? []) {
    const meta = MATERNAL_DISEASES[disease.code];
    push(0, `У матери: ${disease.code === "other" ? disease.note || "хроническая болезнь" : meta.nominative}`);
  }
  for (const code of ["preg.art", "preg.smoking", "preg.alcohol", "preg.drugs", "mother.hazards"]) {
    const factor = has(code);
    if (factor) push(0, factorText(factor));
  }
  const multiple = has("preg.multiple");
  if (multiple) push(1, factorText(multiple));
  for (const code of PERIOD3) {
    const factor = has(code);
    if (factor) push(2, factorText(factor));
  }
  if (p) {
    for (const code of p.deliveryComplications ?? []) {
      if (code === "stimulation") push(2, "Родостимуляция");
      if (code === "other") push(2, p.deliveryComplicationsNote ? `Осложнение родов: ${p.deliveryComplicationsNote}` : "Другое осложнение родов");
    }
  }
  for (const code of PERIOD4) {
    const factor = has(code);
    if (factor) push(3, factorText(factor));
  }
  for (const code of PERIOD5) {
    const factor = has(code);
    if (factor) push(4, factorText(factor));
  }
  for (const code of PERIOD6) {
    const factor = has(code);
    if (factor) push(5, factorText(factor));
  }
  // Диагнозы с кодом P (кроме родовой травмы — она в «Родах») и госпитализации по дню жизни.
  const birth = input.birthDate;
  if (birth) {
    for (const condition of input.conditions) {
      if (!condition.diagnosedOn || !inRubrics(condition.diagnosisCode, "P00", "P96") || inRubrics(condition.diagnosisCode, "P10", "P15")) continue;
      if (dayjs(condition.diagnosedOn).isAfter(dayjs(at), "day")) continue;
      const day = dayjs(condition.diagnosedOn).diff(dayjs(birth), "day") + 1;
      const text = `${condition.title} (${condition.diagnosisCode})`;
      if (day >= 1 && day <= 7) push(3, text);
      else if (day >= 8 && day <= 28) push(4, text);
    }
    for (const stay of input.hospitalizations) {
      const day = dayjs(stay.admittedOn).diff(dayjs(birth), "day") + 1;
      if (day >= 8 && day <= 28) push(4, `Госпитализация ${dateText(stay.admittedOn)}`);
    }
  }

  // Есть ли сведения о периоде (для 1–4) и наступил ли он (для 5–6).
  const mother = input.family.find((member) => member.relation === "mother");
  const pregnancyKnown1 =
    p != null &&
    (p.complications != null ||
      p.infections != null ||
      p.maternalDiseases != null ||
      p.motherSmoking != null ||
      p.motherAlcohol != null ||
      p.motherDrugs != null ||
      p.conception !== "" ||
      mother?.hasOccupationalHazards != null);
  const pregnancyKnown2 = p != null && (p.complications != null || p.infections != null || p.multiplePregnancy != null);
  const birthKnown =
    (profile?.gestationalAgeWeeks ?? null) != null ||
    Boolean(profile?.deliveryType) ||
    (profile?.apgar1min ?? null) != null ||
    (profile?.apgar5min ?? null) != null ||
    (p != null &&
      (p.presentation !== "" ||
        p.obstetricAids != null ||
        p.laborDurationHours != null ||
        p.ruptureIntervalHours != null ||
        p.deliveryComplications != null ||
        p.birthPlace !== "" ||
        p.firstCry !== "" ||
        p.resuscitation != null));
  const newbornKnown = (p != null && (p.jaundice !== "" || p.neonatalTransfer !== "" || p.dischargeWeightG != null)) || lists[3].length > 0;
  const age = ageParts(birth, at);
  const dayOfLife = age ? age.totalDays + 1 : null;
  const known = [pregnancyKnown1 || lists[0].length > 0, pregnancyKnown2 || lists[1].length > 0, birthKnown || lists[2].length > 0, newbornKnown];

  const periods: BioPeriod[] = PERIODS.map((period, index) => {
    let state: PeriodState;
    if (lists[index].length) state = "factors";
    else if (index <= 3) state = known[index] ? "clear" : "nodata";
    else if (dayOfLife != null && dayOfLife < (index === 4 ? 8 : 29)) state = "notyet";
    else state = "clear";
    return { index: index + 1, title: period.title, short: period.short, state, factors: lists[index] };
  });
  const count = periods.filter((period) => period.state === "factors").length;
  const anyKnown = periods.some((period) => period.state === "factors" || (period.state === "clear" && period.index <= 4));
  const computedLevel = anyKnown ? biologicalLevel(scale, count) : null;
  const strongest = factors.filter((factor) => STRONGEST.includes(factor.code));
  const hdn = has("dx.hdn");
  const exchange = has("nb.exchange_transfusion");
  if (hdn && exchange) strongest.push(hdn, exchange);
  const manual = manualOf(input.social?.biologicalLevel, input.social?.biologicalReason);
  const top = scale === "minsk" ? "unfavorable" : "high";
  return {
    scale,
    periods,
    count,
    computedLevel,
    manual,
    level: manual?.level ?? computedLevel,
    strongest,
    suggestHigh: strongest.length > 0 && !manual && computedLevel !== top,
  };
}

// ── §3.3 Социальный анамнез ─────────────────────────────────────────────────

export interface SocialAssessment {
  scale: SocialScale;
  params: SocialParam[];
  riskCount: number;
  unknownCount: number;
  computedLevel: AssessmentLevel | null;
  manual: ManualAssessment | null;
  level: AssessmentLevel | null;
  /** Все 8 неизвестны — «не оценивался». */
  notAssessed: boolean;
  /** Без права на закрытые сведения — «часть сведений закрыта». */
  restricted: boolean;
}

function socialLevel(scale: SocialScale, risk: number): AssessmentLevel {
  if (scale === "binary") return risk === 0 ? "favorable" : "unfavorable";
  if (risk === 0) return "favorable";
  if (risk <= 2) return "low";
  if (risk <= 4) return "moderate";
  if (risk <= 6) return "pronounced";
  return "high";
}

export function assessSocial(
  input: AnamnesisInput,
  options: { canSeeSensitive: boolean },
  scale: SocialScale = DEFAULT_SCALES.social,
): SocialAssessment {
  const params = socialParameters(input, { withSensitive: options.canSeeSensitive && input.sensitive != null });
  const riskCount = params.filter((param) => param.state === "risk").length;
  const unknownCount = params.filter((param) => param.state === "unknown").length;
  const notAssessed = unknownCount === params.length;
  const computedLevel = notAssessed ? null : socialLevel(scale, riskCount);
  const manual = manualOf(input.social?.socialLevel, input.social?.socialReason);
  return {
    scale,
    params,
    riskCount,
    unknownCount,
    computedLevel,
    manual,
    level: manual?.level ?? computedLevel,
    notAssessed,
    restricted: !options.canSeeSensitive,
  };
}

// ── §3.4 Группы риска ───────────────────────────────────────────────────────

const MOTHER_HABITS = ["preg.smoking", "preg.alcohol", "preg.drugs"];

/** Группа → её факторы (справка §3.2, ТЗ §3.4). */
export const GROUP_FACTORS: Record<RiskGroup, ReadonlyArray<string>> = {
  cns: [
    "mother.age_lt16",
    "mother.age_gt40",
    ...MOTHER_HABITS,
    "mother.hazards",
    "preg.mother_hypertension",
    "preg.mother_heart",
    "preg.mother_kidney",
    "preg.mother_thyroid",
    "preg.mother_neuro",
    "preg.diabetes",
    "preg.anemia",
    "preg.toxicosis_severe",
    "preg.preeclampsia",
    "preg.threat",
    "preg.polyhydramnios",
    "preg.multiple",
    "preg.infection_t1",
    "preg.hypoxia",
    "preg.isoimmunization",
    "preg.art",
    "birth.rapid",
    "birth.prolonged",
    "birth.weak_labor",
    "birth.early_rupture",
    "birth.aids",
    "birth.cs_emergency",
    "birth.abruption",
    "birth.cord",
    "nb.cry_late",
    "nb.resuscitation",
    "nb.apgar_low",
    "birth.preterm",
    "birth.post_term",
    "nb.macrosomia",
    "nb.jaundice_prolonged",
    "nb.jaundice_pathological",
    "dx.hdn",
    "dx.birth_trauma",
  ],
  infection: [
    "preg.mother_chronic_infection",
    "preg.genital",
    "birth.long_rupture",
    "preg.placental",
    "preg.threat",
    "preg.infection_t3",
    "birth.fever",
    "birth.chorioamnionitis",
    "birth.abnormal_fluid",
    "birth.preterm",
    "preg.fgr",
    "birth.cs",
    "birth.out_of_hospital",
    "birth.post_term",
    "preg.oligohydramnios",
    "preg.gbs",
  ],
  trophic_endocrine: [
    "preg.mother_hypertension",
    "preg.mother_heart",
    "preg.mother_thyroid",
    "preg.mother_obesity",
    "preg.diabetes",
    "preg.anemia",
    "mother.hazards",
    ...MOTHER_HABITS,
    "preg.preeclampsia",
    "mother.age_gt30",
    "preg.order4",
    "preg.short_interval",
    "birth.preterm",
    "preg.multiple",
    "preg.fgr",
    "nb.macrosomia",
    "feed.early_switch",
    "ill.frequent",
  ],
  malformations: [
    "mother.age_gt35",
    "father.age_gt40",
    "fam.consanguineous",
    "fam.malformation",
    "fam.genetic",
    "mother.hazards",
    "preg.toxicosis_severe",
    "preg.threat_early",
    "preg.diabetes",
    "preg.alcohol",
    "preg.infection_t1",
    "preg.rubella_t1",
    "preg.polyhydramnios",
  ],
  allergic: ["fam.allergy", "preg.preeclampsia", "birth.preterm", "feed.early_switch"],
  social: [
    "soc.incomplete",
    "soc.large",
    "soc.low_income",
    "soc.housing",
    "mother.age_lt18",
    "fam.infant_death",
    "soc.migration",
    "sensitive.asocial",
  ],
  hearing: [
    "fam.hearing",
    "preg.torch",
    "preg.flu",
    "preg.toxicosis_severe",
    "preg.preeclampsia",
    "nb.apgar_severe",
    "nb.resuscitation",
    "dx.birth_trauma",
    "nb.bilirubin_high",
    "dx.hdn",
    "nb.vlbw",
    "birth.very_preterm",
    "birth.post_term",
    "dx.craniofacial",
  ],
  anemia: [
    "preg.placental",
    "preg.multiple",
    "birth.preterm",
    "preg.anemia",
    "birth.bleeding",
    "nb.macrosomia",
    "fam.anemia",
    "nb.exchange_transfusion",
    "dx.hdn",
    "preg.preeclampsia",
  ],
  sids: [
    "soc.climate",
    "soc.housing",
    "soc.incomplete",
    "fam.parents_habits",
    "soc.smoking_home",
    "soc.low_education",
    "mother.age_lt18",
    "birth.preterm",
    "nb.lt2000",
    "dx.acute_first3m",
    "dx.vital_malformation",
    "fam.infant_death",
  ],
  frequent_ari: ["ill.frequent"],
};

/** Когда предлагать снять (возраст в месяцах); null — по решению врача. */
export const GROUP_REMOVAL_MONTHS: Partial<Record<RiskGroup, number>> = { cns: 12, infection: 3, anemia: 12, sids: 12 };

/** Сработавшие факторы группы. */
export function groupFactors(group: RiskGroup, factors: ReadonlyArray<Factor>): Factor[] {
  const codes = GROUP_FACTORS[group];
  return factors.filter((factor) => {
    if (!codes.includes(factor.code)) return false;
    // Для ВПР выраженный токсикоз — только до 20 нед.
    if (group === "malformations" && factor.code === "preg.toxicosis_severe") return (factor.halves ?? [1]).includes(1);
    return true;
  });
}

export interface RiskSuggestion {
  group: RiskGroup;
  factors: Factor[];
}

/**
 * Предложения групп (ТЗ §3.4): у группы есть фактор и нет записи (кроме
 * ошибочной), чьё основание уже содержит все текущие факторы; при действующей
 * записи группа не предлагается. Ничего не ставится само.
 */
export function suggestRiskGroups(
  input: AnamnesisInput,
  at: string,
  settings: AnamnesisSettings = DEFAULT_SETTINGS,
  factorsInput?: Factor[],
): RiskSuggestion[] {
  const factors = factorsInput ?? anamnesisFactors(input, at, settings);
  const suggestions: RiskSuggestion[] = [];
  for (const group of RISK_GROUP_ORDER) {
    const current = groupFactors(group, factors);
    if (!current.length) continue;
    const records = input.riskGroups.filter((record) => record.group === group && record.status !== "refuted");
    if (records.some((record) => record.status === "active")) continue;
    const covered = records.some((record) => current.every((factor) => record.basis.includes(factor.code)));
    if (covered) continue;
    suggestions.push({ group, factors: current });
  }
  return suggestions;
}

/** Состояние записи на дату: позже установленная не видна, закрытая позже — ещё действует. */
export function recordStatusAt(record: RiskGroupRecord, at: string): RiskGroupRecord["status"] | null {
  if (record.establishedOn && dayjs(record.establishedOn).isAfter(dayjs(at), "day")) return null;
  if ((record.status === "removed" || record.status === "realized") && record.closedOn && dayjs(record.closedOn).isAfter(dayjs(at), "day")) {
    return "active";
  }
  return record.status;
}

// ── Пересмотры ──────────────────────────────────────────────────────────────

export interface ReviewTerm {
  months: number;
  date: string;
  /** «3 мес», «1 год». */
  label: string;
}

export type ReviewState = "planned" | "soon" | "overdue";

export interface ReviewPlan {
  /** Плановые сроки позже установки (до 18 лет). */
  terms: ReviewTerm[];
  next: ReviewTerm | null;
  state: ReviewState | null;
  /** Подсказка при пересмотре: «можно снимать: ВУИ — с 3 мес». */
  removalHint: string | null;
}

export function termLabel(months: number): string {
  if (months < 12) return `${months} мес`;
  const years = Math.floor(months / 12);
  return `${years} ${plural(years, "год", "года", "лет")}`;
}

/** Возрастные сроки пересмотра: 1, 3, 6, 12 мес, дальше раз в год [П]. */
export function reviewTerms(birthDate: string): ReviewTerm[] {
  const months: number[] = [...THRESHOLDS.reviewMonths];
  for (let year = 2; year <= 18; year += 1) months.push(year * 12);
  return months.map((value) => ({ months: value, date: dayjs(birthDate).add(value, "month").format("YYYY-MM-DD"), label: termLabel(value) }));
}

export function reviewPlan(
  record: Pick<RiskGroupRecord, "group" | "establishedOn" | "reviews" | "status">,
  birthDate: string | null,
  at: string,
  options: { frequentIll?: boolean } = {},
): ReviewPlan {
  if (!birthDate) return { terms: [], next: null, state: null, removalHint: null };
  const established = record.establishedOn ? dayjs(record.establishedOn) : null;
  const terms = reviewTerms(birthDate).filter((term) => !established || dayjs(term.date).isAfter(established, "day"));
  const lastReview = record.reviews.reduce<string | null>(
    (latest, review) => (!latest || dayjs(review.reviewedOn).isAfter(dayjs(latest)) ? review.reviewedOn : latest),
    null,
  );
  const after = lastReview ? dayjs(lastReview) : established;
  const next = record.status === "active" ? terms.find((term) => !after || dayjs(term.date).isAfter(after, "day")) ?? null : null;
  let state: ReviewState | null = null;
  if (next) {
    const now = dayjs(at).startOf("day");
    const due = dayjs(next.date);
    if (now.isAfter(due.add(THRESHOLDS.reviewOverdueDays, "day"))) state = "overdue";
    else if (!now.isBefore(due.subtract(THRESHOLDS.reviewSoonDays, "day"))) state = "soon";
    else state = "planned";
  }
  const age = ageParts(birthDate, at);
  let removalHint: string | null = null;
  const removalMonths = GROUP_REMOVAL_MONTHS[record.group];
  const name = RISK_GROUP_META[record.group].short;
  if (removalMonths != null && age && age.totalMonths >= removalMonths) {
    removalHint = `можно снимать: ${name} — с ${removalMonths} мес`;
  }
  if (record.group === "frequent_ari" && options.frequentIll === false) {
    removalHint = `можно снимать: ${name} — порог часто болеющего не достигнут`;
  }
  return { terms, next, state, removalHint };
}

// ── §3.5 Флаги ──────────────────────────────────────────────────────────────

export interface AnamnesisFlag {
  code: string;
  text: string;
  severity: "warning" | "info";
}

export function anamnesisFlags(
  input: AnamnesisInput,
  at: string,
  settings: AnamnesisSettings = DEFAULT_SETTINGS,
  factorsInput?: Factor[],
): AnamnesisFlag[] {
  const factors = factorsInput ?? anamnesisFactors(input, at, settings);
  const flags: AnamnesisFlag[] = [];
  const birth = input.birthDate;
  const age = ageParts(birth, at);
  const frequent = frequentIllness(input, at, THRESHOLDS);

  // Пересмотр группы скоро или просрочен
  for (const record of input.riskGroups) {
    if (record.status !== "active") continue;
    const plan = reviewPlan(record, birth, at, { frequentIll: frequent?.isFrequent });
    if (!plan.next || (plan.state !== "soon" && plan.state !== "overdue")) continue;
    const name = RISK_GROUP_META[record.group].short;
    flags.push({
      code: `review.${record.group}`,
      severity: "warning",
      text:
        plan.state === "overdue"
          ? `Пересмотр группы «${name}» просрочен — ${plan.next.label}, срок ${dateText(plan.next.date)}`
          : `Пересмотр группы «${name}» — ${plan.next.label}, до ${dateText(plan.next.date)}`,
    });
  }

  // Слух: последний скрининг не пройден или не проведён, или родился вне роддома без скрининга
  const hearing = [...input.screenings]
    .filter((row) => row.kind === "hearing")
    .sort((a, b) => (a.performedOn ?? a.createdAt).localeCompare(b.performedOn ?? b.createdAt));
  const lastHearing = hearing[hearing.length - 1];
  const outOfHospital = input.perinatal?.birthPlace === "home" || input.perinatal?.birthPlace === "in_transit";
  const failed = lastHearing && [lastHearing.rightEar, lastHearing.leftEar].some((ear) => ear === "refer" || ear === "not_done");
  if (failed || (!lastHearing && outOfHospital)) {
    const until = birth ? dayjs(birth).add(THRESHOLDS.hearingRetestWeeks, "week").format("YYYY-MM-DD") : null;
    // Срок 4–6 нед прошёл — повторить всё равно нужно, но без даты «до …» в прошлом.
    const passed = until != null && dayjs(at).isAfter(dayjs(until), "day");
    flags.push({
      code: "hearing.retest",
      severity: "warning",
      text: passed
        ? "Слух: повторить ОАЭ и ABR — срок 4–6 нед прошёл"
        : `Слух: повторить ОАЭ и ABR в 4–6 нед${until ? ` (до ${dateText(until)})` : ""}`,
    });
  }
  const hearingFactors = groupFactors("hearing", factors);
  const abrDone = input.screenings.some((row) => row.kind === "hearing" && (row.method === "abr" || row.stage === "abr"));
  if (hearingFactors.length && !abrDone) {
    flags.push({
      code: "hearing.abr",
      severity: "warning",
      text: "Есть факторы риска тугоухости — ABR в 3–4 мес независимо от скрининга",
    });
  }

  // Неонатальный скрининг
  if (age && age.totalDays > THRESHOLDS.neonatalScreeningDays && !input.screenings.some((row) => row.kind === "neonatal")) {
    flags.push({ code: "screening.neonatal", severity: "info", text: "Нет сведений о неонатальном скрининге" });
  }

  // Апгар на 10-й минуте
  const apgar5 = input.profile?.apgar5min ?? null;
  if (apgar5 != null && apgar5 < 7 && input.perinatal?.apgar10min == null) {
    flags.push({ code: "apgar10", severity: "info", text: "Укажите оценку по Апгар на 10-й минуте" });
  }

  // Наследственное заболевание
  if (factors.some((factor) => factor.code === "fam.genetic")) {
    flags.push({ code: "genetic", severity: "warning", text: "Наследственное заболевание в семье — обсудить консультацию генетика" });
  }

  // Риск значительной желтухи у новорождённого до 14 дней
  if (age && age.totalDays < THRESHOLDS.jaundiceRiskDays) {
    const weeks = input.profile?.gestationalAgeWeeks ?? null;
    const day1 = input.perinatal?.jaundiceFirstDay === true;
    if (day1 || (weeks != null && weeks < THRESHOLDS.jaundiceRiskWeeks)) {
      flags.push({ code: "jaundice.risk", severity: "warning", text: "Риск значительной желтухи" });
    }
  }
  return flags;
}

// ── §3.6 «Заполнено N из 19» ────────────────────────────────────────────────

/** Окно заполнения пункта; порядок «Заполнить»: perinatal → newborn → screening → social. */
export type FillTarget = "pregnancy" | "birth" | "newborn" | "screening" | "heredity" | "social";

export interface CompletenessItem {
  index: number;
  title: string;
  filled: boolean;
  target: FillTarget;
}

export interface Completeness {
  filled: number;
  total: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
}

/** Закрытые сведения не считаются: цифра не зависит от прав. */
export function completeness(input: AnamnesisInput): Completeness {
  const p = input.perinatal;
  const profile = input.profile;
  const social = socialParameters({ ...input, sensitive: null }, { withSensitive: false });
  const genealogy = assessGenealogical(input);
  const item = (index: number, title: string, filled: boolean, target: FillTarget): CompletenessItem => ({ index, title, filled, target });
  const items: CompletenessItem[] = [
    item(1, "Какая беременность", p?.pregnancyNumber != null, "pregnancy"),
    item(2, "Какие роды", p?.birthNumber != null, "pregnancy"),
    item(3, "Осложнения беременности", p?.complications != null, "pregnancy"),
    item(4, "Инфекции при беременности", p?.infections != null, "pregnancy"),
    item(5, "Хронические болезни матери", p?.maternalDiseases != null, "pregnancy"),
    item(6, "Привычки матери при беременности", p != null && p.motherSmoking != null && p.motherAlcohol != null && p.motherDrugs != null, "pregnancy"),
    item(7, "Срок гестации", profile?.gestationalAgeWeeks != null, "birth"),
    item(8, "Способ родов", Boolean(profile?.deliveryType), "birth"),
    item(9, "Безводный период", p?.ruptureIntervalHours != null, "birth"),
    item(10, "Осложнения родов", p?.deliveryComplications != null, "birth"),
    item(
      11,
      "Масса, длина и окружность головы",
      profile?.birthWeightG != null && profile?.birthLengthCm != null && profile?.birthHeadCircumferenceCm != null,
      "newborn",
    ),
    item(12, "Апгар на 1-й и 5-й минуте", profile?.apgar1min != null && profile?.apgar5min != null, "newborn"),
    item(13, "Закричал(а)", Boolean(p?.firstCry), "newborn"),
    item(14, "Дата выписки и масса при выписке", Boolean(profile?.maternityDischargedOn) && p?.dischargeWeightG != null, "newborn"),
    item(15, "Желтуха", Boolean(p?.jaundice), "newborn"),
    item(16, "Неонатальный скрининг", input.screenings.some((row) => row.kind === "neonatal"), "screening"),
    item(17, "Аудиологический скрининг", input.screenings.some((row) => row.kind === "hearing"), "screening"),
    item(18, "Родословная без пометки «мало сведений»", !genealogy.insufficient, "heredity"),
    item(19, "Все 8 параметров быта", social.every((param) => param.state !== "unknown"), "social"),
  ];
  const missing = items.filter((entry) => !entry.filled);
  return { filled: items.length - missing.length, total: items.length, items, missing };
}

const FILL_ORDER: ReadonlyArray<FillTarget> = ["pregnancy", "birth", "newborn", "screening", "social", "heredity"];

/** Первое окно с пустыми пунктами (5.1 → 5.2 → 5.3 → 5.4); всё заполнено — null. */
export function firstFillTarget(result: Completeness): FillTarget | null {
  for (const target of FILL_ORDER) {
    if (result.missing.some((entry) => entry.target === target)) return target;
  }
  return null;
}

/** Плоские генерации для подписи «родословная · 3 поколения». */
export function generationsLabel(count: number): string {
  return `${count} ${plural(count, "поколение", "поколения", "поколений")}`;
}
