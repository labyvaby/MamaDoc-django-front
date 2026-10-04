import dayjs from "dayjs";

import type {
  Allergy,
  FeedingSwitchReason,
  FeedingType,
  MedicationKind,
  MedicationPurpose,
  AllergyCategory,
  AllergySeverity,
  AllergyStatus,
  BloodGroup,
  Condition,
  ConditionStatus,
  DeliveryType,
  DispensaryEndReason,
  FamilyRelation,
  HealthGroup,
  HealthProfile,
  OnboardingItem,
  PeGroup,
  RhFactor,
  RiskGroup,
} from "../../api/health";

/** Цвет чипа MUI для статусов медпрофиля. */
export type HealthTone = "default" | "primary" | "success" | "warning" | "error" | "info";

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export const ALLERGY_CATEGORIES: Option<AllergyCategory>[] = [
  { value: "drug", label: "Лекарства" },
  { value: "food", label: "Пища" },
  { value: "environmental", label: "Окружающая среда" },
  { value: "insect", label: "Укусы насекомых" },
  { value: "other", label: "Другое" },
];

/** Частые аллергены по видам — заполнение одной кнопкой. */
export const ALLERGEN_PRESETS: Record<AllergyCategory, string[]> = {
  drug: ["Пенициллины", "Амоксициллин", "Цефалоспорины", "Макролиды", "Сульфаниламиды", "Ибупрофен", "Парацетамол", "Лидокаин"],
  food: [
    "Белок коровьего молока",
    "Куриное яйцо",
    "Арахис",
    "Орехи",
    "Рыба",
    "Морепродукты",
    "Глютен",
    "Соя",
    "Цитрусовые",
    "Мёд",
  ],
  environmental: [
    "Пыльца деревьев",
    "Пыльца злаков",
    "Пыльца сорных трав",
    "Клещ домашней пыли",
    "Шерсть кошки",
    "Шерсть собаки",
    "Плесень",
    "Латекс",
  ],
  insect: ["Пчела", "Оса", "Комары"],
  other: [],
};

export const REACTION_PRESETS = [
  "Сыпь",
  "Крапивница",
  "Зуд",
  "Отёк Квинке",
  "Ринит",
  "Конъюнктивит",
  "Бронхоспазм",
  "Рвота, диарея",
  "Анафилактический шок",
];

export const ALLERGY_SEVERITIES: Option<AllergySeverity>[] = [
  { value: "mild", label: "Лёгкая" },
  { value: "moderate", label: "Средняя" },
  { value: "severe", label: "Тяжёлая" },
  { value: "anaphylaxis", label: "Анафилаксия" },
  { value: "unknown", label: "Неизвестно" },
];

export const ALLERGY_STATUSES: Option<AllergyStatus>[] = [
  { value: "active", label: "Действует" },
  { value: "resolved", label: "Прошла" },
  { value: "refuted", label: "Ошибочно внесена" },
];

export const CONDITION_STATUSES: Option<ConditionStatus>[] = [
  { value: "active", label: "Активно" },
  { value: "remission", label: "Ремиссия" },
  { value: "resolved", label: "Выздоровление" },
  { value: "refuted", label: "Ошибочно внесён" },
];

export const DISPENSARY_END_REASONS: Option<Exclude<DispensaryEndReason, "">>[] = [
  { value: "recovered", label: "Выздоровление" },
  { value: "moved", label: "Выбыл" },
  { value: "other", label: "Другое" },
];

/** Как часто контроль на Д-учёте, мес. */
export const CONTROL_INTERVALS: Option<number>[] = [
  { value: 1, label: "1 мес." },
  { value: 3, label: "3 мес." },
  { value: 6, label: "6 мес." },
  { value: 12, label: "12 мес." },
];

export const HEALTH_GROUPS: Option<Exclude<HealthGroup, "">>[] = [
  { value: "1", label: "I" },
  { value: "2", label: "II" },
  { value: "3", label: "III" },
  { value: "4", label: "IV" },
  { value: "5", label: "V" },
];

export const PE_GROUPS: Option<Exclude<PeGroup, "">>[] = [
  { value: "main", label: "Основная" },
  { value: "preparatory", label: "Подготовительная" },
  { value: "special", label: "Специальная" },
  { value: "exempt", label: "Освобождён" },
];

export const BLOOD_GROUPS: Option<Exclude<BloodGroup, "">>[] = [
  { value: "0", label: "0 (I)" },
  { value: "A", label: "A (II)" },
  { value: "B", label: "B (III)" },
  { value: "AB", label: "AB (IV)" },
];

export const RH_FACTORS: Option<Exclude<RhFactor, "">>[] = [
  { value: "positive", label: "Rh+" },
  { value: "negative", label: "Rh−" },
];

export const DELIVERY_TYPES: Option<Exclude<DeliveryType, "">>[] = [
  { value: "natural", label: "Естественные роды" },
  { value: "cesarean", label: "Кесарево сечение" },
  { value: "other", label: "Другое" },
];

/** Группы риска формы 112/у и «Анамнеза жизни» (ТЗ анамнеза §2.7). */
export const RISK_GROUPS: Option<RiskGroup>[] = [
  { value: "cns", label: "Патология ЦНС" },
  { value: "infection", label: "Внутриутробное инфицирование" },
  { value: "trophic_endocrine", label: "Трофические нарушения и эндокринопатии" },
  { value: "malformations", label: "Врождённые пороки и наследственные болезни" },
  { value: "allergic", label: "Аллергия" },
  { value: "social", label: "Социальный риск" },
  { value: "hearing", label: "Тугоухость и глухота" },
  { value: "anemia", label: "Анемия" },
  { value: "sids", label: "Синдром внезапной смерти" },
  { value: "frequent_ari", label: "Частые ОРИ" },
];

export const FAMILY_RELATIONS: Option<FamilyRelation>[] = [
  { value: "mother", label: "Мать" },
  { value: "father", label: "Отец" },
  { value: "sibling", label: "Брат или сестра" },
  { value: "other", label: "Другой родственник" },
];

/** Частые записи «Заболевания» в паспорте семьи. */
export const FAMILY_CONDITION_PRESETS = [
  "Здоров(а)",
  "Гипертоническая болезнь",
  "Сахарный диабет",
  "Бронхиальная астма",
  "Аллергия",
  "Туберкулёз",
  "Заболевания щитовидной железы",
  "Онкологическое заболевание",
];

export const FEEDING_TYPES: Option<FeedingType>[] = [
  { value: "breast", label: "Грудное" },
  { value: "mixed", label: "Смешанное" },
  { value: "formula", label: "Искусственное" },
  { value: "general", label: "Общий стол" },
];

/** Причины перевода на смешанное и искусственное — коды формы 112/у. */
export const FEEDING_SWITCH_REASONS: Option<Exclude<FeedingSwitchReason, "">>[] = [
  { value: "mother_illness", label: "Болезнь матери" },
  { value: "mother_absent", label: "Отсутствие матери" },
  { value: "hypogalactia", label: "Гипогалактия" },
  { value: "no_lactation", label: "Отсутствие лактации" },
  { value: "mother_work", label: "Выход на работу (учёбу)" },
  { value: "mother_wish", label: "По желанию матери" },
  { value: "child_condition", label: "Состояние ребёнка" },
  { value: "other", label: "Другие причины" },
];

/** Причина перевода нужна только смешанному и искусственному. */
export function feedingNeedsReason(type: FeedingType): boolean {
  return type === "mixed" || type === "formula";
}

export const MEDICATION_KINDS: Option<MedicationKind>[] = [
  { value: "antibiotic", label: "Антибиотик" },
  { value: "vitamin_d", label: "Витамин D" },
  { value: "other", label: "Другое" },
];

export const MEDICATION_PURPOSES: Option<Exclude<MedicationPurpose, "">>[] = [
  { value: "prophylaxis", label: "Профилактика" },
  { value: "treatment", label: "Лечение" },
];

/** Частые препараты по видам — заполнение одной кнопкой. */
export const DRUG_PRESETS: Record<MedicationKind, string[]> = {
  antibiotic: [
    "Амоксициллин",
    "Амоксициллин + клавулановая кислота",
    "Азитромицин",
    "Кларитромицин",
    "Цефиксим",
    "Цефуроксим",
    "Цефтриаксон",
  ],
  vitamin_d: ["Холекальциферол (D3)", "Эргокальциферол (D2)"],
  other: [],
};

/** Частые дозы: витамин D — по МЕ, антибиотики — разовая доза и кратность. */
export const DOSE_PRESETS: Record<MedicationKind, string[]> = {
  antibiotic: ["2 раза в день", "3 раза в день", "1 раз в день"],
  vitamin_d: ["500 МЕ 1 раз в день", "1000 МЕ 1 раз в день", "2000 МЕ 1 раз в день"],
  other: [],
};

export const ONBOARDING_ITEMS: Option<OnboardingItem>[] = [
  { value: "birth", label: "Данные о рождении: срок гестации и вес" },
  { value: "allergies", label: "Аллергии уточнены" },
  { value: "healthGroup", label: "Группа здоровья" },
  { value: "conditions", label: "Диагнозы внесены" },
  { value: "measurements", label: "Рост и вес измерены" },
];

/** Обязательные пункты чек-листа (как на сервере). */
export const REQUIRED_ONBOARDING: ReadonlyArray<OnboardingItem> = ["birth", "allergies", "healthGroup"];

export function optionLabel<T extends string | number>(options: ReadonlyArray<Option<T>>, value: T | null | undefined): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

/** «II» для группы здоровья; пусто — пусто. */
export function healthGroupLabel(group: HealthGroup): string {
  return group ? optionLabel(HEALTH_GROUPS, group) : "";
}

export function severityTone(severity: AllergySeverity): HealthTone {
  if (severity === "anaphylaxis" || severity === "severe") return "error";
  if (severity === "moderate") return "warning";
  if (severity === "mild") return "info";
  return "default";
}

/** «12.03.2026»; пусто — пустая строка. */
export function formatDate(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD.MM.YYYY") : "";
}

/** День жизни на дату: в день рождения — первый. */
export function dayOfLife(birthDate: string | null | undefined, on: string | null | undefined): number | null {
  if (!birthDate || !on) return null;
  const days = dayjs(on).startOf("day").diff(dayjs(birthDate).startOf("day"), "day");
  return days >= 0 ? days + 1 : null;
}

/** «38 нед. 3 дн.»; без недель — пусто. */
export function gestationLabel(weeks: number | null, days: number | null): string {
  if (weeks == null) return "";
  return days ? `${weeks} нед. ${days} дн.` : `${weeks} нед.`;
}

/** Недоношенный — меньше 37 полных недель. */
export function isPremature(weeks: number | null): boolean {
  return weeks != null && weeks < 37;
}

/** «3350 г · 51,5 см · голова 34 см · 38 нед.» — что известно о рождении. */
export function birthSummary(profile: HealthProfile): string {
  const parts: string[] = [];
  if (profile.birthWeightG != null) parts.push(`${profile.birthWeightG} г`);
  if (profile.birthLengthCm != null) parts.push(`${String(profile.birthLengthCm).replace(".", ",")} см`);
  if (profile.birthHeadCircumferenceCm != null) {
    parts.push(`голова ${String(profile.birthHeadCircumferenceCm).replace(".", ",")} см`);
  }
  const gestation = gestationLabel(profile.gestationalAgeWeeks, profile.gestationalAgeDays);
  if (gestation) parts.push(gestation);
  return parts.join(" · ");
}

/** «Амоксициллин — сыпь» для строк и подсказок. */
export function allergyLine(allergy: Pick<Allergy, "allergen" | "reaction">): string {
  return allergy.reaction ? `${allergy.allergen} — ${allergy.reaction.toLowerCase()}` : allergy.allergen;
}

export type ControlState = "overdue" | "soon" | "planned";

/** Контроль Д-учёта: просрочен, в ближайшие 14 дней или позже; без даты — null. */
export function controlState(condition: Pick<Condition, "isDispensary" | "dispensaryEndedOn" | "nextControlOn">, today = dayjs()): ControlState | null {
  if (!condition.isDispensary || condition.dispensaryEndedOn || !condition.nextControlOn) return null;
  const next = dayjs(condition.nextControlOn).startOf("day");
  const now = today.startOf("day");
  if (next.isBefore(now)) return "overdue";
  if (next.diff(now, "day") <= 14) return "soon";
  return "planned";
}

/** Сейчас на Д-учёте по этому диагнозу. */
export function onDispensary(condition: Pick<Condition, "isDispensary" | "dispensaryEndedOn" | "status">): boolean {
  return condition.isDispensary && !condition.dispensaryEndedOn && condition.status !== "refuted";
}

/** Детские блоки: моложе 18 лет или дата рождения неизвестна (ТЗ §2.7). */
export function isChild(birthDate: string | null | undefined, today = dayjs()): boolean {
  if (!birthDate) return true;
  return today.diff(dayjs(birthDate), "year") < 18;
}

/** «1 год 3 мес.» — возраст на дату (для прикорма, замеров). */
export function ageLabel(birthDate: string | null | undefined, on: string | null | undefined): string {
  if (!birthDate || !on) return "";
  const totalMonths = dayjs(on).diff(dayjs(birthDate), "month");
  if (totalMonths < 0) return "";
  if (totalMonths === 0) return `${dayjs(on).diff(dayjs(birthDate), "day")} дн.`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearWord = years % 10 === 1 && years % 100 !== 11 ? "год" : years % 10 >= 2 && years % 10 <= 4 && (years % 100 < 10 || years % 100 >= 20) ? "года" : "лет";
  if (!years) return `${months} мес.`;
  return months ? `${years} ${yearWord} ${months} мес.` : `${years} ${yearWord}`;
}

/** «A (II) Rh+»; ничего не указано — «не указана». */
export function bloodLabel(profile: Pick<HealthProfile, "bloodGroup" | "rhFactor">): string {
  const group = profile.bloodGroup ? optionLabel(BLOOD_GROUPS, profile.bloodGroup) : "";
  const rh = profile.rhFactor ? optionLabel(RH_FACTORS, profile.rhFactor) : "";
  return [group, rh].filter(Boolean).join(" ") || "не указана";
}

/** Флюорография старше года — повод напомнить семье. */
export function fluorographyOverdue(date: string | null, today = dayjs()): boolean {
  return Boolean(date) && today.diff(dayjs(date), "month") >= 12;
}
