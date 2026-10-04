import dayjs from "dayjs";

import type { LifeAnamnesis, NeonatalScreening, RiskGroupRecord } from "../../../api/health";
import { isUrtiCode, parentRow } from "./anamnesisFactors";
import { hearingWords, maternityVaccines } from "./anamnesisParagraph";
import { reviewPlan, type Completeness } from "./anamnesisRules";
import { EMPLOYMENT, HEARING_METHODS, HEARING_STAGES, PETS, RISK_GROUP_META, SCREENING_RESULTS, type AnamnesisInput, type Tone } from "./anamnesisTypes";
import { ageNominative, ageParts, byGender, dateText, decimal, fullYears, gestationText, lowerFirst, monthDot, ordinalDays, plural } from "./russian";

/**
 * Тексты обзора (ТЗ §4.2): строки и метки панелей «Новорождённая», «Семья и
 * быт», «Болезни и аллергии». Без React — проверяются тестом на демо-девочке.
 */

export type ChipTone = Tone | "neutral" | "accent";

export interface ChipSpec {
  label: string;
  tone: ChipTone;
}

/** «Заполнено 16 из 19 пунктов · последняя правка 26.04.2025, педиатр». */
export function headerLine(result: Completeness, life: Pick<LifeAnamnesis, "lastChange"> | null): string {
  const filled = `Заполнено ${result.filled} из ${result.total} ${plural(result.total, "пункта", "пунктов", "пунктов")}`;
  const change = life?.lastChange;
  if (!change) return filled;
  return `${filled} · последняя правка ${dateText(change.at)}${change.by?.fullName ? `, ${change.by.fullName}` : ""}`;
}

/** «2-я беременность · 2-е роды · самостоятельные, в 39 нед · безводный период 6 ч». */
export function birthSummaryLine(input: AnamnesisInput): string {
  const p = input.perinatal;
  const profile = input.profile;
  const parts: string[] = [];
  if (p?.pregnancyNumber) parts.push(`${p.pregnancyNumber}-я беременность`);
  if (p?.birthNumber) parts.push(`${p.birthNumber}-е роды`);
  const weeks = profile?.gestationalAgeWeeks ?? null;
  const ga = weeks != null ? `в ${gestationText(weeks, profile?.gestationalAgeDays ?? null)}` : "";
  let delivery = "";
  if (profile?.deliveryType === "natural") delivery = "самостоятельные";
  if (profile?.deliveryType === "cesarean") {
    delivery = p?.cesareanKind === "emergency" ? "экстренное кесарево" : p?.cesareanKind === "planned" ? "плановое кесарево" : "кесарево сечение";
  }
  if (profile?.deliveryType === "other") delivery = "роды: другое";
  const birth = [delivery, ga].filter(Boolean).join(", ");
  if (birth) parts.push(birth);
  if (p?.ruptureIntervalHours != null) parts.push(`безводный период ${decimal(p.ruptureIntervalHours)} ч`);
  return parts.join(" · ");
}

export function newbornTitle(sex: AnamnesisInput["sex"]): string {
  return sex === "female" ? "Новорождённая" : "Новорождённый";
}

/** Четыре числа панели: масса, длина, голова, Апгар. */
export function newbornNumbers(input: AnamnesisInput): Array<{ value: string; label: string }> {
  const profile = input.profile;
  const apgar = [profile?.apgar1min, profile?.apgar5min].some((value) => value != null)
    ? [profile?.apgar1min ?? "—", profile?.apgar5min ?? "—", ...(input.perinatal?.apgar10min != null ? [input.perinatal.apgar10min] : [])].join("/")
    : "—";
  return [
    { value: profile?.birthWeightG != null ? String(Math.round(profile.birthWeightG)) : "—", label: "масса, г" },
    { value: profile?.birthLengthCm != null ? decimal(profile.birthLengthCm) : "—", label: "длина, см" },
    { value: profile?.birthHeadCircumferenceCm != null ? decimal(profile.birthHeadCircumferenceCm) : "—", label: "голова, см" },
    { value: apgar, label: "Апгар" },
  ];
}

function latestOf(rows: NeonatalScreening[], kind: NeonatalScreening["kind"]): NeonatalScreening | null {
  const list = rows
    .filter((row) => row.kind === kind)
    .sort((a, b) => (a.performedOn ?? a.createdAt).localeCompare(b.performedOn ?? b.createdAt) || a.id - b.id);
  return list[list.length - 1] ?? null;
}

/** Метки панели «Новорождённая». */
export function newbornChips(input: AnamnesisInput): ChipSpec[] {
  const p = input.perinatal;
  const sex = input.sex;
  const chips: ChipSpec[] = [];
  if (p?.firstCry === "immediately") chips.push({ label: `${byGender(sex, "Закричал", "Закричала")} сразу`, tone: "ok" });
  if (p?.firstCry === "after_stimulation") chips.push({ label: `${byGender(sex, "Закричал", "Закричала")} после стимуляции`, tone: "warn" });
  if (p?.firstCry === "after_resuscitation" || p?.resuscitation === true) chips.push({ label: "Реанимация после рождения", tone: "bad" });
  if (p?.firstLatchHours != null) {
    const hours = p.firstLatchHours;
    const label = hours === 0 ? "К груди сразу" : hours >= 24 ? `К груди на ${ordinalDays(Math.floor(hours / 24) + 1)} сутки` : `К груди через ${decimal(hours)} ч`;
    chips.push({ label, tone: hours < 24 ? "ok" : "warn" });
  }
  if (p?.jaundice === "none") chips.push({ label: "Желтухи не было", tone: "neutral" });
  if (p?.jaundice === "physiological") chips.push({ label: "Желтуха физиологическая", tone: "neutral" });
  if (p?.jaundice === "prolonged") chips.push({ label: "Желтуха затяжная", tone: "warn" });
  if (p?.jaundice === "pathological") chips.push({ label: "Желтуха патологическая", tone: "bad" });
  if (p?.neonatalTransfer === "icu") chips.push({ label: "Перевод в реанимацию", tone: "bad" });
  if (p?.neonatalTransfer === "second_stage") chips.push({ label: "Перевод на 2-й этап", tone: "warn" });
  const discharged = input.profile?.maternityDischargedOn ?? null;
  if (discharged && input.birthDate) {
    const day = dayjs(discharged).diff(dayjs(input.birthDate), "day") + 1;
    const weight = p?.dischargeWeightG != null ? `, ${p.dischargeWeightG} г` : "";
    if (day >= 1) chips.push({ label: `${byGender(sex, "Выписан", "Выписана")} на ${ordinalDays(day)} сутки${weight}`, tone: "neutral" });
  }
  const neonatal = latestOf(input.screenings, "neonatal");
  if (neonatal?.result) {
    const words: Record<string, [string, ChipTone]> = {
      normal: ["норма", "ok"],
      retest: ["нужен повтор", "warn"],
      positive: ["отклонение", "bad"],
      not_done: ["не проведён", "warn"],
      refused: ["отказ", "warn"],
    };
    const [word, tone] = words[neonatal.result];
    chips.push({ label: `Неонатальный скрининг: ${word}`, tone });
  }
  const hearing = latestOf(input.screenings, "hearing");
  if (hearing) {
    const both = hearing.rightEar === "pass" && hearing.leftEar === "pass";
    const failed = hearing.rightEar === "refer" || hearing.leftEar === "refer";
    const words = both ? `${byGender(sex, "прошёл", "прошла")} оба уха` : hearingWords(hearing, sex);
    if (words) chips.push({ label: `Слух: ${words}`, tone: both ? "ok" : failed ? "bad" : "warn" });
  }
  if (input.vaccinations) {
    const { hepB, bcg } = maternityVaccines(input);
    const names = [hepB ? "Гепатит B" : "", bcg ? "БЦЖ" : ""].filter(Boolean);
    if (names.length) chips.push({ label: `${names.join(" и ")} в роддоме`, tone: "neutral" });
  }
  return chips;
}

const HOUSING_SHORT: Record<string, string> = {
  apartment: "Квартира",
  house: "Дом",
  rented: "Съёмное жильё",
  room: "Комната",
  dormitory: "Общежитие",
  none: "Нет постоянного жилья",
};

const COMPOSITION_SHORT: Record<string, string> = {
  full: "Семья полная",
  single_mother: "Семья неполная (мать)",
  single_father: "Семья неполная (отец)",
  guardian: "Под опекой",
  foster: "Приёмная семья",
  institution: "В учреждении",
};

const EDUCATION_SHORT: Record<string, string> = {
  incomplete_secondary: "неп. среднее",
  secondary: "среднее",
  vocational: "ср. проф.",
  higher: "высшее",
};

/** «Мама 32, высшее, в декрете». */
function parentChip(input: AnamnesisInput, relation: "mother" | "father", at: string): ChipSpec | null {
  const row = parentRow(input, relation);
  if (!row) return null;
  const age = fullYears(row.birthDate, at);
  const education = EDUCATION_SHORT[row.education] ?? "";
  const employment = EMPLOYMENT.find((option) => option.value === row.employment)?.label ?? "";
  const label = [`${relation === "mother" ? "Мама" : "Папа"}${age != null ? ` ${age}` : ""}`, lowerFirst(education), lowerFirst(employment)]
    .filter(Boolean)
    .join(", ");
  const habits = (row.habits?.length ?? 0) > 0;
  return { label, tone: habits || row.employment === "abroad" ? "warn" : "accent" };
}

/** Метки панели «Семья и быт». */
export function familyChips(input: AnamnesisInput, at: string): ChipSpec[] {
  const s = input.social;
  const chips: ChipSpec[] = [];
  if (s?.familyComposition) chips.push({ label: COMPOSITION_SHORT[s.familyComposition], tone: s.familyComposition === "full" ? "accent" : "warn" });
  for (const relation of ["mother", "father"] as const) {
    const chip = parentChip(input, relation, at);
    if (chip) chips.push(chip);
  }
  if (s?.housing) {
    const rooms = s.rooms ? `, ${s.rooms} ${plural(s.rooms, "комната", "комнаты", "комнат")}` : "";
    const bad = s.housing === "room" || s.housing === "dormitory" || s.housing === "none";
    chips.push({ label: `${HOUSING_SHORT[s.housing]}${rooms}`, tone: bad ? "warn" : "accent" });
  }
  if (s?.income === "insufficient") chips.push({ label: "Обеспеченность недостаточная", tone: "warn" });
  if (s?.familyClimate === "tense") chips.push({ label: "Климат напряжённый", tone: "warn" });
  if (s?.familyClimate === "conflict") chips.push({ label: "Климат конфликтный", tone: "bad" });
  if (s?.sanitary === "unsatisfactory") chips.push({ label: "Санусловия неудовлетворительные", tone: "warn" });
  if (s?.smokingAtHome === false) chips.push({ label: "Дома не курят", tone: "accent" });
  if (s?.smokingAtHome === true) chips.push({ label: "Дома курят", tone: "warn" });
  if (s?.pets) {
    if (s.pets.length === 0) chips.push({ label: "Животных нет", tone: "accent" });
    for (const pet of s.pets) chips.push({ label: PETS.find((option) => option.value === pet)?.label ?? pet, tone: "accent" });
  }
  return chips;
}

export interface FactLine {
  chip: ChipSpec;
  text: string;
}

/** «Болезни и аллергии» из других разделов (обзор). */
export function illnessFacts(input: AnamnesisInput, at: string): FactLine[] {
  const facts: FactLine[] = [];
  if (input.allergies.length) {
    const text = input.allergies
      .map((allergy) => [lowerFirst(allergy.allergen), allergy.reaction ? lowerFirst(allergy.reaction) : ""].filter(Boolean).join(" — ") + (allergy.isConfirmed ? ", подтверждена" : ""))
      .join("; ");
    facts.push({ chip: { label: "Аллергия", tone: "bad" }, text });
  } else if (input.profile?.noKnownAllergies) {
    facts.push({ chip: { label: "Нет", tone: "neutral" }, text: "аллергий" });
  }
  const conditions = input.conditions
    .filter((condition) => !condition.diagnosedOn || !dayjs(condition.diagnosedOn).isAfter(dayjs(at), "day"))
    .sort((a, b) => (a.diagnosedOn ?? "9999").localeCompare(b.diagnosedOn ?? "9999"));
  const urti = conditions.filter((condition) => isUrtiCode(condition.diagnosisCode)).length;
  const others = conditions
    .filter((condition) => !isUrtiCode(condition.diagnosisCode))
    .map((condition) => `${lowerFirst(condition.title)}${condition.diagnosedOn ? ` ${monthDot(condition.diagnosedOn)}` : ""}`);
  const ill = [urti ? `ОРВИ × ${urti}` : "", ...others].filter(Boolean);
  if (ill.length) facts.push({ chip: { label: byGender(input.sex, "Болел", "Болела"), tone: "neutral" }, text: ill.join(", ") });
  else if (input.noPastIllnesses === true) facts.push({ chip: { label: "Нет", tone: "neutral" }, text: "перенесённых заболеваний" });
  const surgeries = input.surgeries;
  if (surgeries) {
    const items = surgeries.items.filter((item) => item.status !== "refuted");
    const kinds = [
      { kind: "operation", none: surgeries.noneOperations, word: "операций", title: "Операции" },
      { kind: "injury", none: surgeries.noneInjuries, word: "травм", title: "Травмы" },
      { kind: "transfusion", none: surgeries.noneTransfusions, word: "переливаний крови", title: "Переливания" },
    ] as const;
    const none = kinds.filter((kind) => kind.none && !items.some((item) => item.kind === kind.kind)).map((kind) => kind.word);
    for (const kind of kinds) {
      const list = items.filter((item) => item.kind === kind.kind);
      if (list.length) facts.push({ chip: { label: kind.title, tone: "warn" }, text: list.map((item) => `${lowerFirst(item.title)} ${monthDot(item.performedOn)}`).join(", ") });
    }
    if (none.length) facts.push({ chip: { label: "Нет", tone: "neutral" }, text: none.join(", ") });
  }
  const s = input.sensitive;
  if (s?.tbContact === "no") facts.push({ chip: { label: "Нет", tone: "neutral" }, text: "контакта с туберкулёзом" });
  if (s?.tbContact === "yes") {
    const place = s.tbContactPlace === "family" ? " в семье" : s.tbContactPlace === "household" ? " в квартире" : "";
    facts.push({ chip: { label: "Контакт", tone: "bad" }, text: `с туберкулёзом${place}${s.tbContactFrom ? ` с ${dateText(s.tbContactFrom)}` : ""}` });
  }
  return facts;
}

/** Подпись метки записи: «ЦНС · с 31.03.2025 · пересмотр 3 мес до 26.06». */
export function recordChip(record: RiskGroupRecord, birthDate: string | null, at: string, frequentIll?: boolean): { label: string; tone: ChipTone } {
  const name = RISK_GROUP_META[record.group].short;
  if (record.status === "realized") return { label: `${name} · реализовалась`, tone: "bad" };
  if (record.status === "removed") {
    const age = record.closedOn ? ageParts(birthDate, record.closedOn) : null;
    return { label: `${name} · снята${age ? ` в ${ageNominative(age)}` : record.closedOn ? ` ${dateText(record.closedOn)}` : ""}`, tone: "neutral" };
  }
  const since = record.establishedOn ? ` · с ${dateText(record.establishedOn)}` : " · перенесено из профиля";
  const plan = reviewPlan(record, birthDate, at, { frequentIll });
  let review = "";
  if (plan.next) {
    const due = dayjs(plan.next.date).format("DD.MM");
    review = plan.state === "overdue" ? ` · пересмотр ${plan.next.label} просрочен` : ` · пересмотр ${plan.next.label} до ${due}`;
  }
  return { label: `${name}${since}${review}`, tone: plan.state === "overdue" ? "bad" : "warn" };
}

/** «28.03.2025 · слух · роддом · ОАЭ · справа: прошёл, слева: прошёл». */
/** «прошла», «не прошёл», «не проведено» — по полу ребёнка. */
export function earWord(value: string, sex: AnamnesisInput["sex"]): string {
  if (value === "pass") return byGender(sex, "прошёл", "прошла");
  if (value === "refer") return byGender(sex, "не прошёл", "не прошла");
  if (value === "not_done") return "не проведено";
  return "—";
}

export function screeningText(row: NeonatalScreening, sex: AnamnesisInput["sex"] = ""): string {
  const date = row.performedOn ? dateText(row.performedOn) : "без даты";
  if (row.kind === "neonatal") {
    const result = SCREENING_RESULTS.find((option) => option.value === row.result)?.label.toLowerCase() ?? "";
    return [date, "неонатальный", result, row.reason].filter(Boolean).join(" · ");
  }
  const stage = HEARING_STAGES.find((option) => option.value === row.stage)?.label ?? "";
  const method = HEARING_METHODS.find((option) => option.value === row.method)?.label ?? "";
  const ears = `справа: ${earWord(row.rightEar, sex)}, слева: ${earWord(row.leftEar, sex)}`;
  return [date, "слух", lowerFirst(stage), method, ears, row.reason].filter(Boolean).join(" · ");
}
