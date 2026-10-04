import type {
  Allergy,
  BirthPlace,
  CesareanKind,
  ComplicationCode,
  ComplicationSeverity,
  ConceptionKind,
  Condition,
  DeliveryComplication,
  EarResult,
  FamilyClimate,
  FamilyComposition,
  FamilyLine,
  FamilyMember,
  FamilyRelation,
  FeedingPeriod,
  FirstCry,
  HealthProfile,
  HearingMethod,
  HearingStage,
  Hospitalization,
  HouseholdInfection,
  HousingKind,
  IncomeLevel,
  JaundiceKind,
  LifeAnamnesisSocial,
  MarkerResult,
  MaternalDiseaseCode,
  NeonatalScreening,
  NeonatalTransfer,
  ObstetricAid,
  ParentEducation,
  ParentEmployment,
  ParentHabit,
  PerinatalHistory,
  PerinatalInformant,
  PersonSex,
  PetKind,
  PregnancyInfectionCode,
  Presentation,
  PrenatalTestKind,
  RelativeHealth,
  RiskGroup,
  RiskGroupRecord,
  RiskGroupStatus,
  RiskReviewDecision,
  SanitaryState,
  ScreeningKind,
  ScreeningResult,
  SensitiveHistory,
  SocialInformant,
  TbContact,
  TbContactPlace,
  VitalStatus,
} from "../../../api/health";
import type { ChildSex } from "./russian";

/**
 * Каталоги кодов и подписи раздела «Анамнез жизни» (ТЗ §2.2–2.7) и вход
 * чистых функций. Значения кодов — как в API; подписи — для окон, обзора и
 * абзаца (творительный падеж — «протекавшей с …»).
 */

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export type Tone = "ok" | "warn" | "bad" | "muted";

// ── Беременность ────────────────────────────────────────────────────────────

export type Half = 1 | 2;
export type Lane = "mother" | "fetus";

export interface ComplicationMeta {
  label: string;
  /** Коротко — для оси беременности. */
  short: string;
  /** Творительный падеж для абзаца; у токсикоза — особая форма. */
  instrumental: string;
  /** Куда относится пункт без недели и триместра. */
  half: Half;
  severities: ReadonlyArray<ComplicationSeverity>;
  lane: Lane;
  tone: Exclude<Tone, "ok" | "muted">;
}

export const COMPLICATIONS: Record<ComplicationCode, ComplicationMeta> = {
  toxicosis: { label: "Токсикоз", short: "Токсикоз", instrumental: "токсикозом", half: 1, severities: ["mild", "severe"], lane: "mother", tone: "warn" },
  miscarriage_threat: { label: "Угроза прерывания", short: "Угроза прерывания", instrumental: "угрозой прерывания", half: 1, severities: [], lane: "mother", tone: "bad" },
  preeclampsia: { label: "Преэклампсия (гестоз)", short: "Преэклампсия", instrumental: "преэклампсией", half: 2, severities: [], lane: "mother", tone: "bad" },
  anemia: { label: "Анемия", short: "Анемия", instrumental: "анемией", half: 2, severities: ["mild", "moderate", "severe"], lane: "mother", tone: "warn" },
  placental_insufficiency: {
    label: "Плацентарная недостаточность",
    short: "Плацентарная недостаточность",
    instrumental: "плацентарной недостаточностью",
    half: 2,
    severities: [],
    lane: "fetus",
    tone: "warn",
  },
  fgr: { label: "Задержка роста плода (ЗВУР)", short: "ЗВУР", instrumental: "задержкой роста плода", half: 2, severities: [], lane: "fetus", tone: "bad" },
  fetal_hypoxia: { label: "Гипоксия плода", short: "Гипоксия плода", instrumental: "гипоксией плода", half: 2, severities: [], lane: "fetus", tone: "bad" },
  polyhydramnios: { label: "Многоводие", short: "Многоводие", instrumental: "многоводием", half: 2, severities: [], lane: "fetus", tone: "warn" },
  oligohydramnios: { label: "Маловодие", short: "Маловодие", instrumental: "маловодием", half: 2, severities: [], lane: "fetus", tone: "warn" },
  cervical_insufficiency: {
    label: "Истмико-цервикальная недостаточность",
    short: "ИЦН",
    instrumental: "истмико-цервикальной недостаточностью",
    half: 2,
    severities: [],
    lane: "mother",
    tone: "warn",
  },
  isoimmunization: {
    label: "Резус- или АВ0-иммунизация",
    short: "Иммунизация",
    instrumental: "резус- или АВ0-иммунизацией",
    half: 2,
    severities: [],
    lane: "fetus",
    tone: "bad",
  },
  gestational_diabetes: {
    label: "Гестационный диабет",
    short: "Гестационный диабет",
    instrumental: "гестационным диабетом",
    half: 2,
    severities: [],
    lane: "mother",
    tone: "warn",
  },
  other: { label: "Другое", short: "Другое", instrumental: "", half: 2, severities: [], lane: "mother", tone: "warn" },
};

export const COMPLICATION_CODES = Object.keys(COMPLICATIONS) as ComplicationCode[];

export const SEVERITY_LABELS: Record<ComplicationSeverity, string> = {
  mild: "лёгкая",
  moderate: "средняя",
  severe: "тяжёлая",
};

/** У токсикоза тяжесть — «лёгкий / выраженный». */
export const TOXICOSIS_SEVERITY_LABELS: Record<ComplicationSeverity, string> = {
  mild: "лёгкий",
  moderate: "умеренный",
  severe: "выраженный",
};

export interface InfectionMeta {
  label: string;
  short: string;
  instrumental: string;
}

export const INFECTIONS: Record<PregnancyInfectionCode, InfectionMeta> = {
  arvi: { label: "ОРВИ", short: "ОРВИ", instrumental: "ОРВИ" },
  flu: { label: "Грипп", short: "Грипп", instrumental: "гриппом" },
  fever: { label: "Лихорадка неясной причины", short: "Лихорадка", instrumental: "лихорадкой неясной причины" },
  rubella: { label: "Краснуха или контакт", short: "Краснуха", instrumental: "краснухой" },
  cmv: { label: "Цитомегаловирус", short: "ЦМВ", instrumental: "цитомегаловирусной инфекцией" },
  toxoplasmosis: { label: "Токсоплазмоз", short: "Токсоплазмоз", instrumental: "токсоплазмозом" },
  herpes: { label: "Герпес", short: "Герпес", instrumental: "герпетической инфекцией" },
  uti: { label: "Инфекция мочевых путей", short: "ИМП", instrumental: "инфекцией мочевых путей" },
  colpitis: { label: "Кольпит", short: "Кольпит", instrumental: "кольпитом" },
  gbs: { label: "Стрептококк группы B", short: "СГB", instrumental: "носительством стрептококка группы B" },
  other: { label: "Другая", short: "Инфекция", instrumental: "" },
};

export const INFECTION_CODES = Object.keys(INFECTIONS) as PregnancyInfectionCode[];

export const MATERNAL_DISEASES: Record<MaternalDiseaseCode, { label: string; nominative: string }> = {
  hypertension: { label: "Гипертония", nominative: "гипертоническая болезнь" },
  heart_defect: { label: "Порок сердца", nominative: "порок сердца" },
  diabetes: { label: "Сахарный диабет", nominative: "сахарный диабет" },
  thyroid: { label: "Щитовидная железа", nominative: "заболевание щитовидной железы" },
  kidney: { label: "Почки", nominative: "заболевание почек" },
  obesity: { label: "Ожирение", nominative: "ожирение" },
  neuro: { label: "Нервная система", nominative: "заболевание нервной системы" },
  chronic_infection: { label: "Хронические инфекции", nominative: "хронические инфекции" },
  other: { label: "Другое", nominative: "" },
};

export const MATERNAL_DISEASE_CODES = Object.keys(MATERNAL_DISEASES) as MaternalDiseaseCode[];

export const PRENATAL_TEST_KINDS: Option<PrenatalTestKind>[] = [
  { value: "screening", label: "Скрининг" },
  { value: "ultrasound", label: "УЗИ" },
  { value: "other", label: "Обследование" },
];

export const CONCEPTION: Option<Exclude<ConceptionKind, "">>[] = [
  { value: "natural", label: "Естественно" },
  { value: "induced", label: "После стимуляции" },
  { value: "art", label: "ВРТ (ЭКО)" },
];

export const PERINATAL_INFORMANTS: Option<Exclude<PerinatalInformant, "">>[] = [
  { value: "exchange_card", label: "Обменная карта" },
  { value: "discharge_summary", label: "Выписка" },
  { value: "mother", label: "Со слов матери" },
  { value: "father", label: "Со слов отца" },
  { value: "other", label: "Другое" },
];

// ── Роды ────────────────────────────────────────────────────────────────────

export const CESAREAN_KINDS: Option<Exclude<CesareanKind, "">>[] = [
  { value: "planned", label: "Плановое" },
  { value: "emergency", label: "Экстренное" },
];

export const OBSTETRIC_AIDS: Record<ObstetricAid, { label: string; genitive: string }> = {
  vacuum: { label: "Вакуум-экстракция", genitive: "вакуум-экстракции" },
  forceps: { label: "Акушерские щипцы", genitive: "акушерских щипцов" },
  breech_aid: { label: "Пособие при тазовом предлежании", genitive: "пособия при тазовом предлежании" },
};

export const PRESENTATIONS: Option<Exclude<Presentation, "">>[] = [
  { value: "cephalic", label: "Головное" },
  { value: "breech", label: "Тазовое" },
  { value: "other", label: "Другое" },
];

export const DELIVERY_COMPLICATIONS: Record<DeliveryComplication, { label: string; instrumental: string }> = {
  weak_labor: { label: "Слабость родовой деятельности", instrumental: "слабостью родовой деятельности" },
  stimulation: { label: "Родостимуляция", instrumental: "родостимуляцией" },
  early_rupture: { label: "Преждевременное излитие вод", instrumental: "преждевременным излитием вод" },
  placental_abruption: { label: "Отслойка плаценты", instrumental: "отслойкой плаценты" },
  cord_entanglement: { label: "Обвитие пуповины", instrumental: "обвитием пуповины" },
  bleeding: { label: "Кровотечение", instrumental: "кровотечением" },
  abnormal_fluid: { label: "Зелёные или зловонные воды", instrumental: "зелёными или зловонными водами" },
  maternal_fever: { label: "Температура матери ≥ 38 °C", instrumental: "лихорадкой у матери" },
  chorioamnionitis: { label: "Хориоамнионит", instrumental: "хориоамнионитом" },
  other: { label: "Другое", instrumental: "" },
};

export const BIRTH_PLACES: Option<Exclude<BirthPlace, "">>[] = [
  { value: "maternity", label: "Роддом" },
  { value: "perinatal_center", label: "Перинатальный центр" },
  { value: "home", label: "Дома" },
  { value: "in_transit", label: "В пути" },
];

// ── Новорождённый ───────────────────────────────────────────────────────────

export const FIRST_CRY: Option<Exclude<FirstCry, "">>[] = [
  { value: "immediately", label: "Сразу" },
  { value: "after_stimulation", label: "После санации и стимуляции" },
  { value: "after_resuscitation", label: "После реанимации" },
];

export const JAUNDICE: Option<Exclude<JaundiceKind, "">>[] = [
  { value: "none", label: "Не было" },
  { value: "physiological", label: "Физиологическая" },
  { value: "prolonged", label: "Затяжная" },
  { value: "pathological", label: "Патологическая" },
];

export const NEONATAL_TRANSFER: Option<Exclude<NeonatalTransfer, "">>[] = [
  { value: "none", label: "Нет" },
  { value: "icu", label: "В реанимацию" },
  { value: "second_stage", label: "На 2-й этап выхаживания" },
];

export const SCREENING_KINDS: Option<ScreeningKind>[] = [
  { value: "neonatal", label: "Неонатальный" },
  { value: "hearing", label: "Слух" },
];

export const SCREENING_RESULTS: Option<Exclude<ScreeningResult, "">>[] = [
  { value: "normal", label: "Норма" },
  { value: "retest", label: "Нужен повтор" },
  { value: "positive", label: "Отклонение" },
  { value: "not_done", label: "Не проведён" },
  { value: "refused", label: "Отказ" },
];

export const HEARING_STAGES: Option<Exclude<HearingStage, "">>[] = [
  { value: "maternity", label: "Роддом" },
  { value: "primary_care", label: "ПМСП, 4–6 нед" },
  { value: "abr", label: "ABR, 3–4 мес" },
];

export const HEARING_METHODS: Option<Exclude<HearingMethod, "">>[] = [
  { value: "oae", label: "ОАЭ" },
  { value: "aabr", label: "Автоматическая ABR" },
  { value: "abr", label: "ABR" },
];

export const EAR_RESULTS: Option<Exclude<EarResult, "">>[] = [
  { value: "pass", label: "Прошёл" },
  { value: "refer", label: "Не прошёл" },
  { value: "not_done", label: "Не проведено" },
];

/** Программа неонатального скрининга КР по умолчанию. */
export const DEFAULT_NEONATAL_PROGRAM = "гипотиреоз, фенилкетонурия, адреногенитальный синдром";

// ── Семья и быт ─────────────────────────────────────────────────────────────

export const FAMILY_COMPOSITION: Option<Exclude<FamilyComposition, "">>[] = [
  { value: "full", label: "Полная" },
  { value: "single_mother", label: "Неполная (мать)" },
  { value: "single_father", label: "Неполная (отец)" },
  { value: "guardian", label: "Опекун" },
  { value: "foster", label: "Приёмная семья" },
  { value: "institution", label: "Учреждение" },
];

export const HOUSING: Option<Exclude<HousingKind, "">>[] = [
  { value: "apartment", label: "Отдельная квартира" },
  { value: "house", label: "Дом" },
  { value: "rented", label: "Съёмное жильё" },
  { value: "room", label: "Комната" },
  { value: "dormitory", label: "Общежитие" },
  { value: "none", label: "Нет постоянного" },
];

export const INCOME: Option<Exclude<IncomeLevel, "">>[] = [
  { value: "sufficient", label: "Достаточная" },
  { value: "insufficient", label: "Недостаточная" },
];

export const CLIMATE: Option<Exclude<FamilyClimate, "">>[] = [
  { value: "favorable", label: "Благоприятный" },
  { value: "tense", label: "Напряжённый" },
  { value: "conflict", label: "Конфликтный" },
];

export const SANITARY: Option<Exclude<SanitaryState, "">>[] = [
  { value: "satisfactory", label: "Удовлетворительные" },
  { value: "unsatisfactory", label: "Неудовлетворительные" },
];

export const PETS: Option<PetKind>[] = [
  { value: "cat", label: "Кошка" },
  { value: "dog", label: "Собака" },
  { value: "birds", label: "Птицы" },
  { value: "fish", label: "Рыбки" },
  { value: "rodents", label: "Грызуны" },
  { value: "other", label: "Другие" },
];

export const SOCIAL_INFORMANTS: Option<Exclude<SocialInformant, "">>[] = [
  { value: "mother", label: "Мать" },
  { value: "father", label: "Отец" },
  { value: "other_representative", label: "Другой представитель" },
  { value: "medical_record", label: "Медицинские документы" },
];

export const EDUCATION: Option<Exclude<ParentEducation, "">>[] = [
  { value: "incomplete_secondary", label: "Неполное среднее" },
  { value: "secondary", label: "Среднее" },
  { value: "vocational", label: "Среднее профессиональное" },
  { value: "higher", label: "Высшее" },
];

export const EMPLOYMENT: Option<Exclude<ParentEmployment, "">>[] = [
  { value: "working", label: "Работает" },
  { value: "maternity_leave", label: "В декрете" },
  { value: "not_working", label: "Не работает" },
  { value: "studying", label: "Учится" },
  { value: "abroad", label: "Работает за рубежом" },
  { value: "retired", label: "На пенсии" },
];

export const HABITS: Option<ParentHabit>[] = [
  { value: "smoking", label: "Курение" },
  { value: "alcohol", label: "Алкоголь" },
  { value: "drugs", label: "Наркотики" },
];

export const RELATIVE_HEALTH: Option<RelativeHealth>[] = [
  { value: "healthy", label: "Здоров(а)" },
  { value: "ill", label: "Есть болезни" },
  { value: "unknown", label: "Нет сведений" },
];

export const VITAL_STATUS: Option<Exclude<VitalStatus, "">>[] = [
  { value: "alive", label: "Жив(а)" },
  { value: "deceased", label: "Умер(ла)" },
];

// ── Закрытые сведения ───────────────────────────────────────────────────────

export const MARKER_RESULTS: Option<Exclude<MarkerResult, "">>[] = [
  { value: "negative", label: "Отрицательный" },
  { value: "positive", label: "Положительный" },
];

export const TB_CONTACT: Option<Exclude<TbContact, "">>[] = [
  { value: "no", label: "Не было" },
  { value: "yes", label: "Был" },
];

export const TB_PLACES: Option<Exclude<TbContactPlace, "">>[] = [
  { value: "family", label: "В семье" },
  { value: "household", label: "В квартире" },
  { value: "other", label: "Другое" },
];

export const HOUSEHOLD_INFECTIONS: Option<HouseholdInfection>[] = [
  { value: "hepatitis_b", label: "Гепатит B" },
  { value: "hepatitis_c", label: "Гепатит C" },
  { value: "hiv", label: "ВИЧ" },
  { value: "syphilis", label: "Сифилис" },
  { value: "herpes", label: "Герпес" },
];

// ── Родство ─────────────────────────────────────────────────────────────────

/** Поколение родословной: 0 — прадеды, I — бабушки и дедушки, II — родители, III — ребёнок. */
export type Generation = 0 | 1 | 2 | 3;

export interface RelationMeta {
  generation: Generation | null;
  /** Кровный родственник — входит в индекс отягощённости и в рисунок. */
  blood: boolean;
  /** Пол следует из родства. */
  sex: Exclude<PersonSex, ""> | null;
  /** Линия по матери / по отцу обязательна. */
  needsLine: boolean;
}

export const RELATION_META: Record<FamilyRelation, RelationMeta> = {
  mother: { generation: 2, blood: true, sex: "female", needsLine: false },
  father: { generation: 2, blood: true, sex: "male", needsLine: false },
  sibling: { generation: 3, blood: true, sex: null, needsLine: false },
  half_sibling: { generation: 3, blood: true, sex: null, needsLine: true },
  grandmother: { generation: 1, blood: true, sex: "female", needsLine: true },
  grandfather: { generation: 1, blood: true, sex: "male", needsLine: true },
  aunt: { generation: 2, blood: true, sex: "female", needsLine: true },
  uncle: { generation: 2, blood: true, sex: "male", needsLine: true },
  cousin: { generation: 3, blood: true, sex: null, needsLine: true },
  great_grandparent: { generation: 0, blood: true, sex: null, needsLine: true },
  stepfather: { generation: null, blood: false, sex: "male", needsLine: false },
  stepmother: { generation: null, blood: false, sex: "female", needsLine: false },
  guardian: { generation: null, blood: false, sex: null, needsLine: false },
  other: { generation: null, blood: false, sex: null, needsLine: false },
};

/** Пункт плоского списка родства в окне: строка раскладывается в три поля. */
export interface RelationChoice {
  key: string;
  label: string;
  relation: FamilyRelation;
  line: FamilyLine;
  sex: PersonSex;
}

const by = (line: FamilyLine) => (line === "maternal" ? "по матери" : "по отцу");

export const RELATION_CHOICES: ReadonlyArray<RelationChoice> = [
  { key: "mother", label: "Мать", relation: "mother", line: "", sex: "female" },
  { key: "father", label: "Отец", relation: "father", line: "", sex: "male" },
  { key: "brother", label: "Брат", relation: "sibling", line: "", sex: "male" },
  { key: "sister", label: "Сестра", relation: "sibling", line: "", sex: "female" },
  ...(["maternal", "paternal"] as const).map((line) => ({
    key: `half_sibling_${line}`,
    label: `Брат или сестра ${by(line)}`,
    relation: "half_sibling" as const,
    line,
    sex: "" as const,
  })),
  ...(["maternal", "paternal"] as const).flatMap((line) => [
    { key: `grandmother_${line}`, label: `Бабушка ${by(line)}`, relation: "grandmother" as const, line, sex: "female" as const },
    { key: `grandfather_${line}`, label: `Дедушка ${by(line)}`, relation: "grandfather" as const, line, sex: "male" as const },
  ]),
  ...(["maternal", "paternal"] as const).flatMap((line) => [
    { key: `aunt_${line}`, label: `Тётя ${by(line)}`, relation: "aunt" as const, line, sex: "female" as const },
    { key: `uncle_${line}`, label: `Дядя ${by(line)}`, relation: "uncle" as const, line, sex: "male" as const },
  ]),
  ...(["maternal", "paternal"] as const).map((line) => ({
    key: `cousin_${line}`,
    label: `Двоюродный брат или сестра ${by(line)}`,
    relation: "cousin" as const,
    line,
    sex: "" as const,
  })),
  ...(["maternal", "paternal"] as const).map((line) => ({
    key: `great_grandparent_${line}`,
    label: `Прабабушка или прадедушка ${by(line)}`,
    relation: "great_grandparent" as const,
    line,
    sex: "" as const,
  })),
  { key: "stepfather", label: "Отчим", relation: "stepfather", line: "", sex: "male" },
  { key: "stepmother", label: "Мачеха", relation: "stepmother", line: "", sex: "female" },
  { key: "guardian", label: "Опекун", relation: "guardian", line: "", sex: "" },
  { key: "other", label: "Другой", relation: "other", line: "", sex: "" },
];

/** Пункт списка, к которому относится строка паспорта. */
export function relationChoice(member: Pick<FamilyMember, "relation" | "line" | "sex">): RelationChoice {
  const exact = RELATION_CHOICES.find(
    (choice) =>
      choice.relation === member.relation &&
      (choice.line === "" || choice.line === member.line) &&
      (member.relation !== "sibling" || choice.sex === (member.sex || "male")),
  );
  return exact ?? RELATION_CHOICES.find((choice) => choice.relation === member.relation) ?? RELATION_CHOICES[RELATION_CHOICES.length - 1];
}

type RelativeLike = Pick<FamilyMember, "relation" | "line" | "sex">;

const lineWord = (line: FamilyLine): string => (line ? ` ${by(line)}` : "");

/** «Бабушка по отцу», «Брат», «Двоюродная сестра по матери». */
export function relationTitle(member: RelativeLike): string {
  const female = member.sex === "female";
  const male = member.sex === "male";
  switch (member.relation) {
    case "mother":
      return "Мать";
    case "father":
      return "Отец";
    case "sibling":
      return female ? "Сестра" : male ? "Брат" : "Брат или сестра";
    case "half_sibling":
      return `${female ? "Сестра" : male ? "Брат" : "Брат или сестра"}${lineWord(member.line)}`;
    case "grandmother":
      return `Бабушка${lineWord(member.line)}`;
    case "grandfather":
      return `Дедушка${lineWord(member.line)}`;
    case "aunt":
      return `Тётя${lineWord(member.line)}`;
    case "uncle":
      return `Дядя${lineWord(member.line)}`;
    case "cousin":
      return `${female ? "Двоюродная сестра" : male ? "Двоюродный брат" : "Двоюродный брат или сестра"}${lineWord(member.line)}`;
    case "great_grandparent":
      return `${female ? "Прабабушка" : male ? "Прадедушка" : "Прабабушка или прадедушка"}${lineWord(member.line)}`;
    case "stepfather":
      return "Отчим";
    case "stepmother":
      return "Мачеха";
    case "guardian":
      return "Опекун";
    default:
      return "Другой";
  }
}

/** Родительный падеж для абзаца: «у бабушки по отцу». */
export function relationGenitive(member: RelativeLike): string {
  const female = member.sex === "female";
  switch (member.relation) {
    case "mother":
      return "матери";
    case "father":
      return "отца";
    case "sibling":
      return female ? "сестры" : "брата";
    case "half_sibling":
      return `${female ? "сестры" : "брата"}${lineWord(member.line)}`;
    case "grandmother":
      return `бабушки${lineWord(member.line)}`;
    case "grandfather":
      return `дедушки${lineWord(member.line)}`;
    case "aunt":
      return `тёти${lineWord(member.line)}`;
    case "uncle":
      return `дяди${lineWord(member.line)}`;
    case "cousin":
      return `${female ? "двоюродной сестры" : "двоюродного брата"}${lineWord(member.line)}`;
    case "great_grandparent":
      return `${female ? "прабабушки" : "прадедушки"}${lineWord(member.line)}`;
    default:
      return relationTitle(member).toLowerCase();
  }
}

/** Роль под символом родословной: «дедушка», «мама», «брат». */
export function relationRole(member: RelativeLike): string {
  const female = member.sex === "female";
  switch (member.relation) {
    case "mother":
      return "мама";
    case "father":
      return "папа";
    case "sibling":
      return female ? "сестра" : "брат";
    case "half_sibling":
      return female ? "сестра" : "брат";
    case "grandmother":
      return "бабушка";
    case "grandfather":
      return "дедушка";
    case "aunt":
      return "тётя";
    case "uncle":
      return "дядя";
    case "cousin":
      return female ? "двоюр. сестра" : "двоюр. брат";
    case "great_grandparent":
      return female ? "прабабушка" : "прадедушка";
    default:
      return relationTitle(member).toLowerCase();
  }
}

/** Пол строки: из родства, иначе выбранный. */
export function memberSex(member: Pick<FamilyMember, "relation" | "sex">): PersonSex {
  return RELATION_META[member.relation]?.sex ?? member.sex ?? "";
}

// ── Группы риска ────────────────────────────────────────────────────────────

export interface RiskGroupMeta {
  /** На экране — полное название. */
  label: string;
  /** Метка и абзац — коротко: «ЦНС», «ВУИ». */
  short: string;
  paragraph: string;
}

export const RISK_GROUP_META: Record<RiskGroup, RiskGroupMeta> = {
  cns: { label: "Патология ЦНС", short: "ЦНС", paragraph: "ЦНС" },
  infection: { label: "Внутриутробное инфицирование", short: "ВУИ", paragraph: "ВУИ" },
  trophic_endocrine: { label: "Трофические нарушения и эндокринопатии", short: "Трофические нарушения", paragraph: "трофические нарушения" },
  malformations: { label: "Врождённые пороки и наследственные болезни", short: "ВПР", paragraph: "ВПР" },
  allergic: { label: "Аллергия", short: "Аллергия", paragraph: "аллергия" },
  social: { label: "Социальный риск", short: "Социальный риск", paragraph: "социальный риск" },
  hearing: { label: "Тугоухость и глухота", short: "Тугоухость", paragraph: "тугоухость" },
  anemia: { label: "Анемия", short: "Анемия", paragraph: "анемия" },
  sids: { label: "Синдром внезапной смерти", short: "СВС", paragraph: "СВС" },
  frequent_ari: { label: "Частые ОРИ", short: "Частые ОРИ", paragraph: "частые ОРИ" },
};

export const RISK_GROUP_ORDER = Object.keys(RISK_GROUP_META) as RiskGroup[];

export const RISK_STATUS_LABELS: Record<RiskGroupStatus, string> = {
  active: "установлена",
  removed: "снята",
  realized: "реализовалась",
  declined: "не поставлена",
  refuted: "ошибочно внесена",
};

export const REVIEW_DECISIONS: Option<RiskReviewDecision>[] = [
  { value: "keep", label: "Оставить" },
  { value: "remove", label: "Снять — риск не реализовался" },
  { value: "realized", label: "Реализовалась" },
];

// ── Оценки и шкалы ──────────────────────────────────────────────────────────

export type GenealogicalScale = "kildiyarova" | "minsk" | "ufa";
export type BiologicalScale = "kildiyarova" | "minsk";
export type SocialScale = "kildiyarova" | "binary";

export interface AnamnesisScales {
  genealogical: GenealogicalScale;
  biological: BiologicalScale;
  social: SocialScale;
}

/** Шкалы по умолчанию — Кильдиярова (2019); выбор шкал — 2-я очередь. */
export const DEFAULT_SCALES: AnamnesisScales = { genealogical: "kildiyarova", biological: "kildiyarova", social: "kildiyarova" };

export type AssessmentLevel =
  | "none"
  | "low"
  | "moderate"
  | "pronounced"
  | "high"
  | "favorable"
  | "burdened"
  | "conditional"
  | "unfavorable";

export type AssessmentKind = "genealogical" | "biological" | "social";

/** Уровни каждой шкалы по порядку — для ступеней и окна ручной оценки. */
export const SCALE_LEVELS: Record<AssessmentKind, Record<string, ReadonlyArray<AssessmentLevel>>> = {
  genealogical: {
    kildiyarova: ["none", "low", "moderate", "pronounced", "high"],
    minsk: ["favorable", "burdened"],
    ufa: ["favorable", "conditional", "unfavorable"],
  },
  biological: {
    kildiyarova: ["none", "low", "moderate", "pronounced", "high"],
    minsk: ["favorable", "conditional", "unfavorable"],
  },
  social: {
    kildiyarova: ["favorable", "low", "moderate", "pronounced", "high"],
    binary: ["favorable", "unfavorable"],
  },
};

/** Крупное слово оценки на обзоре. */
export function levelTitle(kind: AssessmentKind, level: AssessmentLevel): string {
  switch (level) {
    case "none":
      return "Не отягощён";
    case "low":
      return "Низкая";
    case "moderate":
      return "Умеренная";
    case "pronounced":
      return "Выраженная";
    case "high":
      return "Высокая";
    case "favorable":
      return kind === "genealogical" ? "Не отягощён" : "Благополучный";
    case "burdened":
      return "Отягощён";
    case "conditional":
      return "Условно благополучный";
    default:
      return "Неблагополучный";
  }
}

/** Цвет оценки: не отягощён и низкая — зелёный, умеренная и выраженная — жёлтый, высокая и «неблагополучный» — красный. */
export function levelTone(level: AssessmentLevel): Tone {
  if (level === "none" || level === "low" || level === "favorable") return "ok";
  if (level === "moderate" || level === "pronounced" || level === "conditional") return "warn";
  return "bad";
}

// ── Вход чистых функций ─────────────────────────────────────────────────────

export interface SurgeryItem {
  kind: "operation" | "injury" | "procedure" | "transfusion";
  performedOn: string;
  title: string;
  /** Для переливания: `exchange` — заменное. */
  transfusionProduct?: string;
  status?: string;
}

/** «Операции и травмы» (соседнее ТЗ); отметки «не было» печатают отрицание. */
export interface SurgeriesInput {
  items: SurgeryItem[];
  noneOperations: boolean;
  noneInjuries: boolean;
  noneTransfusions: boolean;
}

export interface VaccinationsInput {
  records: Array<{ vaccineName: string; administeredAt: string; status: string }>;
  schedule: Array<{ vaccineName: string; status: string; scheduledDate: string }>;
}

export type AnamnesisProfile = Pick<
  HealthProfile,
  | "gestationalAgeWeeks"
  | "gestationalAgeDays"
  | "birthWeightG"
  | "birthLengthCm"
  | "birthHeadCircumferenceCm"
  | "apgar1min"
  | "apgar5min"
  | "deliveryType"
  | "maternityHospital"
  | "maternityDischargedOn"
  | "perinatalNotes"
  | "bloodGroup"
  | "rhFactor"
  | "noKnownAllergies"
>;

/**
 * Всё, из чего считаются оценки, группы и абзац. Собирает `useAnamnesisInput`
 * из ответов `growth/`, `health/`, `conditions/`, `family/`, `life-anamnesis/`,
 * прививок и соседних разделов (ТЗ §2.11–2.12).
 */
export interface AnamnesisInput {
  sex: ChildSex;
  birthDate: string | null;
  profile: AnamnesisProfile | null;
  perinatal: PerinatalHistory | null;
  social: LifeAnamnesisSocial | null;
  /** null — нет права на закрытые сведения или записи нет. */
  sensitive: SensitiveHistory | null;
  sensitiveAccess: boolean;
  sensitiveFilled: boolean;
  screenings: NeonatalScreening[];
  riskGroups: RiskGroupRecord[];
  family: FamilyMember[];
  /** Действующие аллергии. */
  allergies: Array<Pick<Allergy, "allergen" | "reaction" | "category"> & { isConfirmed?: boolean }>;
  /** Диагнозы медкарты, кроме ошибочно внесённых. */
  conditions: Array<Pick<Condition, "id" | "diagnosisCode" | "title" | "diagnosedOn">>;
  hospitalizations: Array<Pick<Hospitalization, "conditionId" | "admittedOn">>;
  /** Отметка «Истории болезней» «перенесённых заболеваний не было»; null — отметки нет. */
  noPastIllnesses: boolean | null;
  feeding: Array<Pick<FeedingPeriod, "feedingType" | "startedOn" | "switchReason">>;
  complementaryFeedingOn: string | null;
  /** null — раздел «Операции и травмы» не подключён. */
  surgeries: SurgeriesInput | null;
  /** null — нет права `vaccinations.view` или модуль выключен. */
  vaccinations: VaccinationsInput | null;
}
