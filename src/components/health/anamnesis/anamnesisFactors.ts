import dayjs from "dayjs";

import type {
  FamilyMember,
  ParentEducation,
  PregnancyComplication,
  PregnancyInfection,
  Trimester,
} from "../../../api/health";
import {
  CLIMATE,
  COMPLICATIONS,
  EDUCATION,
  FAMILY_COMPOSITION,
  HOUSING,
  INCOME,
  RELATION_META,
  SANITARY,
  type AnamnesisInput,
  type Half,
  type Option,
} from "./anamnesisTypes";
import { MALFORMATION_CODES } from "./familyDiseases";
import { ageParts, fullYears, lowerFirst, plural } from "./russian";

/**
 * Факторы анамнеза (ТЗ §3.4): каждый — код, коды пишутся в основание группы
 * риска. Пороги приходят параметром — их значения в одном месте,
 * `THRESHOLDS` в `anamnesisRules.ts`.
 */

export type FactorSource =
  | "pregnancy"
  | "parents"
  | "birth"
  | "newborn"
  | "diagnoses"
  | "feeding"
  | "family"
  | "social"
  | "sensitive";

export interface Factor {
  code: string;
  /** Подробности для «Почему»: «10 нед», «31 год», «мать: атопический дерматит». */
  detail: string;
  source: FactorSource;
  /** Половины беременности, к которым относится фактор (для ВПР — «до 20 нед»). */
  halves?: Half[];
}

export interface FactorThresholds {
  ruptureHours: number;
  malformationMotherAge: number;
  rapidLaborPrimipara: number;
  rapidLaborMultipara: number;
  prolongedLaborPrimipara: number;
  prolongedLaborMultipara: number;
  pretermWeeks: number;
  veryPretermWeeks: number;
  postTermWeeks: number;
  weightLossPercent: number;
  bilirubinHigh: number;
  shortBirthIntervalMonths: number;
  earlySwitchMonths: number;
  largeFamilyChildren: number;
  threatEarlyWeek: number;
  acuteFirstMonths: number;
  exchangeTransfusionDays: number;
  /** Порог «часто болеющего»: ОРЗ за 12 мес по полным годам (до N лет включительно). */
  frequentAri: ReadonlyArray<{ maxYears: number; count: number }>;
}

/** Подписи кодов — для основания группы, «Почему» и подсказок. */
export const FACTOR_LABELS: Record<string, string> = {
  "preg.threat": "Угроза прерывания",
  "preg.threat_early": "Угроза прерывания до 10 нед",
  "preg.toxicosis_severe": "Выраженный токсикоз",
  "preg.preeclampsia": "Преэклампсия",
  "preg.anemia": "Анемия у матери при беременности",
  "preg.placental": "Плацентарная недостаточность",
  "preg.fgr": "Задержка роста плода",
  "preg.hypoxia": "Гипоксия плода",
  "preg.polyhydramnios": "Многоводие",
  "preg.oligohydramnios": "Маловодие",
  "preg.isoimmunization": "Резус- или АВ0-иммунизация",
  "preg.diabetes": "Диабет у матери",
  "preg.infection_t1": "Инфекция в I триместре",
  "preg.infection_t3": "Инфекция или лихорадка в III триместре",
  "preg.torch": "Краснуха, ЦМВ, токсоплазмоз или герпес при беременности",
  "preg.rubella_t1": "Краснуха в I триместре",
  "preg.flu": "Грипп при беременности",
  "preg.genital": "Кольпит или инфекция мочевых путей",
  "preg.gbs": "Стрептококк группы B",
  "preg.multiple": "Многоплодная беременность",
  "preg.art": "Беременность после ВРТ",
  "preg.smoking": "Курение матери при беременности",
  "preg.alcohol": "Алкоголь при беременности",
  "preg.drugs": "Наркотики при беременности",
  "preg.mother_hypertension": "Гипертония у матери",
  "preg.mother_heart": "Порок сердца у матери",
  "preg.mother_kidney": "Болезнь почек у матери",
  "preg.mother_thyroid": "Болезнь щитовидной железы у матери",
  "preg.mother_neuro": "Болезнь нервной системы у матери",
  "preg.mother_obesity": "Ожирение у матери",
  "preg.mother_chronic_infection": "Хронические инфекции у матери",
  "preg.order4": "4-я и более беременность или роды",
  "preg.short_interval": "Короткий интервал между родами",
  "mother.age_lt16": "Матери меньше 16 лет",
  "mother.age_lt18": "Матери меньше 18 лет",
  "mother.age_gt30": "Матери больше 30 лет",
  "mother.age_gt35": "Матери больше 35 лет",
  "mother.age_gt40": "Матери больше 40 лет",
  "father.age_gt40": "Отцу больше 40 лет",
  "mother.hazards": "Профвредности у матери",
  "birth.preterm": "Недоношенность",
  "birth.very_preterm": "Глубокая недоношенность",
  "birth.post_term": "Переношенность",
  "birth.cs": "Кесарево сечение",
  "birth.cs_emergency": "Экстренное кесарево сечение",
  "birth.aids": "Акушерские пособия",
  "birth.breech": "Тазовое предлежание",
  "birth.rapid": "Стремительные роды",
  "birth.prolonged": "Затяжные роды",
  "birth.long_rupture": "Длительный безводный период",
  "birth.weak_labor": "Слабость родовой деятельности",
  "birth.early_rupture": "Преждевременное излитие вод",
  "birth.abruption": "Отслойка плаценты",
  "birth.cord": "Обвитие пуповины",
  "birth.bleeding": "Кровотечение в родах",
  "birth.abnormal_fluid": "Зелёные или зловонные воды",
  "birth.fever": "Температура матери в родах",
  "birth.chorioamnionitis": "Хориоамнионит",
  "birth.out_of_hospital": "Роды вне роддома",
  "nb.apgar_severe": "Апгар на 1-й минуте 0–3",
  "nb.apgar_moderate": "Апгар на 1-й минуте 4–7",
  "nb.apgar_low": "Апгар 7/8 и ниже",
  "nb.apgar5_lt6": "Апгар на 5-й минуте меньше 6",
  "nb.cry_late": "Закричал не сразу",
  "nb.resuscitation": "Реанимация после рождения",
  "nb.lbw": "Масса при рождении меньше 2500 г",
  "nb.vlbw": "Масса при рождении меньше 1500 г",
  "nb.elbw": "Масса при рождении меньше 1000 г",
  "nb.lt2000": "Масса при рождении меньше 2000 г",
  "nb.macrosomia": "Масса при рождении больше 4000 г",
  "nb.weight_loss": "Убыль массы к выписке больше 8 %",
  "nb.jaundice_pathological": "Патологическая желтуха",
  "nb.jaundice_prolonged": "Затяжная желтуха",
  "nb.jaundice_day1": "Желтуха в первые сутки",
  "nb.bilirubin_high": "Билирубин больше 200 мкмоль/л",
  "nb.transfer": "Перевод в реанимацию или на 2-й этап",
  "nb.exchange_transfusion": "Заменное переливание крови",
  "dx.birth_trauma": "Родовая травма",
  "dx.ivh": "Внутрижелудочковое кровоизлияние",
  "dx.seizures": "Судороги новорождённого",
  "dx.hdn": "Гемолитическая болезнь новорождённого",
  "dx.anemia": "Анемия",
  "dx.rickets": "Рахит",
  "dx.malnutrition": "Недостаточность питания",
  "dx.acute_first3m": "Острая болезнь в первые 3 месяца",
  "dx.craniofacial": "Пороки лица и черепа",
  "dx.vital_malformation": "Порок сердца или сосудов",
  "feed.early_switch": "Ранний перевод на смесь",
  "ill.frequent": "Часто болеющий ребёнок",
  "fam.allergy": "Аллергия у кровных родственников",
  "fam.hearing": "Тугоухость у кровных родственников",
  "fam.anemia": "Анемия у кровных родственников",
  "fam.malformation": "Пороки или хромосомные болезни у родственников",
  "fam.genetic": "Наследственная болезнь в семье",
  "fam.consanguineous": "Кровнородственный брак родителей",
  "fam.infant_death": "Смерть ребёнка до года в семье",
  "fam.parents_habits": "Вредные привычки у родителей",
  "soc.incomplete": "Неполная семья",
  "soc.large": "Многодетная семья",
  "soc.low_income": "Недостаточная обеспеченность",
  "soc.housing": "Плохие жилищные условия",
  "soc.climate": "Неблагоприятный климат в семье",
  "soc.migration": "Родитель работает за рубежом",
  "soc.smoking_home": "Дома курят",
  "soc.low_education": "Низкое образование родителей",
  "sensitive.asocial": "Асоциальное поведение в семье",
  "sensitive.tb_contact": "Туберкулёзный контакт",
  sensitive: "Сведения с ограниченным доступом",
};

export function factorLabel(code: string): string {
  return FACTOR_LABELS[code] ?? code;
}

/** «Угроза прерывания (10 нед)». */
export function factorText(factor: Pick<Factor, "code" | "detail">): string {
  const label = factorLabel(factor.code);
  return factor.detail ? `${label} (${factor.detail})` : label;
}

// ── Сроки беременности ──────────────────────────────────────────────────────

export function trimesterOfWeek(week: number): Trimester {
  if (week <= 13) return 1;
  if (week <= 27) return 2;
  return 3;
}

type TermItem = Pick<PregnancyComplication, "fromWeek" | "toWeek" | "trimester"> | Pick<PregnancyInfection, "week" | "trimester">;

/** Недели пункта: с — по; разовое — по = с; без недель — null. */
export function termWeeks(item: TermItem): { from: number; to: number } | null {
  const from = "fromWeek" in item ? item.fromWeek : item.week;
  if (from == null) return null;
  const to = "toWeek" in item && item.toWeek != null ? item.toWeek : from;
  return { from, to: Math.max(from, to) };
}

/** Триместры, которых касается пункт. */
export function termTrimesters(item: TermItem): Trimester[] {
  const weeks = termWeeks(item);
  if (weeks) {
    const result = new Set<Trimester>();
    for (let week = weeks.from; week <= weeks.to; week += 1) result.add(trimesterOfWeek(week));
    return [...result].sort();
  }
  return item.trimester ? [item.trimester] : [];
}

/**
 * Половины беременности пункта: I — до 20 нед включительно, II — с 21. Пункт
 * с 18 по 24 нед — в обеих; II и III триместр без недель — II половина; без
 * срока — половина из каталога.
 */
export function termHalves(item: TermItem, fallback: Half): Half[] {
  const weeks = termWeeks(item);
  if (weeks) {
    const halves: Half[] = [];
    if (weeks.from <= 20) halves.push(1);
    if (weeks.to >= 21) halves.push(2);
    return halves;
  }
  if (item.trimester) return [item.trimester === 1 ? 1 : 2];
  return [fallback];
}

const ROMAN = ["", "I", "II", "III"];

/** «10 нед», «6–12 нед», «II триместр», «» — для подробностей фактора. */
export function termText(item: TermItem): string {
  const weeks = termWeeks(item);
  if (weeks) return weeks.from === weeks.to ? `${weeks.from} нед` : `${weeks.from}–${weeks.to} нед`;
  return item.trimester ? `${ROMAN[item.trimester]} триместр` : "";
}

// ── МКБ ─────────────────────────────────────────────────────────────────────

interface Rubric {
  letter: string;
  num: number;
}

function rubric(code: string | null | undefined): Rubric | null {
  const match = /^([A-Za-z])(\d{2})/.exec((code ?? "").trim());
  return match ? { letter: match[1].toUpperCase(), num: Number(match[2]) } : null;
}

/** Код в диапазоне рубрик: `inRubrics("P12.0", "P10", "P15")`. */
export function inRubrics(code: string | null | undefined, from: string, to = from): boolean {
  const value = rubric(code);
  const start = rubric(from);
  const end = rubric(to);
  if (!value || !start || !end) return false;
  return value.letter === start.letter && value.num >= start.num && value.num <= end.num;
}

/** ОРВИ (J00–J06). */
export const isUrtiCode = (code: string | null | undefined): boolean => inRubrics(code, "J00", "J06");

/** ОРЗ для «часто болеющего»: J00–J06, J20–J22. */
export const isAriCode = (code: string | null | undefined): boolean => inRubrics(code, "J00", "J06") || inRubrics(code, "J20", "J22");

/** Острая болезнь (для «острой болезни в первые 3 мес»): инфекции, дыхание, отит, ИМП, гастроэнтерит. */
function isAcuteCode(code: string | null | undefined): boolean {
  const value = rubric(code);
  if (!value) return false;
  if (value.letter === "A" || value.letter === "B" || value.letter === "J") return true;
  return inRubrics(code, "H65", "H67") || inRubrics(code, "N10") || inRubrics(code, "N30") || inRubrics(code, "N39") || inRubrics(code, "K52");
}

// ── Семья ───────────────────────────────────────────────────────────────────

export function familyRows(input: Pick<AnamnesisInput, "family">, relation: FamilyMember["relation"]): FamilyMember[] {
  return input.family.filter((member) => member.relation === relation);
}

export function parentRow(input: Pick<AnamnesisInput, "family">, relation: "mother" | "father"): FamilyMember | null {
  return familyRows(input, relation)[0] ?? null;
}

/** Полных лет родителю на дату рождения ребёнка. */
export function parentAgeAtBirth(member: FamilyMember | null, childBirth: string | null): number | null {
  if (!member?.birthDate || !childBirth) return null;
  return fullYears(member.birthDate, childBirth);
}

export const yearsText = (years: number): string => `${years} ${plural(years, "год", "года", "лет")}`;

/** Кровные родственники (без ребёнка): входят в индекс и в рисунок. */
export function bloodRelatives(family: ReadonlyArray<FamilyMember>): FamilyMember[] {
  return family.filter((member) => RELATION_META[member.relation]?.blood);
}

const LOW_EDUCATION: ReadonlyArray<ParentEducation> = ["incomplete_secondary", "secondary"];

/** Братья и сёстры ребёнка, родные и по одному из родителей. */
export function siblingsOf(input: Pick<AnamnesisInput, "family">): FamilyMember[] {
  return input.family.filter((member) => member.relation === "sibling" || member.relation === "half_sibling");
}

// ── Параметры быта (ТЗ §3.3) ────────────────────────────────────────────────

export type ParamState = "risk" | "ok" | "unknown";

export interface SocialParam {
  index: number;
  title: string;
  state: ParamState;
  /** Почему: «семья полная», «нет даты рождения матери». */
  reason: string;
}

const label = <T extends string>(options: ReadonlyArray<Option<T>>, value: T | "" | null | undefined): string =>
  options.find((option) => option.value === value)?.label ?? "";

/**
 * Восемь параметров социального анамнеза. Без права на закрытые сведения
 * (`withSensitive: false`) асоциальное поведение не учитывается — параметр 5
 * считается только по привычкам.
 */
export function socialParameters(input: AnamnesisInput, options: { withSensitive: boolean }): SocialParam[] {
  const social = input.social;
  const mother = parentRow(input, "mother");
  const father = parentRow(input, "father");
  const parents = [mother, father].filter((row): row is FamilyMember => row != null);
  const params: SocialParam[] = [];

  // 1. Полнота семьи
  const composition = social?.familyComposition ?? "";
  params.push({
    index: 1,
    title: "Полнота семьи",
    state: !composition ? "unknown" : composition === "full" ? "ok" : "risk",
    reason: composition ? `семья: ${label(FAMILY_COMPOSITION, composition).toLowerCase()}` : "состав семьи не указан",
  });

  // 2. Возраст родителей — матери на дату рождения ребёнка
  const motherAge = parentAgeAtBirth(mother, input.birthDate);
  params.push({
    index: 2,
    title: "Возраст родителей",
    state: motherAge == null ? "unknown" : motherAge < 18 ? "risk" : "ok",
    reason: motherAge == null ? "нет даты рождения матери" : `матери при рождении ребёнка ${yearsText(motherAge)}`,
  });

  // 3. Образование и профессия
  const withEducation = parents.filter((row) => row.education);
  const hazards = parents.filter((row) => row.hasOccupationalHazards === true);
  const hazardsKnown = parents.some((row) => row.hasOccupationalHazards != null);
  const lowEducation =
    withEducation.length > 0 &&
    withEducation.length === parents.length &&
    withEducation.every((row) => LOW_EDUCATION.includes(row.education));
  let educationState: ParamState;
  let educationReason: string;
  if (!withEducation.length && !hazardsKnown) {
    educationState = "unknown";
    educationReason = "нет сведений об образовании и профвредностях";
  } else if (hazards.length || lowEducation) {
    educationState = "risk";
    educationReason = [
      lowEducation ? "образование ниже среднего профессионального" : "",
      hazards.length ? `профвредности: ${hazards.map((row) => (row.relation === "mother" ? "мать" : "отец")).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
  } else {
    educationState = "ok";
    educationReason = withEducation
      .map((row) => `${row.relation === "mother" ? "мать" : "отец"} — ${label(EDUCATION, row.education).toLowerCase()}`)
      .join(", ") || "профвредностей нет";
  }
  params.push({ index: 3, title: "Образование и профессия", state: educationState, reason: educationReason });

  // 4. Климат в семье и отношение к ребёнку
  const climate = social?.familyClimate ?? "";
  const wanted = social?.childWanted ?? null;
  let climateState: ParamState;
  if ((climate && climate !== "favorable") || wanted === false) climateState = "risk";
  else if (climate === "favorable") climateState = "ok";
  else climateState = "unknown";
  params.push({
    index: 4,
    title: "Климат и отношение к ребёнку",
    state: climateState,
    reason: [
      climate ? `климат ${label(CLIMATE, climate).toLowerCase()}` : "климат не указан",
      wanted === true ? "ребёнок желанный" : wanted === false ? "ребёнок нежеланный" : "",
    ]
      .filter(Boolean)
      .join(", "),
  });

  // 5. Привычки родителей и асоциальное поведение
  const withHabits = parents.filter((row) => (row.habits?.length ?? 0) > 0);
  const asocial = options.withSensitive ? input.sensitive?.asocialFamily ?? null : null;
  let habitState: ParamState;
  let habitReason: string;
  if (withHabits.length || asocial === true) {
    habitState = "risk";
    habitReason = [
      withHabits.length ? `вредные привычки: ${withHabits.map((row) => (row.relation === "mother" ? "мать" : "отец")).join(", ")}` : "",
      asocial === true ? "асоциальное поведение в семье" : "",
    ]
      .filter(Boolean)
      .join("; ");
  } else if (parents.length && parents.every((row) => row.habits != null && row.habits.length === 0) && (!options.withSensitive || asocial === false)) {
    habitState = "ok";
    habitReason = options.withSensitive ? "привычек и асоциального поведения нет" : "вредных привычек нет";
  } else {
    habitState = "unknown";
    habitReason = parents.length ? "не у всех родителей указаны привычки" : "нет строк матери и отца";
  }
  params.push({ index: 5, title: "Привычки и асоциальное поведение", state: habitState, reason: habitReason });

  // 6. Жильё
  const housing = social?.housing ?? "";
  params.push({
    index: 6,
    title: "Жильё",
    state: !housing ? "unknown" : housing === "room" || housing === "dormitory" || housing === "none" ? "risk" : "ok",
    reason: housing ? label(HOUSING, housing).toLowerCase() : "жильё не указано",
  });

  // 7. Материальная обеспеченность
  const income = social?.income ?? "";
  params.push({
    index: 7,
    title: "Материальная обеспеченность",
    state: !income ? "unknown" : income === "insufficient" ? "risk" : "ok",
    reason: income ? label(INCOME, income).toLowerCase() : "не указана",
  });

  // 8. Санитарно-гигиенические условия
  const sanitary = social?.sanitary ?? "";
  params.push({
    index: 8,
    title: "Санитарно-гигиенические условия",
    state: !sanitary ? "unknown" : sanitary === "unsatisfactory" ? "risk" : "ok",
    reason: sanitary ? label(SANITARY, sanitary).toLowerCase() : "не указаны",
  });

  return params;
}

// ── Факторы ─────────────────────────────────────────────────────────────────

/**
 * Все факторы из данных на дату `at` (ТЗ §3.4). Закрытые (`sensitive.*`) —
 * только когда закрытые сведения видны (`input.sensitive` не null).
 */
export function collectFactors(input: AnamnesisInput, at: string, t: FactorThresholds): Factor[] {
  const factors: Factor[] = [];
  const add = (code: string, source: FactorSource, detail = "", halves?: Half[]) => {
    const existing = factors.find((factor) => factor.code === code);
    if (existing) {
      if (detail && !existing.detail.split(", ").includes(detail)) existing.detail = existing.detail ? `${existing.detail}, ${detail}` : detail;
      if (halves) existing.halves = [...new Set([...(existing.halves ?? []), ...halves])].sort() as Half[];
      return;
    }
    factors.push({ code, detail, source, halves });
  };

  const p = input.perinatal;
  const profile = input.profile;
  const birth = input.birthDate;

  // Беременность
  if (p) {
    for (const item of p.complications ?? []) {
      const term = termText(item);
      const halves = termHalves(item, COMPLICATIONS[item.code]?.half ?? 2);
      switch (item.code) {
        case "miscarriage_threat": {
          add("preg.threat", "pregnancy", term, halves);
          const weeks = termWeeks(item);
          if (weeks && weeks.from <= t.threatEarlyWeek) add("preg.threat_early", "pregnancy", term, halves);
          break;
        }
        case "toxicosis":
          if (item.severity === "severe") add("preg.toxicosis_severe", "pregnancy", term, halves);
          break;
        case "preeclampsia":
          add("preg.preeclampsia", "pregnancy", term, halves);
          break;
        case "anemia":
          add("preg.anemia", "pregnancy", term, halves);
          break;
        case "placental_insufficiency":
          add("preg.placental", "pregnancy", term, halves);
          break;
        case "fgr":
          add("preg.fgr", "pregnancy", term, halves);
          break;
        case "fetal_hypoxia":
          add("preg.hypoxia", "pregnancy", term, halves);
          break;
        case "polyhydramnios":
          add("preg.polyhydramnios", "pregnancy", term, halves);
          break;
        case "oligohydramnios":
          add("preg.oligohydramnios", "pregnancy", term, halves);
          break;
        case "isoimmunization":
          add("preg.isoimmunization", "pregnancy", term, halves);
          break;
        case "gestational_diabetes":
          add("preg.diabetes", "pregnancy", "гестационный", halves);
          break;
        default:
          break;
      }
    }
    for (const item of p.infections ?? []) {
      const term = termText(item);
      const trimesters = termTrimesters(item);
      const halves = termHalves(item, 1);
      if (trimesters.includes(1)) add("preg.infection_t1", "pregnancy", term, halves);
      if (trimesters.includes(3)) add("preg.infection_t3", "pregnancy", term, halves);
      if (item.code === "rubella" || item.code === "cmv" || item.code === "toxoplasmosis" || item.code === "herpes") {
        add("preg.torch", "pregnancy", term, halves);
      }
      if (item.code === "rubella" && trimesters.includes(1)) add("preg.rubella_t1", "pregnancy", term, halves);
      if (item.code === "flu") add("preg.flu", "pregnancy", term, halves);
      if (item.code === "colpitis" || item.code === "uti") add("preg.genital", "pregnancy", term, halves);
      if (item.code === "gbs") add("preg.gbs", "pregnancy", term, halves);
    }
    for (const disease of p.maternalDiseases ?? []) {
      const code = {
        hypertension: "preg.mother_hypertension",
        heart_defect: "preg.mother_heart",
        kidney: "preg.mother_kidney",
        thyroid: "preg.mother_thyroid",
        neuro: "preg.mother_neuro",
        obesity: "preg.mother_obesity",
        chronic_infection: "preg.mother_chronic_infection",
        diabetes: "preg.diabetes",
        other: "",
      }[disease.code];
      if (code) add(code, "pregnancy", disease.code === "diabetes" ? "сахарный" : disease.note, [1]);
    }
    if (p.multiplePregnancy === true) add("preg.multiple", "pregnancy", p.fetusCount ? `плодов: ${p.fetusCount}` : "", [2]);
    if (p.conception === "art") add("preg.art", "pregnancy", "", [1]);
    if (p.motherSmoking === true) add("preg.smoking", "pregnancy", p.motherCigarettesPerDay ? `${p.motherCigarettesPerDay} в день` : "", [1]);
    if (p.motherAlcohol === true) add("preg.alcohol", "pregnancy", "", [1]);
    if (p.motherDrugs === true) add("preg.drugs", "pregnancy", "", [1]);
    if ((p.pregnancyNumber ?? 0) >= 4 || (p.birthNumber ?? 0) >= 4) {
      add("preg.order4", "pregnancy", [p.pregnancyNumber ? `беременность ${p.pregnancyNumber}` : "", p.birthNumber ? `роды ${p.birthNumber}` : ""].filter(Boolean).join(", "));
    }
  }

  // Короткий интервал: предыдущие роды той же матери меньше чем за 21 мес
  if (birth) {
    for (const sibling of siblingsOf(input)) {
      if (sibling.relation === "half_sibling" && sibling.line !== "maternal") continue;
      if (!sibling.birthDate || !dayjs(sibling.birthDate).isBefore(dayjs(birth))) continue;
      const months = dayjs(birth).diff(dayjs(sibling.birthDate), "month");
      if (months < t.shortBirthIntervalMonths) add("preg.short_interval", "pregnancy", `${months} мес`);
    }
  }

  // Родители: возраст на дату рождения ребёнка, профвредности матери
  const mother = parentRow(input, "mother");
  const father = parentRow(input, "father");
  const motherAge = parentAgeAtBirth(mother, birth);
  if (motherAge != null) {
    const detail = yearsText(motherAge);
    if (motherAge < 16) add("mother.age_lt16", "parents", detail);
    if (motherAge < 18) add("mother.age_lt18", "parents", detail);
    if (motherAge > 30) add("mother.age_gt30", "parents", detail);
    if (motherAge > t.malformationMotherAge) add("mother.age_gt35", "parents", detail);
    if (motherAge > 40) add("mother.age_gt40", "parents", detail);
  }
  const fatherAge = parentAgeAtBirth(father, birth);
  if (fatherAge != null && fatherAge > 40) add("father.age_gt40", "parents", yearsText(fatherAge));
  if (mother?.hasOccupationalHazards === true) add("mother.hazards", "parents", mother.occupationalHazards, [1]);

  // Роды
  const weeks = profile?.gestationalAgeWeeks ?? null;
  if (weeks != null) {
    const ga = `${weeks} нед`;
    if (weeks < t.pretermWeeks) add("birth.preterm", "birth", ga);
    if (weeks < t.veryPretermWeeks) add("birth.very_preterm", "birth", ga);
    if (weeks >= t.postTermWeeks) add("birth.post_term", "birth", ga);
  }
  if (profile?.deliveryType === "cesarean") add("birth.cs", "birth", p?.cesareanKind === "emergency" ? "экстренное" : p?.cesareanKind === "planned" ? "плановое" : "");
  if (profile?.deliveryType === "cesarean" && p?.cesareanKind === "emergency") add("birth.cs_emergency", "birth", p.cesareanIndication);
  if (p) {
    if ((p.obstetricAids ?? []).length) add("birth.aids", "birth");
    if (p.presentation === "breech") add("birth.breech", "birth");
    const hours = p.laborDurationHours;
    if (hours != null) {
      const parity = p.birthNumber;
      // Повторность неизвестна — только то, что верно при любой.
      const rapid = parity === 1 ? t.rapidLaborPrimipara : t.rapidLaborMultipara;
      const prolonged = parity != null && parity >= 2 ? t.prolongedLaborMultipara : t.prolongedLaborPrimipara;
      const text = `${String(hours).replace(".", ",")} ч`;
      if (hours < rapid) add("birth.rapid", "birth", text);
      if (hours > prolonged) add("birth.prolonged", "birth", text);
    }
    if (p.ruptureIntervalHours != null && p.ruptureIntervalHours >= t.ruptureHours) {
      add("birth.long_rupture", "birth", `${String(p.ruptureIntervalHours).replace(".", ",")} ч`);
    }
    const deliveryCodes: Record<string, string> = {
      weak_labor: "birth.weak_labor",
      early_rupture: "birth.early_rupture",
      placental_abruption: "birth.abruption",
      cord_entanglement: "birth.cord",
      bleeding: "birth.bleeding",
      abnormal_fluid: "birth.abnormal_fluid",
      maternal_fever: "birth.fever",
      chorioamnionitis: "birth.chorioamnionitis",
    };
    for (const code of p.deliveryComplications ?? []) {
      if (deliveryCodes[code]) add(deliveryCodes[code], "birth");
    }
    if (p.birthPlace === "home" || p.birthPlace === "in_transit") add("birth.out_of_hospital", "birth", p.birthPlace === "home" ? "дома" : "в пути");
  }

  // Новорождённый
  const points = (value: number) => `${value} ${plural(value, "балл", "балла", "баллов")}`;
  const apgar1 = profile?.apgar1min ?? null;
  const apgar5 = profile?.apgar5min ?? null;
  if (apgar1 != null && apgar1 <= 3) add("nb.apgar_severe", "newborn", points(apgar1));
  if (apgar1 != null && apgar1 >= 4 && apgar1 <= 7) add("nb.apgar_moderate", "newborn", points(apgar1));
  if ((apgar1 != null && apgar1 <= 7) || (apgar5 != null && apgar5 <= 8)) {
    add("nb.apgar_low", "newborn", `${apgar1 ?? "—"}/${apgar5 ?? "—"}`);
  }
  if (apgar5 != null && apgar5 < 6) add("nb.apgar5_lt6", "newborn", points(apgar5));
  if (p) {
    if (p.firstCry === "after_stimulation" || p.firstCry === "after_resuscitation") add("nb.cry_late", "newborn");
    if (p.resuscitation === true || p.firstCry === "after_resuscitation") add("nb.resuscitation", "newborn", p.resuscitationNote);
  }
  const weight = profile?.birthWeightG ?? null;
  if (weight != null) {
    const text = `${weight} г`;
    if (weight < 2500) add("nb.lbw", "newborn", text);
    if (weight < 2000) add("nb.lt2000", "newborn", text);
    if (weight < 1500) add("nb.vlbw", "newborn", text);
    if (weight < 1000) add("nb.elbw", "newborn", text);
    if (weight > 4000) add("nb.macrosomia", "newborn", text);
    const discharge = p?.dischargeWeightG ?? null;
    if (discharge != null && weight > 0) {
      const loss = ((weight - discharge) / weight) * 100;
      if (loss > t.weightLossPercent) add("nb.weight_loss", "newborn", `${String(Math.round(loss * 10) / 10).replace(".", ",")} %`);
    }
  }
  if (p) {
    if (p.jaundice === "pathological") add("nb.jaundice_pathological", "newborn");
    if (p.jaundice === "prolonged") add("nb.jaundice_prolonged", "newborn");
    if (p.jaundiceFirstDay === true && p.jaundice && p.jaundice !== "none") add("nb.jaundice_day1", "newborn");
    if (p.maxBilirubinUmol != null && p.maxBilirubinUmol > t.bilirubinHigh) add("nb.bilirubin_high", "newborn", `${p.maxBilirubinUmol} мкмоль/л`);
    if (p.neonatalTransfer === "icu" || p.neonatalTransfer === "second_stage") {
      add("nb.transfer", "newborn", p.neonatalTransfer === "icu" ? "в реанимацию" : "на 2-й этап");
    }
  }
  if (birth && input.surgeries) {
    for (const item of input.surgeries.items) {
      if (item.status === "refuted" || item.kind !== "transfusion" || item.transfusionProduct !== "exchange") continue;
      const day = dayjs(item.performedOn).diff(dayjs(birth), "day") + 1;
      if (day >= 1 && day <= t.exchangeTransfusionDays) add("nb.exchange_transfusion", "newborn", `${day}-е сутки`);
    }
  }

  // Диагнозы
  for (const condition of input.conditions) {
    if (condition.diagnosedOn && dayjs(condition.diagnosedOn).isAfter(dayjs(at), "day")) continue;
    const code = condition.diagnosisCode;
    const detail = condition.title;
    if (inRubrics(code, "P10", "P15")) add("dx.birth_trauma", "diagnoses", detail);
    if (inRubrics(code, "P52")) add("dx.ivh", "diagnoses", detail);
    if (inRubrics(code, "P90")) add("dx.seizures", "diagnoses", detail);
    if (inRubrics(code, "P55")) add("dx.hdn", "diagnoses", detail);
    if (inRubrics(code, "D50", "D64")) add("dx.anemia", "diagnoses", detail);
    if (inRubrics(code, "E55")) add("dx.rickets", "diagnoses", detail);
    if (inRubrics(code, "E40", "E46")) add("dx.malnutrition", "diagnoses", detail);
    if (inRubrics(code, "Q35", "Q37") || inRubrics(code, "Q67") || inRubrics(code, "Q75")) add("dx.craniofacial", "diagnoses", detail);
    if (inRubrics(code, "Q20", "Q28")) add("dx.vital_malformation", "diagnoses", detail);
    if (birth && condition.diagnosedOn && isAcuteCode(code)) {
      const limit = dayjs(birth).add(t.acuteFirstMonths, "month");
      if (dayjs(condition.diagnosedOn).isBefore(limit)) add("dx.acute_first3m", "diagnoses", detail);
    }
  }

  // Вскармливание: смесь с рождения или переход до 6 мес
  if (birth) {
    const limit = dayjs(birth).add(t.earlySwitchMonths, "month");
    const early = input.feeding.find(
      (period) => (period.feedingType === "mixed" || period.feedingType === "formula") && dayjs(period.startedOn).isBefore(limit),
    );
    if (early) {
      const age = ageParts(birth, early.startedOn);
      add("feed.early_switch", "feeding", age && age.totalMonths > 0 ? `с ${age.totalMonths} мес` : "с рождения");
    }
  }

  // Часто болеющий
  const frequent = frequentIllness(input, at, t);
  if (frequent?.isFrequent) add("ill.frequent", "diagnoses", `ОРЗ ${frequent.count} за 12 мес`);

  // Семья: болезни кровных родственников
  for (const member of bloodRelatives(input.family)) {
    const who = familyWho(member);
    for (const disease of member.diseases ?? []) {
      const detail = `${who}: ${lowerFirst(disease.title)}`;
      if (disease.group === "allergic") add("fam.allergy", "family", detail);
      if (disease.group === "hearing") add("fam.hearing", "family", detail);
      if (disease.code === "anemia") add("fam.anemia", "family", detail);
      if (MALFORMATION_CODES.has(disease.code)) add("fam.malformation", "family", detail);
      if (disease.hereditary) add("fam.genetic", "family", detail);
    }
  }
  const social = input.social;
  if (social?.parentsConsanguineous === true) add("fam.consanguineous", "family", social.consanguinityNote);
  if (social?.infantDeathInFamily === true) add("fam.infant_death", "family", social.infantDeathNote);
  const habitual = [mother, father].filter((row) => (row?.habits?.length ?? 0) > 0);
  if (habitual.length) add("fam.parents_habits", "family", habitual.map((row) => familyWho(row as FamilyMember)).join(", "));

  // Быт
  const params = socialParameters(input, { withSensitive: false });
  const state = (index: number) => params.find((param) => param.index === index)?.state;
  if (state(1) === "risk") add("soc.incomplete", "social", params[0].reason);
  const children = 1 + siblingsOf(input).length;
  if (children >= t.largeFamilyChildren) add("soc.large", "social", `${children} ${plural(children, "ребёнок", "ребёнка", "детей")}`);
  if (state(7) === "risk") add("soc.low_income", "social");
  if (state(6) === "risk") add("soc.housing", "social", params[5].reason);
  if (state(4) === "risk") add("soc.climate", "social", params[3].reason);
  const abroad = [mother, father].filter((row) => row?.employment === "abroad");
  if (abroad.length) add("soc.migration", "social", abroad.map((row) => familyWho(row as FamilyMember)).join(", "));
  if (social?.smokingAtHome === true) add("soc.smoking_home", "social");
  const parents = [mother, father].filter((row): row is FamilyMember => row != null);
  const educated = parents.filter((row) => row.education);
  if (educated.length > 0 && educated.length === parents.length && educated.every((row) => LOW_EDUCATION.includes(row.education))) {
    add("soc.low_education", "social");
  }

  // Закрытые сведения — только у того, кто их видит
  if (input.sensitive) {
    if (input.sensitive.asocialFamily === true) add("sensitive.asocial", "sensitive");
    if (input.sensitive.tbContact === "yes") add("sensitive.tb_contact", "sensitive");
  }

  return factors;
}

/** «мать», «бабушка по отцу» — для подробностей. */
export function familyWho(member: Pick<FamilyMember, "relation" | "line" | "sex">): string {
  switch (member.relation) {
    case "mother":
      return "мать";
    case "father":
      return "отец";
    default: {
      const line = member.line === "maternal" ? " по матери" : member.line === "paternal" ? " по отцу" : "";
      const names: Partial<Record<FamilyMember["relation"], string>> = {
        sibling: member.sex === "female" ? "сестра" : "брат",
        half_sibling: member.sex === "female" ? "сестра" : "брат",
        grandmother: "бабушка",
        grandfather: "дедушка",
        aunt: "тётя",
        uncle: "дядя",
        cousin: member.sex === "female" ? "двоюродная сестра" : "двоюродный брат",
        great_grandparent: member.sex === "female" ? "прабабушка" : "прадедушка",
      };
      return `${names[member.relation] ?? "родственник"}${line}`;
    }
  }
}

export interface FrequentIllness {
  count: number;
  threshold: number;
  isFrequent: boolean;
}

/** ОРЗ (J00–J06, J20–J22) за 12 мес до `at` и порог по полным годам. */
export function frequentIllness(input: Pick<AnamnesisInput, "birthDate" | "conditions">, at: string, t: Pick<FactorThresholds, "frequentAri">): FrequentIllness | null {
  const years = fullYears(input.birthDate, at);
  if (years == null) return null;
  const from = dayjs(at).subtract(12, "month");
  const count = input.conditions.filter(
    (condition) =>
      condition.diagnosedOn &&
      isAriCode(condition.diagnosisCode) &&
      dayjs(condition.diagnosedOn).isAfter(from, "day") &&
      !dayjs(condition.diagnosedOn).isAfter(dayjs(at), "day"),
  ).length;
  const threshold = t.frequentAri.find((row) => years <= row.maxYears)?.count ?? t.frequentAri[t.frequentAri.length - 1].count;
  return { count, threshold, isFrequent: count >= threshold };
}
