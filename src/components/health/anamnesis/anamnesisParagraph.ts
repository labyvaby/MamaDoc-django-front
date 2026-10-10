import dayjs from "dayjs";

import type { NeonatalScreening, PerinatalHistory, PregnancyComplication, PregnancyInfection } from "../../../api/health";
import {
  bloodRelatives,
  isAriCode,
  isUrtiCode,
  termHalves,
  termTrimesters,
  termWeeks,
  type Factor,
} from "./anamnesisFactors";
import {
  DEFAULT_SETTINGS,
  anamnesisFactors,
  assessBiological,
  assessGenealogical,
  assessSocial,
  recordStatusAt,
  type AnamnesisSettings,
  type BiologicalAssessment,
  type GenealogicalAssessment,
  type SocialAssessment,
} from "./anamnesisRules";
import {
  COMPLICATIONS,
  DELIVERY_COMPLICATIONS,
  INFECTIONS,
  MATERNAL_DISEASES,
  OBSTETRIC_AIDS,
  RISK_GROUP_META,
  RISK_GROUP_ORDER,
  relationGenitive,
  type AnamnesisInput,
  type AssessmentLevel,
} from "./anamnesisTypes";
import { directionLabel } from "./familyDiseases";
import {
  ageGenitive,
  ageNominative,
  ageParts,
  byGender,
  capitalize,
  childNoun,
  dateText,
  decimal,
  gestationText,
  hundredths,
  joinAnd,
  lowerFirst,
  monthYear,
  ordinalDays,
  ordinalFem,
  ordinalGenPlural,
  plural,
  sentence,
  timesText,
  type ChildSex,
} from "./russian";

/**
 * Абзац «Анамнез жизни» для заключения (ТЗ §3.7, справка §4.2–4.3): обычный
 * текст в две строки — абзац «Анамнез жизни. …» и «Заключение по анамнезу: …».
 * Пустое поле — фразы нет; отрицание — только при подтверждённом «нет».
 */

export interface ParagraphOptions {
  /** Дата расчёта: книжка — сегодня, заключение — дата приёма. */
  at: string;
  canSeeSensitive: boolean;
  canSeeVaccinations: boolean;
  settings?: AnamnesisSettings;
}

export interface LifeAnamnesisParagraph {
  /** Две строки через перевод строки — то, что копируется и вставляется. */
  text: string;
  /** «Анамнез жизни. …»; пусто — нечего сказать. */
  body: string;
  /** «Заключение по анамнезу: …»; пусто — нечего сказать. */
  conclusion: string;
  empty: boolean;
}

const ROMAN = ["", "I", "II", "III"];
const MULTIPLE = ["", "", "двойни", "тройни", "четверни", "пятерни"];
const ORDER_FEM = ["", "первая", "вторая", "третья", "четвёртая", "пятая"];
const ORDER_MASC = ["", "первый", "второй", "третий", "четвёртый", "пятый"];

// ── 1. Беременность и роды ──────────────────────────────────────────────────

type CourseItem = { key: number; order: number; text: string };

/** «в 10 нед», «в III триместре», «с 20 нед» или пусто. */
function termPhrase(item: Pick<PregnancyComplication, "fromWeek" | "toWeek" | "trimester"> | Pick<PregnancyInfection, "week" | "trimester">): string {
  const weeks = termWeeks(item);
  if (weeks) {
    if (weeks.from === weeks.to) return ` в ${weeks.from} нед`;
    const trimesters = termTrimesters(item);
    return trimesters.length === 1 ? ` в ${ROMAN[trimesters[0]]} триместре` : ` с ${weeks.from} нед`;
  }
  return item.trimester ? ` в ${ROMAN[item.trimester]} триместре` : "";
}

/** Ключ сортировки «по сроку»: без срока — по половине из каталога. */
function sortKey(item: Pick<PregnancyComplication, "fromWeek" | "toWeek" | "trimester"> | Pick<PregnancyInfection, "week" | "trimester">, half: 1 | 2): number {
  const weeks = termWeeks(item);
  if (weeks) return weeks.from;
  if (item.trimester) return [0, 1, 14, 28][item.trimester];
  return half === 1 ? 0.5 : 20.5;
}

const SEVERITY_GENITIVE = { mild: "лёгкой", moderate: "средней", severe: "тяжёлой" } as const;

function complicationText(item: PregnancyComplication): string {
  if (item.code === "toxicosis") {
    const early = termHalves(item, 1).includes(1);
    const prefix = item.severity === "severe" ? "выраженным " : "";
    return early ? `${prefix}ранним токсикозом` : `${prefix}токсикозом второй половины беременности`;
  }
  const meta = COMPLICATIONS[item.code];
  const severity = item.code === "anemia" && item.severity ? ` ${SEVERITY_GENITIVE[item.severity]} степени` : "";
  return `${meta.instrumental}${severity}${termPhrase(item)}`;
}

/** «протекавшей с ранним токсикозом, … и анемией …» / «протекавшей без осложнений». */
function pregnancyCourse(p: PerinatalHistory): string | null {
  const items: CourseItem[] = [];
  const others: string[] = [];
  let order = 0;
  for (const item of p.complications ?? []) {
    if (item.code === "other") {
      if (item.note) others.push(`${item.note}${termPhrase(item)}`);
      continue;
    }
    items.push({ key: sortKey(item, COMPLICATIONS[item.code].half), order: order++, text: complicationText(item) });
  }
  for (const item of p.infections ?? []) {
    if (item.code === "other") {
      if (item.note) others.push(`${item.note}${termPhrase(item)}`);
      continue;
    }
    items.push({ key: sortKey(item, 1), order: order++, text: `${INFECTIONS[item.code].instrumental}${termPhrase(item)}` });
  }
  if (items.length) {
    items.sort((a, b) => a.key - b.key || a.order - b.order);
    const main = joinAnd(items.map((item) => item.text));
    return others.length ? `протекавшей с ${main}, а также: ${others.join("; ")}` : `протекавшей с ${main}`;
  }
  if (others.length) return `протекавшей с осложнениями: ${others.join("; ")}`;
  if (p.complications && p.infections && !p.complications.length && !p.infections.length) return "протекавшей без осложнений";
  return null;
}

function birthKind(weeks: number | null): string {
  if (weeks == null) return "";
  if (weeks < 37) return "преждевременных";
  if (weeks >= 42) return "запоздалых";
  return "срочных";
}

function deliveryPhrase(input: AnamnesisInput): string {
  const p = input.perinatal;
  const type = input.profile?.deliveryType ?? "";
  if (type === "natural") return "самостоятельных";
  if (type !== "cesarean") return "";
  const indication = p?.cesareanIndication ? ` (${p.cesareanIndication})` : "";
  if (p?.cesareanKind === "planned") return `путём планового кесарева сечения${indication}`;
  if (p?.cesareanKind === "emergency") return `путём экстренного кесарева сечения${indication}`;
  return `путём кесарева сечения${indication}`;
}

function hoursText(hours: number): string {
  return `${decimal(hours)} ч`;
}

function informantNote(p: PerinatalHistory | null): string {
  if (p?.informant === "mother") return " (со слов матери)";
  if (p?.informant === "father") return " (со слов отца)";
  return "";
}

function multipleText(p: PerinatalHistory, sex: ChildSex): string {
  if (p.multiplePregnancy !== true || !p.fetusCount || p.fetusCount < 2) return "";
  const of = MULTIPLE[p.fetusCount] ?? `${p.fetusCount} плодов`;
  const orders = sex === "female" ? ORDER_FEM : ORDER_MASC;
  return p.fetusOrder ? `из ${of}, ${orders[p.fetusOrder] ?? `${p.fetusOrder}-${sex === "female" ? "я" : "й"}`}` : `из ${of}`;
}

/** Фраза 1 полной версии. */
function pregnancyAndBirth(input: AnamnesisInput, factors: Factor[]): string {
  const p = input.perinatal;
  const profile = input.profile;
  const pregnancy: string[] = [];
  if (p) {
    const course = pregnancyCourse(p);
    const multiple = multipleText(p, input.sex);
    if (p.pregnancyNumber) pregnancy.push(`от ${ordinalFem(p.pregnancyNumber)} беременности`);
    else if (course || multiple) pregnancy.push("от беременности");
    if (multiple) pregnancy.push(multiple);
    if (course) pregnancy.push(course);
  }

  const weeks = profile?.gestationalAgeWeeks ?? null;
  const kind = birthKind(weeks);
  const head = [p?.birthNumber ? ordinalGenPlural(p.birthNumber) : "", kind, "родов"].filter(Boolean).join(" ");
  const births: string[] = [];
  const delivery = deliveryPhrase(input);
  const hasBirth = p?.birthNumber != null || weeks != null || Boolean(delivery);
  if (hasBirth) {
    births.push(weeks != null ? `${head} в сроке ${gestationText(weeks, profile?.gestationalAgeDays ?? null)}` : head);
    if (delivery) births.push(delivery);
  }
  if (p) {
    if (p.presentation === "breech") births.push("в тазовом предлежании");
    const aids = (p.obstetricAids ?? []).map((aid) => OBSTETRIC_AIDS[aid].genitive);
    if (aids.length) births.push(`с применением ${joinAnd(aids)}`);
    const rapid = factors.find((factor) => factor.code === "birth.rapid");
    const prolonged = factors.find((factor) => factor.code === "birth.prolonged");
    if (rapid && p.laborDurationHours != null) births.push(`стремительных (${hoursText(p.laborDurationHours)})`);
    if (prolonged && p.laborDurationHours != null) births.push(`затяжных (${hoursText(p.laborDurationHours)})`);
    const complications = (p.deliveryComplications ?? []).filter((code) => code !== "other").map((code) => DELIVERY_COMPLICATIONS[code].instrumental);
    const other = (p.deliveryComplications ?? []).includes("other") && p.deliveryComplicationsNote ? p.deliveryComplicationsNote : "";
    if (complications.length) births.push(`осложнённых ${joinAnd(complications)}${other ? `, а также: ${other}` : ""}`);
    else if (other) births.push(`осложнённых: ${other}`);
    if (p.ruptureIntervalHours != null) births.push(`безводный период ${hoursText(p.ruptureIntervalHours)}`);
  }

  if (!pregnancy.length && !births.length) return "";
  const noun = childNoun(input.sex);
  let text: string;
  if (pregnancy.length) {
    text = `${noun} ${[...pregnancy, ...births].join(", ")}`;
  } else if (hasBirth) {
    text = `${noun} от ${births.join(", ")}`;
  } else {
    text = `${noun}: роды — ${births.join(", ")}`;
  }
  return sentence(`${text}${informantNote(p)}`);
}

/** Фраза 2: болезни и привычки матери. */
function motherPhrase(p: PerinatalHistory | null): string[] {
  if (!p) return [];
  const result: string[] = [];
  const diseases = (p.maternalDiseases ?? [])
    .map((disease) => {
      if (disease.code === "other") return disease.note;
      const name = MATERNAL_DISEASES[disease.code].nominative;
      return disease.note ? `${name} (${disease.note})` : name;
    })
    .filter(Boolean);
  if (diseases.length) result.push(sentence(`У матери: ${diseases.join(", ")}`));
  const cigarettes = p.motherCigarettesPerDay
    ? ` (${p.motherCigarettesPerDay} ${plural(p.motherCigarettesPerDay, "сигарета", "сигареты", "сигарет")} в день)`
    : "";
  const habits: string[] = [];
  if (p.motherSmoking === true) habits.push(`курение${cigarettes}`);
  if (p.motherAlcohol === true) habits.push("употребление алкоголя");
  if (p.motherDrugs === true) habits.push("употребление наркотиков");
  if (habits.length === 1 && p.motherSmoking === true) result.push(sentence(`Курение во время беременности${cigarettes}`));
  else if (habits.length) result.push(sentence(`Во время беременности: ${joinAnd(habits)}`));
  return result;
}

/** Фраза 3: масса, длина, окружности. */
function measuresPhrase(input: AnamnesisInput): string {
  const profile = input.profile;
  const chest = input.perinatal?.birthChestCircumferenceCm ?? null;
  const rest: string[] = [];
  if (profile?.birthLengthCm != null) rest.push(`длина ${decimal(profile.birthLengthCm)} см`);
  const head = profile?.birthHeadCircumferenceCm ?? null;
  if (head != null) rest.push(`окружность головы ${decimal(head)} см`);
  if (chest != null) rest.push(head != null ? `груди ${decimal(chest)} см` : `окружность груди ${decimal(chest)} см`);
  if (profile?.birthWeightG != null) return sentence([`Масса при рождении ${Math.round(profile.birthWeightG)} г`, ...rest].join(", "));
  return rest.length ? sentence(`При рождении ${rest.join(", ")}`) : "";
}

/** Фраза 4: Апгар. */
function apgarPhrase(input: AnamnesisInput): string {
  const a1 = input.profile?.apgar1min ?? null;
  const a5 = input.profile?.apgar5min ?? null;
  const a10 = input.perinatal?.apgar10min ?? null;
  if (a1 != null && a5 != null) return `Оценка по шкале Апгар ${[a1, a5, a10].filter((value) => value != null).join("/")} баллов.`;
  if (a1 != null) return `Оценка по шкале Апгар на 1-й минуте ${a1} ${plural(a1, "балл", "балла", "баллов")}.`;
  if (a5 != null) return `Оценка по шкале Апгар на 5-й минуте ${a5} ${plural(a5, "балл", "балла", "баллов")}.`;
  return "";
}

/** Фраза 5: закричал(а), реанимация. */
function cryPhrase(input: AnamnesisInput): string[] {
  const p = input.perinatal;
  if (!p) return [];
  const result: string[] = [];
  const cried = byGender(input.sex, "Закричал", "Закричала");
  if (p.firstCry === "immediately") result.push(`${cried} сразу.`);
  if (p.firstCry === "after_stimulation") result.push(`${cried} после санации и стимуляции.`);
  if (p.firstCry === "after_resuscitation" || p.resuscitation === true) {
    result.push(sentence(`Проводилась реанимация${p.resuscitationNote ? `: ${p.resuscitationNote}` : ""}`));
  }
  return result;
}

/** Фраза 6: первое прикладывание. */
function latchPhrase(input: AnamnesisInput): string {
  const hours = input.perinatal?.firstLatchHours ?? null;
  if (hours == null) return "";
  const attached = byGender(input.sex, "приложен", "приложена");
  if (hours === 0) return `К груди ${attached} сразу после рождения.`;
  if (hours >= 24) return `К груди ${attached} на ${ordinalDays(Math.floor(hours / 24) + 1)} сутки.`;
  return `К груди ${attached} через ${hoursText(hours)}.`;
}

/** Фраза 7: желтуха. */
function jaundicePhrase(p: PerinatalHistory | null): string {
  if (!p?.jaundice) return "";
  if (p.jaundice === "none") return "Желтухи не было.";
  const kind = { physiological: "Физиологическая", prolonged: "Затяжная", pathological: "Патологическая" }[p.jaundice];
  const parts = [`${kind} желтуха`];
  if (p.jaundiceFirstDay === true) parts.push("с первых суток");
  if (p.jaundiceUntilDay != null) parts.push(`до ${ordinalGenPlural(p.jaundiceUntilDay)} суток`);
  if (p.maxBilirubinUmol != null) parts.push(`(билирубин до ${Math.round(p.maxBilirubinUmol)} мкмоль/л)`);
  return sentence(`${parts.join(" ")}${p.phototherapy === true ? ", фототерапия" : ""}`);
}

function latest(rows: NeonatalScreening[], kind: NeonatalScreening["kind"]): NeonatalScreening | null {
  const list = rows
    .filter((row) => row.kind === kind)
    .sort((a, b) => (a.performedOn ?? a.createdAt).localeCompare(b.performedOn ?? b.createdAt) || a.id - b.id);
  return list[list.length - 1] ?? null;
}

const NEONATAL_RESULT: Record<string, string> = {
  normal: "без отклонений",
  retest: "нужен повторный забор",
  positive: "выявлены отклонения",
  not_done: "не проводился",
  refused: "отказ от скрининга",
};

/** Слух: «прошла с обеих сторон», «прошла справа, не прошла слева». */
export function hearingWords(row: Pick<NeonatalScreening, "rightEar" | "leftEar">, sex: ChildSex): string {
  const passed = byGender(sex, "прошёл", "прошла");
  const failed = byGender(sex, "не прошёл", "не прошла");
  const ears: Array<[string, string]> = [
    [row.rightEar, "справа"],
    [row.leftEar, "слева"],
  ];
  const known = ears.filter(([value]) => value);
  if (!known.length) return "";
  if (known.length === 2 && row.rightEar === row.leftEar) {
    if (row.rightEar === "pass") return `${passed} с обеих сторон`;
    if (row.rightEar === "refer") return `${failed} с обеих сторон`;
    return "не проводился";
  }
  return known
    .map(([value, side]) => (value === "pass" ? `${passed} ${side}` : value === "refer" ? `${failed} ${side}` : `${side} не проведён`))
    .join(", ");
}

/** Фраза 8: скрининги (последние строки). */
function screeningPhrase(input: AnamnesisInput): string {
  const parts: string[] = [];
  const neonatal = latest(input.screenings, "neonatal");
  if (neonatal?.result && NEONATAL_RESULT[neonatal.result]) parts.push(`Неонатальный скрининг — ${NEONATAL_RESULT[neonatal.result]}`);
  const hearing = latest(input.screenings, "hearing");
  const words = hearing ? hearingWords(hearing, input.sex) : "";
  if (words) parts.push(`${parts.length ? "аудиологический" : "Аудиологический"} скрининг — ${words}`);
  return parts.length ? sentence(parts.join("; ")) : "";
}

const HEP_B = /гепат|hep|вгв|энджерикс|эувакс|регевак/i;
const BCG = /бцж|bcg/i;

/** Прививки до даты выписки из роддома: «против гепатита B и туберкулёза». */
export function maternityVaccines(input: AnamnesisInput): { hepB: boolean; bcg: boolean } {
  const discharged = input.profile?.maternityDischargedOn ?? null;
  const records = input.vaccinations?.records ?? [];
  if (!discharged) return { hepB: false, bcg: false };
  const inMaternity = records.filter(
    (record) => record.status !== "canceled" && !dayjs(record.administeredAt).isAfter(dayjs(discharged), "day"),
  );
  return { hepB: inMaternity.some((record) => HEP_B.test(record.vaccineName)), bcg: inMaternity.some((record) => BCG.test(record.vaccineName)) };
}

/** Фраза 9. */
function maternityVaccinePhrase(input: AnamnesisInput): string {
  const { hepB, bcg } = maternityVaccines(input);
  const against = [hepB ? "гепатита B" : "", bcg ? "туберкулёза" : ""].filter(Boolean);
  return against.length ? `В роддоме ${byGender(input.sex, "привит", "привита")} против ${joinAnd(against)}.` : "";
}

const BLOOD = { "0": "0 (I)", A: "A (II)", B: "B (III)", AB: "AB (IV)" } as const;

/** Фраза 10: выписка, особенности периода, группа крови. */
function dischargePhrase(input: AnamnesisInput): string[] {
  const result: string[] = [];
  const p = input.perinatal;
  const profile = input.profile;
  const discharged = profile?.maternityDischargedOn ?? null;
  const weight = p?.dischargeWeightG ?? null;
  const diagnosis = p?.dischargeDiagnosis ? ` с диагнозом: ${p.dischargeDiagnosis}` : "";
  if (discharged && input.birthDate) {
    const day = dayjs(discharged).diff(dayjs(input.birthDate), "day") + 1;
    if (day >= 1) {
      const text = `${byGender(input.sex, "Выписан", "Выписана")} на ${ordinalDays(day)} сутки${weight != null ? ` с массой ${weight} г` : ""}${diagnosis}`;
      result.push(sentence(text));
    }
  } else if (weight != null || diagnosis) {
    result.push(sentence(`${byGender(input.sex, "Выписан", "Выписана")}${weight != null ? ` с массой ${weight} г` : ""}${diagnosis}`));
  }
  if (profile?.perinatalNotes) result.push(sentence(profile.perinatalNotes));
  const group = profile?.bloodGroup ? BLOOD[profile.bloodGroup] : "";
  const rh = profile?.rhFactor === "positive" ? "Rh+" : profile?.rhFactor === "negative" ? "Rh−" : "";
  if (group) result.push(`Группа крови ${[group, rh].filter(Boolean).join(" ")}.`);
  else if (rh) result.push(`Резус-фактор ${rh}.`);
  return result;
}

// ── После роддома ───────────────────────────────────────────────────────────

const FEEDING_WORD = { breast: "грудное", mixed: "смешанное", formula: "искусственное", general: "общий стол" } as const;
const SWITCH_REASON: Record<string, string> = {
  mother_illness: "болезнь матери",
  mother_absent: "отсутствие матери",
  hypogalactia: "гипогалактия",
  no_lactation: "отсутствие лактации",
  mother_work: "выход матери на работу",
  mother_wish: "по желанию матери",
  child_condition: "состояние ребёнка",
  other: "другие причины",
};

/** С 3 лет события подписываются возрастом в полных годах: «(4 года)». */
function ageYears(age: NonNullable<ReturnType<typeof ageParts>>): string {
  return age.years ? `${age.years} ${plural(age.years, "год", "года", "лет")}` : ageNominative(age);
}

function ageGen(birth: string | null, on: string): string {
  const age = ageParts(birth, on);
  return age ? ageGenitive(age) : dateText(on);
}

/** Фраза 11: вскармливание и прикорм. */
function feedingPhrase(input: AnamnesisInput, short: boolean): string {
  const birth = input.birthDate;
  const periods = [...input.feeding].sort((a, b) => a.startedOn.localeCompare(b.startedOn));
  const complementary = input.complementaryFeedingOn && birth ? `прикорм с ${ageGen(birth, input.complementaryFeedingOn)}` : "";
  if (short) {
    if (!periods.length) return "";
    const first = periods[0];
    const next = periods[1];
    if (first.feedingType === "breast") return next ? `На грудном вскармливании до ${ageGen(birth, next.startedOn)}.` : "На грудном вскармливании.";
    return sentence(`Вскармливание ${FEEDING_WORD[first.feedingType]}`);
  }
  if (periods.length === 1) {
    const text = `Вскармливание ${FEEDING_WORD[periods[0].feedingType]}`;
    return sentence(complementary ? `${text}, ${complementary}` : text);
  }
  if (periods.length > 1) {
    const parts = periods.map((period, index) => {
      const next = periods[index + 1];
      const from = index > 0 || (birth && dayjs(period.startedOn).diff(dayjs(birth), "day") > 7) ? ` с ${ageGen(birth, period.startedOn)}` : "";
      const until = next ? ` до ${ageGen(birth, next.startedOn)}` : "";
      const reason = period.switchReason && (period.feedingType === "mixed" || period.feedingType === "formula") ? ` (причина: ${SWITCH_REASON[period.switchReason] ?? period.switchReason})` : "";
      // «грудное до 3 мес, смешанное с 3 мес (причина: …)»
      return `${FEEDING_WORD[period.feedingType]}${index === 0 ? until || from : from}${reason}`;
    });
    return sentence(`Вскармливание: ${parts.join(", ")}${complementary ? `; ${complementary}` : ""}`);
  }
  return complementary ? sentence(capitalize(complementary)) : "";
}

/** Фраза 12: перенесённые заболевания. */
function illnessPhrase(input: AnamnesisInput, at: string, older: boolean): string {
  const birth = input.birthDate;
  const conditions = input.conditions.filter((condition) => !condition.diagnosedOn || !dayjs(condition.diagnosedOn).isAfter(dayjs(at), "day"));
  const hospitalized = new Set(input.hospitalizations.map((stay) => stay.conditionId).filter((id): id is number => id != null));
  const parts: string[] = [];
  let ariLastYear = 0;
  const groups = new Map<string, { title: string; first: string | null; dates: string[] }>();
  const urti: string[] = [];
  for (const condition of conditions) {
    const code = condition.diagnosisCode ?? "";
    if (older && isAriCode(code)) {
      if (condition.diagnosedOn && dayjs(condition.diagnosedOn).isAfter(dayjs(at).subtract(12, "month"), "day")) ariLastYear += 1;
      continue;
    }
    if (!older && isUrtiCode(code)) {
      urti.push(condition.diagnosedOn ?? "");
      continue;
    }
    const key = (code ? code.slice(0, 3).toUpperCase() : "") || condition.title.trim().toLowerCase();
    const date = condition.diagnosedOn;
    let when = "";
    if (date) {
      const age = ageParts(birth, date);
      when = older && age ? ageYears(age) : monthYear(date);
    }
    if (hospitalized.has(condition.id)) when = when ? `${when}, стационар` : "стационар";
    const entry = groups.get(key) ?? { title: lowerFirst(condition.title.trim()), first: date, dates: [] };
    if (when) entry.dates.push(when);
    if (date && (!entry.first || date < entry.first)) entry.first = date;
    groups.set(key, entry);
  }
  if (urti.length) parts.push(`ОРВИ — ${timesText(urti.length)}`);
  const sorted = [...groups.values()].sort((a, b) => (a.first ?? "9999").localeCompare(b.first ?? "9999"));
  for (const entry of sorted) parts.push(entry.dates.length ? `${entry.title} (${entry.dates.join(", ")})` : entry.title);
  if (older && ariLastYear) {
    const ari = `ОРЗ ${timesText(ariLastYear)} за последний год`;
    return sentence(parts.length ? `Перенесённые заболевания: ${parts.join(", ")}; ${ari}` : `Перенесённые заболевания: ${ari}`);
  }
  if (parts.length) return sentence(`Перенесённые заболевания: ${parts.join(", ")}`);
  if (input.noPastIllnesses === true) return "Перенесённых заболеваний не было.";
  return "";
}

/** Фраза 13: операции, травмы, переливания. */
function surgeryPhrase(input: AnamnesisInput, at: string, older: boolean): string[] {
  const data = input.surgeries;
  if (!data) return [];
  const items = data.items.filter((item) => item.status !== "refuted" && !dayjs(item.performedOn).isAfter(dayjs(at), "day"));
  const when = (date: string) => {
    const age = ageParts(input.birthDate, date);
    return older && age ? ageYears(age) : monthYear(date);
  };
  const result: string[] = [];
  const none: string[] = [];
  const kinds: Array<{ kind: "operation" | "injury" | "transfusion"; title: string; negation: string; flag: boolean }> = [
    { kind: "operation", title: "Операции", negation: "операций", flag: data.noneOperations },
    { kind: "injury", title: "Травмы", negation: "травм", flag: data.noneInjuries },
    { kind: "transfusion", title: "Переливания крови", negation: "переливаний крови", flag: data.noneTransfusions },
  ];
  for (const kind of kinds) {
    const list = items.filter((item) => item.kind === kind.kind);
    if (list.length) {
      result.push(sentence(`${kind.title}: ${list.map((item) => `${lowerFirst(item.title)} (${when(item.performedOn)})`).join(", ")}`));
    } else if (kind.flag) {
      none.push(kind.negation);
    }
  }
  if (none.length) result.push(`${capitalize(none.join(", "))} не было.`);
  return result;
}

/** Винительный падеж готовых аллергенов: «сыпь на рыбу». */
const ALLERGEN_ACCUSATIVE: Record<string, string> = {
  "белок коровьего молока": "белок коровьего молока",
  "куриное яйцо": "куриное яйцо",
  арахис: "арахис",
  орехи: "орехи",
  рыба: "рыбу",
  морепродукты: "морепродукты",
  глютен: "глютен",
  соя: "сою",
  цитрусовые: "цитрусовые",
  мёд: "мёд",
  "пыльца деревьев": "пыльцу деревьев",
  "пыльца злаков": "пыльцу злаков",
  "пыльца сорных трав": "пыльцу сорных трав",
  "клещ домашней пыли": "клеща домашней пыли",
  "шерсть кошки": "шерсть кошки",
  "шерсть собаки": "шерсть собаки",
  плесень: "плесень",
  латекс: "латекс",
  пчела: "укус пчелы",
  оса: "укус осы",
  комары: "укусы комаров",
  пенициллины: "пенициллины",
  амоксициллин: "амоксициллин",
  цефалоспорины: "цефалоспорины",
  макролиды: "макролиды",
  сульфаниламиды: "сульфаниламиды",
  ибупрофен: "ибупрофен",
  парацетамол: "парацетамол",
  лидокаин: "лидокаин",
};

/** Аллергия строкой абзаца: готовый аллерген склоняется, свой текст — «аллерген — реакция». */
export function allergyPhrase(allergy: { allergen: string; reaction: string }): string {
  const allergen = allergy.allergen.trim();
  const reaction = allergy.reaction.trim();
  const accusative = ALLERGEN_ACCUSATIVE[allergen.toLowerCase()];
  if (accusative) return reaction ? `${lowerFirst(reaction)} на ${accusative}` : `аллергия на ${accusative}`;
  return reaction ? `${allergen} — ${lowerFirst(reaction)}` : allergen;
}

/** Фраза 14. */
function allergyAnamnesis(input: AnamnesisInput): string {
  if (input.allergies.length) return sentence(`Аллергоанамнез: ${input.allergies.map(allergyPhrase).join("; ")}`);
  if (input.profile?.noKnownAllergies) return "Аллергоанамнез не отягощён.";
  return "";
}

/** Фраза 15: прививки по календарю или с отступлениями. */
function vaccinationPhrase(input: AnamnesisInput): string {
  const schedule = input.vaccinations?.schedule ?? [];
  if (!schedule.length) return "";
  const overdue = [...new Set(schedule.filter((slot) => slot.status === "overdue").map((slot) => slot.vaccineName.trim()).filter(Boolean))];
  return overdue.length ? sentence(`Прививки с отступлениями от календаря: ${overdue.join(", ")}`) : "Прививки по календарю.";
}

/** Фраза 16: туберкулёзный контакт — только у того, кто видит закрытые сведения. */
function tbPhrase(input: AnamnesisInput): string {
  const s = input.sensitive;
  if (!s) return "";
  if (s.tbContact === "no") return "Контакт с туберкулёзом отрицается.";
  if (s.tbContact !== "yes") return "";
  const place = { family: " в семье", household: " в квартире", other: "", "": "" }[s.tbContactPlace];
  const from = s.tbContactFrom ? ` с ${dateText(s.tbContactFrom)}` : "";
  const to = s.tbContactTo ? ` по ${dateText(s.tbContactTo)}` : "";
  const source = s.tbSourceBacillary === true ? ", источник — бактериовыделитель" : s.tbSourceBacillary === false ? ", источник не бактериовыделитель" : "";
  let therapy = "";
  if (s.tbPreventiveTherapy === true) {
    const period = [s.tbPreventiveFrom ? `с ${dateText(s.tbPreventiveFrom)}` : "", s.tbPreventiveTo ? `по ${dateText(s.tbPreventiveTo)}` : ""].filter(Boolean).join(" ");
    therapy = `; превентивная терапия проведена${period ? ` (${period})` : ""}`;
  } else if (s.tbPreventiveTherapy === false) {
    therapy = "; превентивная терапия не проводилась";
  }
  return sentence(`Контакт с туберкулёзом${place}${from}${to}${source}${therapy}`);
}

/** Порядок родственников в «Наследственности»: мать, отец, братья и сёстры, бабушки и дедушки (сначала женщины), тёти и дяди, двоюродные. */
function heredityOrder(member: AnamnesisInput["family"][number]): number {
  const line = member.line === "paternal" ? 1 : 0;
  const female = member.sex === "female" ? 0 : 1;
  switch (member.relation) {
    case "mother":
      return 0;
    case "father":
      return 1;
    case "sibling":
      return 2;
    case "half_sibling":
      return 3;
    case "grandmother":
      return 10 + line * 2;
    case "grandfather":
      return 11 + line * 2;
    case "great_grandparent":
      return 20 + line * 2 + female;
    case "aunt":
      return 30 + line * 2;
    case "uncle":
      return 31 + line * 2;
    default:
      return 40 + line * 2 + female;
  }
}

/** Фраза 17: наследственность. */
function heredityPhrase(input: AnamnesisInput, genealogy: GenealogicalAssessment): string {
  const relatives = bloodRelatives(input.family)
    .filter((member) => member.healthStatus === "ill" && member.diseases.length)
    .map((member, index) => ({ member, index }))
    .sort(
      (a, b) =>
        heredityOrder(a.member) - heredityOrder(b.member) ||
        (a.member.birthDate ?? "").localeCompare(b.member.birthDate ?? "") ||
        a.index - b.index,
    )
    .map(({ member }) => member);
  const parts = relatives.map((member) => {
    const titles = joinAnd(member.diseases.map((disease) => lowerFirst(disease.title.trim())));
    let death = "";
    if (member.vitalStatus === "deceased") {
      const died = member.sex === "female" ? "умерла" : "умер";
      if (member.deathAge != null) death = ` (${died} в ${member.deathAge} ${plural(member.deathAge, "год", "года", "лет")})`;
      else if (member.deathYear != null) death = ` (${died} в ${member.deathYear} г.)`;
      else death = ` (${died})`;
    }
    return `у ${relationGenitive(member)} ${titles}${death}`;
  });
  const extras: string[] = [];
  if (input.social?.parentsConsanguineous === true) {
    extras.push(`брак родителей кровнородственный${input.social.consanguinityNote ? ` (${input.social.consanguinityNote})` : ""}`);
  }
  if (input.social?.infantDeathInFamily === true) extras.push("в семье — смерть ребёнка до года");
  if (parts.length) {
    const index = !genealogy.insufficient && genealogy.index != null ? ` (ИО ${hundredths(genealogy.index)})` : "";
    return sentence(`Наследственность: ${parts.join(", ")}${index}${extras.length ? `; ${extras.join("; ")}` : ""}`);
  }
  if (extras.length) return sentence(`Наследственность: ${extras.join("; ")}`);
  if (!genealogy.insufficient && genealogy.numerator === 0 && genealogy.denominator > 0) return "Наследственность не отягощена.";
  return "";
}

/** Фраза 18: семья и быт. */
function socialPhrase(input: AnamnesisInput): string {
  const s = input.social;
  if (!s) return "";
  const parts: string[] = [];
  const composition = {
    full: "семья полная",
    single_mother: "семья неполная (воспитывает мать)",
    single_father: "семья неполная (воспитывает отец)",
    guardian: "ребёнок под опекой",
    foster: "приёмная семья",
    institution: "ребёнок воспитывается в учреждении",
    "": "",
  }[s.familyComposition];
  if (composition) parts.push(composition);
  const abroad = input.family.filter((member) => (member.relation === "mother" || member.relation === "father") && member.employment === "abroad");
  if (abroad.length === 2) parts.push("мать и отец работают за рубежом");
  else if (abroad.length === 1) parts.push(`${abroad[0].relation === "mother" ? "мать" : "отец"} работает за рубежом`);
  const badHousing = s.housing === "room" || s.housing === "dormitory" || s.housing === "none";
  const badSanitary = s.sanitary === "unsatisfactory";
  if (s.housing) {
    if (!badHousing && !badSanitary) parts.push("жилищные условия удовлетворительные");
    else {
      const why = [
        badHousing ? { room: "комната", dormitory: "общежитие", none: "нет постоянного жилья" }[s.housing as "room" | "dormitory" | "none"] : "",
        badSanitary ? "неудовлетворительные санитарно-гигиенические условия" : "",
      ].filter(Boolean);
      parts.push(`жилищные условия неудовлетворительные (${why.join(", ")})`);
    }
  } else if (badSanitary) {
    parts.push("санитарно-гигиенические условия неудовлетворительные");
  }
  if (s.income === "insufficient") parts.push("материальная обеспеченность недостаточная");
  if (s.familyClimate === "tense") parts.push("климат в семье напряжённый");
  if (s.familyClimate === "conflict") parts.push("климат в семье конфликтный");
  if (s.smokingAtHome === true) parts.push("в доме курят");
  if (!parts.length) return "";
  const informant = { mother: " (со слов матери)", father: " (со слов отца)", other_representative: " (со слов законного представителя)", medical_record: "", "": "" }[s.informant];
  return sentence(`${capitalize(parts.join(", "))}${informant}`);
}

// ── Заключение по анамнезу ──────────────────────────────────────────────────

const GENEALOGY_WORDS: Partial<Record<AssessmentLevel, string>> = {
  none: "не отягощён",
  low: "с низкой отягощённостью",
  moderate: "умеренно отягощён",
  pronounced: "выраженно отягощён",
  high: "с высокой отягощённостью",
  favorable: "не отягощён",
  burdened: "отягощён",
  conditional: "условно благополучный",
  unfavorable: "неблагополучный",
};

const LEVEL_ADJ: Partial<Record<AssessmentLevel, string>> = {
  low: "низкая",
  moderate: "умеренная",
  pronounced: "выраженная",
  high: "высокая",
};

function periodsWord(count: number): string {
  return `${count} ${plural(count, "периоде", "периодах", "периодах")}`;
}

function genealogyConclusion(genealogy: GenealogicalAssessment, first: boolean): string {
  if (!genealogy.level) return "";
  const word = genealogy.scale === "ufa" && genealogy.level === "favorable" ? "благополучный" : GENEALOGY_WORDS[genealogy.level] ?? "";
  const directions = genealogy.directions.map((item) => directionLabel(item.group)).filter(Boolean);
  return `генеалогический${first ? " анамнез" : ""} ${word}${directions.length ? `, направленность — ${joinAnd(directions)}` : ""}`;
}

function biologyConclusion(bio: BiologicalAssessment, first: boolean): string {
  if (!bio.level) return "";
  const head = `биологический${first ? " анамнез" : ""}`;
  if (bio.level === "none" || bio.level === "favorable") return `${head} — ${bio.level === "none" ? "не отягощён" : "благополучный"}`;
  const adj = LEVEL_ADJ[bio.level];
  const levelText = adj ? `${adj} отягощённость` : bio.level === "conditional" ? "условно благополучный" : "неблагополучный";
  return bio.count > 0 ? `${head} — факторы в ${periodsWord(bio.count)} (${levelText})` : `${head} — ${levelText}`;
}

function socialConclusion(social: SocialAssessment, first: boolean): string {
  if (!social.level) return "";
  const head = `социальный${first ? " анамнез" : ""}`;
  if (social.level === "favorable") return `${head} — благополучный`;
  const adj = LEVEL_ADJ[social.level];
  const levelText = adj ? `${adj} отягощённость` : "неблагополучный";
  return social.riskCount > 0
    ? `${head} — риск по ${social.riskCount} ${plural(social.riskCount, "параметру", "параметрам", "параметрам")} из 8 (${levelText})`
    : `${head} — ${levelText}`;
}

/** «Группы риска: аллергия, анемия — реализовались; ЦНС — снята в 1 год.» — состояние на дату. */
function groupsConclusion(input: AnamnesisInput, at: string): string {
  const active: string[] = [];
  const realized: string[] = [];
  const removed = new Map<string, string[]>();
  for (const group of RISK_GROUP_ORDER) {
    for (const record of input.riskGroups.filter((item) => item.group === group)) {
      const status = recordStatusAt(record, at);
      const name = RISK_GROUP_META[group].paragraph;
      if (status === "active" && !active.includes(name)) active.push(name);
      if (status === "realized" && !realized.includes(name)) realized.push(name);
      if (status === "removed") {
        const age = record.closedOn ? ageParts(input.birthDate, record.closedOn) : null;
        const key = age ? ageNominative(age) : "";
        const list = removed.get(key) ?? [];
        if (!list.includes(name)) list.push(name);
        removed.set(key, list);
      }
    }
  }
  const parts: string[] = [];
  if (active.length) parts.push(active.join(", "));
  if (realized.length) parts.push(`${realized.join(", ")} — ${realized.length > 1 ? "реализовались" : "реализовалась"}`);
  for (const [age, names] of removed) {
    parts.push(`${names.join(", ")} — ${names.length > 1 ? "сняты" : "снята"}${age ? ` в ${age}` : ""}`);
  }
  return parts.length ? `Группы риска: ${parts.join("; ")}.` : "";
}

// ── Короткая версия (с 3 лет) ───────────────────────────────────────────────

function shortBirthPhrase(input: AnamnesisInput, bio: BiologicalAssessment): string {
  const p = input.perinatal;
  const profile = input.profile;
  const parts: string[] = [];
  const weeks = profile?.gestationalAgeWeeks ?? null;
  const type = profile?.deliveryType ?? "";
  const births = [p?.birthNumber ? ordinalGenPlural(p.birthNumber) : "", birthKind(weeks), type === "natural" ? "самостоятельных" : "", "родов"]
    .filter(Boolean)
    .join(" ");
  const cesarean = type === "cesarean" ? deliveryPhrase(input) : "";
  const term = weeks != null ? ` в ${weeks} нед` : "";
  const hasBirth = p?.birthNumber != null || weeks != null || Boolean(type);
  const pregnancy = p?.pregnancyNumber ? `от ${ordinalFem(p.pregnancyNumber)} беременности` : "";
  if (pregnancy) parts.push(pregnancy);
  if (hasBirth) parts.push(`${pregnancy ? "" : "от "}${births}${cesarean ? ` ${cesarean}` : ""}${term}`);
  if (profile?.birthWeightG != null) parts.push(`масса при рождении ${Math.round(profile.birthWeightG)} г`);
  const a1 = profile?.apgar1min ?? null;
  const a5 = profile?.apgar5min ?? null;
  if (a1 != null && a5 != null) parts.push(`оценка по шкале Апгар ${a1}/${a5} баллов`);
  const neonatal = [...bio.periods[3].factors, ...bio.periods[4].factors];
  const newbornFilled = p != null && (p.jaundice !== "" || p.firstCry !== "" || p.dischargeWeightG != null || p.neonatalTransfer !== "");
  if (neonatal.length) parts.push(`в периоде новорождённости: ${neonatal.map(lowerFirst).join(", ")}`);
  else if (newbornFilled) parts.push("период новорождённости без особенностей");
  if (!parts.length) return "";
  return sentence(`${childNoun(input.sex)} ${parts.join(", ")}`);
}

// ── Сборка ──────────────────────────────────────────────────────────────────

export function buildLifeAnamnesisParagraph(input: AnamnesisInput, options: ParagraphOptions): LifeAnamnesisParagraph {
  const at = options.at;
  const settings = options.settings ?? DEFAULT_SETTINGS;
  // Расчёты — только по тому, что видит сотрудник.
  const visible: AnamnesisInput = {
    ...input,
    sensitive: options.canSeeSensitive ? input.sensitive : null,
    vaccinations: options.canSeeVaccinations ? input.vaccinations : null,
  };
  const factors = anamnesisFactors(visible, at, settings);
  const genealogy = assessGenealogical(visible, settings.scales.genealogical);
  const bio = assessBiological(visible, at, settings, factors);
  const social = assessSocial(visible, { canSeeSensitive: options.canSeeSensitive }, settings.scales.social);
  const age = ageParts(visible.birthDate, at);
  const older = age != null && age.years >= 3;

  const sentences: string[] = [];
  const push = (...items: Array<string | string[]>) => {
    for (const item of items.flat()) if (item) sentences.push(item);
  };
  if (older) {
    push(shortBirthPhrase(visible, bio));
  } else {
    push(
      pregnancyAndBirth(visible, factors),
      motherPhrase(visible.perinatal),
      measuresPhrase(visible),
      apgarPhrase(visible),
      cryPhrase(visible),
      latchPhrase(visible),
      jaundicePhrase(visible.perinatal),
      screeningPhrase(visible),
      maternityVaccinePhrase(visible),
      dischargePhrase(visible),
    );
  }
  push(
    feedingPhrase(visible, older),
    illnessPhrase(visible, at, older),
    surgeryPhrase(visible, at, older),
    allergyAnamnesis(visible),
    vaccinationPhrase(visible),
    tbPhrase(visible),
    heredityPhrase(visible, genealogy),
    socialPhrase(visible),
  );

  const assessments: string[] = [];
  const g = genealogyConclusion(genealogy, true);
  if (g) assessments.push(g);
  const b = biologyConclusion(bio, assessments.length === 0);
  if (b) assessments.push(b);
  const s = socialConclusion(social, assessments.length === 0);
  if (s) assessments.push(s);
  const groups = groupsConclusion(visible, at);
  let conclusion = "";
  if (assessments.length) conclusion = `Заключение по анамнезу: ${assessments.join("; ")}.${groups ? ` ${groups}` : ""}`;
  else if (groups) conclusion = `Заключение по анамнезу. ${groups}`;

  const body = sentences.length ? `Анамнез жизни. ${sentences.join(" ")}` : "";
  const text = [body, conclusion].filter(Boolean).join("\n");
  return { text, body, conclusion, empty: !body && !conclusion };
}

/** Вставка в поле «Анамнез»: пустое — абзац; не пустое — дописать в конец через пустую строку. */
export function appendParagraph(current: string, paragraph: string): string {
  const base = current.replace(/\s+$/, "");
  return base ? `${base}\n\n${paragraph}` : paragraph;
}
