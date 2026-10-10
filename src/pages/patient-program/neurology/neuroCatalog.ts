import { optionLabel, type Option } from "../ortho/orthoCatalog";

/**
 * Каталоги раздела «Неврология и развитие» (ТЗ §3.10–3.12): быстрые кнопки
 * осмотра, диагнозы и заключения с МКБ-10, шаблоны рекомендаций. В записи
 * лежат только коды, подписи — здесь.
 */

export { optionLabel, type Option };

/** Пол ребёнка для подписей: «ходит сам» / «ходит сама»; null — «сам(а)». */
export type Sex = "male" | "female" | null;

export function sexOf(value: string | null | undefined): Sex {
  return value === "male" || value === "female" ? value : null;
}

/** «{а}» в подписи: «Ходит сам{а}» → «Ходит сама» / «Ходит сам» / «Ходит сам(а)». */
export function gendered(text: string, sex: Sex): string {
  return text.replace(/\{([^}]*)\}/g, (_match, ending: string) =>
    sex === "female" ? ending : sex === "male" ? "" : `(${ending})`,
  );
}

/** Сторона, где слабее или больше: D — справа, S — слева. */
export type BodySide = "D" | "S";

export const BODY_SIDES: ReadonlyArray<Option<BodySide>> = [
  { value: "D", label: "D (справа)" },
  { value: "S", label: "S (слева)" },
];

// ── Вид осмотра ──────────────────────────────────────────────────────────────

export type ExamType = "pediatric" | "neurologist" | "control";

export const EXAM_TYPES: ReadonlyArray<Option<ExamType> & { title: string }> = [
  { value: "pediatric", label: "Педиатр — скрининг", title: "Скрининг развития" },
  { value: "neurologist", label: "Невролог", title: "Осмотр невролога" },
  { value: "control", label: "Контроль", title: "Контрольный осмотр невролога" },
];

export const PLANNED_TITLE = "Плановый осмотр невролога";
export const MILESTONES_TITLE = "Отметка вех развития";

export const COMPLAINTS: ReadonlyArray<Option> = [
  { value: "none", label: "Нет жалоб" },
  { value: "sleep", label: "Беспокойный сон" },
  { value: "startle", label: "Вздрагивания, тремор" },
  { value: "motor_delay", label: "Отстаёт в движениях" },
  { value: "speech_delay", label: "Не говорит или мало слов" },
  { value: "understanding", label: "Плохо понимает речь" },
  { value: "contact", label: "Не откликается на имя, избегает взгляда" },
  { value: "hyperactivity", label: "Гиперактивность, невнимательность" },
  { value: "tics", label: "Тики" },
  { value: "seizures", label: "Приступы, судороги, обмороки" },
  { value: "headache", label: "Головные боли" },
  { value: "incontinence", label: "Недержание мочи" },
  { value: "head_tilt", label: "Наклоняет голову набок" },
];

// ── Тонус ────────────────────────────────────────────────────────────────────

export type ToneState = "normal" | "physiological" | "high" | "low" | "dystonia" | "spastic" | "rigid";

export const TONE_STATES: ReadonlyArray<Option<ToneState>> = [
  { value: "normal", label: "Норма" },
  { value: "physiological", label: "Физиологический (до 4 мес)" },
  { value: "high", label: "Повышен" },
  { value: "low", label: "Снижен («поза лягушки»)" },
  { value: "dystonia", label: "Дистония (меняющийся)" },
  { value: "spastic", label: "Спастичность" },
  { value: "rigid", label: "Ригидность" },
];

/** Тонус словами в метке: «нормотонус», «дистония». */
export const TONE_WORDS: Record<ToneState, string> = {
  normal: "нормотонус",
  physiological: "физиологический гипертонус",
  high: "повышен",
  low: "снижен",
  dystonia: "дистония",
  spastic: "спастичность",
  rigid: "ригидность",
};

export type TonePattern = "flexor" | "extensor" | "adductor" | "equinus";

export const TONE_PATTERNS: ReadonlyArray<Option<TonePattern>> = [
  { value: "flexor", label: "сгибателей" },
  { value: "extensor", label: "разгибателей" },
  { value: "adductor", label: "приводящих («ножницы»)" },
  { value: "equinus", label: "стопы в эквинусе" },
];

/** Распределение: `asym` — асимметрия без уточнения стороны (быстрый осмотр). */
export type Symmetry = "equal" | "d_gt_s" | "s_gt_d" | "asym";

export const SYMMETRY: ReadonlyArray<Option<Symmetry>> = [
  { value: "equal", label: "D = S" },
  { value: "d_gt_s", label: "D > S" },
  { value: "s_gt_d", label: "S > D" },
];

export const SYMMETRY_WORDS: Record<Symmetry, string> = {
  equal: "D = S",
  d_gt_s: "D > S",
  s_gt_d: "S > D",
  asym: "асимметрия",
};

export const isAsymmetric = (value: Symmetry | null | undefined): boolean => value != null && value !== "equal";

export type TonePart = "arms" | "legs" | "trunk" | "neck";

export const TONE_PARTS: ReadonlyArray<Option<TonePart>> = [
  { value: "arms", label: "руки" },
  { value: "legs", label: "ноги" },
  { value: "trunk", label: "туловище" },
  { value: "neck", label: "шея" },
];

/** Баллы тонуса по Журбе–Мастюковой с пояснением каждого. */
export const TONE_SCORES: ReadonlyArray<Option<number> & { hint: string }> = [
  { value: 3, label: "3", hint: "симметричный, легко преодолевается" },
  { value: 2, label: "2", hint: "лёгкая непостоянная асимметрия или тенденция к гипо- или гипертонусу, на позу и движения не влияет" },
  { value: 1, label: "1", hint: "постоянная асимметрия, гипо- или гипертонус, ограничивают движения" },
  { value: 0, label: "0", hint: "опистотонус, поза эмбриона или лягушки" },
];

/** Быстрый осмотр: тонус коротко. */
export type QuickTone = "normal" | "low" | "high" | "asym";

export const QUICK_TONE: ReadonlyArray<Option<QuickTone>> = [
  { value: "normal", label: "Норма" },
  { value: "low", label: "Снижен" },
  { value: "high", label: "Повышен" },
  { value: "asym", label: "Асимметрия" },
];

// ── Рефлексы ─────────────────────────────────────────────────────────────────

export type ReflexState = "present" | "absent" | "asym" | "obligatory";

export const REFLEX_STATES: ReadonlyArray<Option<ReflexState>> = [
  { value: "present", label: "есть" },
  { value: "absent", label: "нет" },
  { value: "asym", label: "асимм." },
];

export const OBLIGATORY: Option<ReflexState> = { value: "obligatory", label: "облигатный" };

export type TendonLevel = "normal" | "brisk" | "high" | "low" | "absent";

export const TENDON_LEVELS: ReadonlyArray<Option<TendonLevel>> = [
  { value: "normal", label: "живые" },
  { value: "brisk", label: "оживлены" },
  { value: "high", label: "высокие, с расширением зон" },
  { value: "low", label: "снижены" },
  { value: "absent", label: "отсутствуют" },
];

export type Clonus = "none" | "exhaustible" | "sustained";

export const CLONUS: ReadonlyArray<Option<Clonus>> = [
  { value: "none", label: "нет" },
  { value: "exhaustible", label: "истощаемый" },
  { value: "sustained", label: "неистощаемый" },
];

// ── Черепные нервы ───────────────────────────────────────────────────────────

export const EYES: ReadonlyArray<Option> = [
  { value: "equal", label: "D = S" },
  { value: "ptosis", label: "птоз" },
  { value: "anisocoria", label: "анизокория" },
];

export const STRABISMUS: ReadonlyArray<Option> = [
  { value: "none", label: "нет" },
  { value: "intermittent", label: "непостоянное" },
  { value: "constant", label: "постоянное" },
];

export const NYSTAGMUS: ReadonlyArray<Option> = [
  { value: "none", label: "нет" },
  { value: "positional", label: "установочный" },
  { value: "spontaneous", label: "спонтанный" },
];

export const FACE: ReadonlyArray<Option> = [
  { value: "symmetric", label: "симметрично" },
  { value: "nasolabial", label: "сглажена носогубная складка" },
  { value: "palsy", label: "парез лицевого нерва" },
];

export const HEARING: ReadonlyArray<Option> = [
  { value: "reacts", label: "реагирует" },
  { value: "doubtful", label: "сомнительно" },
  { value: "no", label: "нет" },
];

export const SUCKING: ReadonlyArray<Option> = [
  { value: "active", label: "активное" },
  { value: "weak", label: "вялое" },
  { value: "chokes", label: "поперхивается" },
];

export const CRY: ReadonlyArray<Option> = [
  { value: "loud", label: "громкий" },
  { value: "weak", label: "слабый" },
  { value: "shrill", label: "пронзительный" },
];

export const TONGUE: ReadonlyArray<Option> = [
  { value: "midline", label: "по средней линии" },
  { value: "deviates", label: "отклоняется" },
  { value: "fasciculations", label: "фасцикуляции" },
];

// ── Голова ───────────────────────────────────────────────────────────────────

export const HEAD_SHAPES: ReadonlyArray<Option> = [
  { value: "normal", label: "норма" },
  { value: "plagiocephaly", label: "плагиоцефалия" },
  { value: "synostosis_suspected", label: "подозрение на краниосиностоз (гребень по шву)" },
  { value: "cephalohematoma", label: "кефалогематома" },
];

export type FontanelleState = "normal" | "tense" | "bulging" | "sunken" | "closed";

export const FONTANELLE_STATES: ReadonlyArray<Option<FontanelleState>> = [
  { value: "normal", label: "не напряжён" },
  { value: "tense", label: "напряжён" },
  { value: "bulging", label: "выбухает" },
  { value: "sunken", label: "западает" },
  { value: "closed", label: "закрыт" },
];

export const SMALL_FONTANELLE: ReadonlyArray<Option> = [
  { value: "open", label: "открыт" },
  { value: "closed", label: "закрыт" },
];

export const SUTURES: ReadonlyArray<Option> = [
  { value: "normal", label: "норма" },
  { value: "diastasis", label: "расхождение" },
];

// ── Движения ─────────────────────────────────────────────────────────────────

export type Paresis = "none" | "mono" | "hemi" | "para" | "tetra";

export const PARESIS: ReadonlyArray<Option<Paresis>> = [
  { value: "none", label: "нет" },
  { value: "mono", label: "монопарез" },
  { value: "hemi", label: "гемипарез" },
  { value: "para", label: "нижний парапарез" },
  { value: "tetra", label: "тетрапарез" },
];

export const INVOLUNTARY: ReadonlyArray<Option> = [
  { value: "tremor_cry", label: "тремор подбородка и рук при плаче" },
  { value: "tremor_body", label: "тремор всего тела" },
  { value: "tics_motor", label: "моторные тики" },
  { value: "tics_vocal", label: "вокальные тики" },
  { value: "stereotypies", label: "стереотипии" },
  { value: "hyperkinesis", label: "гиперкинезы" },
  { value: "myoclonus", label: "миоклонии" },
];

export const GAIT: ReadonlyArray<Option> = [
  { value: "normal", label: "норма" },
  { value: "unsteady", label: "неустойчивая" },
  { value: "ataxic", label: "атактическая" },
  { value: "toe", label: "на носках" },
  { value: "spastic", label: "спастическая" },
  { value: "waddling", label: "«утиная»" },
];

export const FINGER_NOSE: ReadonlyArray<Option> = [
  { value: "ok", label: "выполняет" },
  { value: "miss", label: "промахивается" },
];

export const ROMBERG: ReadonlyArray<Option> = [
  { value: "stable", label: "устойчив" },
  { value: "unstable", label: "неустойчив" },
];

export const POSTURE: ReadonlyArray<Option> = [
  { value: "normal", label: "норма" },
  { value: "impaired", label: "нарушена" },
];

// ── Психоэмоциональная сфера (форма 030-ПО/у) ────────────────────────────────

export const BABBLE: ReadonlyArray<Option> = [
  { value: "yes", label: "да" },
  { value: "weak", label: "не активно" },
  { value: "no", label: "нет" },
];

export const UNDERSTANDING: ReadonlyArray<Option> = [
  { value: "yes", label: "да" },
  { value: "partial", label: "частично" },
  { value: "no", label: "нет" },
];

export const ACTIVE_SPEECH: ReadonlyArray<Option> = [
  { value: "yes", label: "да" },
  { value: "not_using", label: "не пользуется" },
  { value: "no", label: "нет" },
];

export const SENSORY: ReadonlyArray<Option> = [
  { value: "developed", label: "развито" },
  { value: "partial", label: "частично" },
  { value: "not_developed", label: "не развито" },
];

export const CONTACT: ReadonlyArray<Option> = [
  { value: "accessible", label: "доступен" },
  { value: "limited", label: "ограниченно" },
  { value: "inaccessible", label: "недоступен" },
];

export const MOOD: ReadonlyArray<Option> = [
  { value: "even", label: "ровный" },
  { value: "labile", label: "лабильный" },
  { value: "dysphoric", label: "дисфоричный" },
  { value: "anxious", label: "тревожный" },
];

export const INTELLECT: ReadonlyArray<Option> = [
  { value: "normal", label: "без особенностей" },
  { value: "impaired", label: "нарушен" },
];

export const BEHAVIOR: ReadonlyArray<Option> = [
  { value: "avoids_gaze", label: "избегает взгляда" },
  { value: "no_name_response", label: "не откликается на имя" },
  { value: "no_joint_attention", label: "нет совместного внимания" },
  { value: "stereotypies", label: "стереотипии" },
  { value: "hyperactivity", label: "гиперактивность" },
  { value: "impulsivity", label: "импульсивность" },
  { value: "inattention", label: "невнимательность" },
];

export type Questionnaire = "not_done" | "negative" | "positive";

export const QUESTIONNAIRE: ReadonlyArray<Option<Questionnaire>> = [
  { value: "not_done", label: "не проводилась" },
  { value: "negative", label: "отрицательная" },
  { value: "positive", label: "положительная" },
];

// ── Речь ─────────────────────────────────────────────────────────────────────

export interface SpeechDef extends Option {
  /** Пункт каталога диагнозов, который сразу добавляется в заключения. */
  diagnosis?: string;
}

export const SPEECH: ReadonlyArray<SpeechDef> = [
  { value: "normal", label: "соответствует возрасту" },
  { value: "zrr", label: "ЗРР", diagnosis: "speech_delay" },
  { value: "zprr", label: "ЗПРР", diagnosis: "psycho_speech_delay" },
  { value: "onr", label: "ОНР" },
  { value: "dyslalia", label: "дислалия", diagnosis: "dyslalia" },
  { value: "dysarthria", label: "дизартрия (в т. ч. стёртая)", diagnosis: "dysarthria" },
  { value: "alalia_motor", label: "алалия моторная", diagnosis: "alalia_motor" },
  { value: "alalia_sensory", label: "алалия сенсорная", diagnosis: "alalia_sensory" },
  { value: "stuttering", label: "заикание", diagnosis: "stuttering" },
  { value: "echolalia", label: "эхолалии" },
  { value: "regression", label: "регресс речи" },
];

export const ONR_LEVELS: ReadonlyArray<Option<number>> = [
  { value: 1, label: "I" },
  { value: 2, label: "II" },
  { value: 3, label: "III" },
  { value: 4, label: "IV" },
];

// ── Оценка НПР ───────────────────────────────────────────────────────────────

export const NPR_GROUPS: ReadonlyArray<Option<number>> = [
  { value: 1, label: "I" },
  { value: 2, label: "II" },
  { value: 3, label: "III" },
  { value: 4, label: "IV" },
];

export type NprSphere = "thinkingSpeech" | "motor" | "attentionMemory" | "social" | "mentalHealth";

export const NPR_SPHERES: ReadonlyArray<Option<NprSphere>> = [
  { value: "thinkingSpeech", label: "мышление и речь" },
  { value: "motor", label: "моторика" },
  { value: "attentionMemory", label: "внимание и память" },
  { value: "social", label: "социальные контакты" },
  { value: "mentalHealth", label: "психическое здоровье" },
];

export type SphereGrade = "norm" | "deviation";

export const SPHERE_GRADES: ReadonlyArray<Option<SphereGrade>> = [
  { value: "norm", label: "норма" },
  { value: "deviation", label: "с отклонениями" },
];

// ── Сон, экраны, приступы, энурез, головная боль ─────────────────────────────

export const SLEEP_HOURS: ReadonlyArray<Option<number>> = [9, 10, 11, 12, 13, 14, 15, 16, 17].map((value) => ({
  value,
  label: String(value),
}));

export const SLEEP_PROBLEMS: ReadonlyArray<Option> = [
  { value: "falling_asleep", label: "трудности засыпания" },
  { value: "snoring_apnea", label: "храп и остановки дыхания" },
  { value: "night_terrors", label: "ночные страхи" },
  { value: "sleepwalking", label: "снохождение" },
  { value: "bruxism", label: "бруксизм" },
];

export type Screens = "none" | "up_to_1" | "1_2" | "over_2";

export const SCREENS: ReadonlyArray<Option<Screens>> = [
  { value: "none", label: "нет" },
  { value: "up_to_1", label: "до 1 ч" },
  { value: "1_2", label: "1–2 ч" },
  { value: "over_2", label: "больше 2 ч" },
];

export const SEIZURE_KINDS: ReadonlyArray<Option> = [
  { value: "febrile", label: "фебрильные судороги" },
  { value: "afebrile", label: "афебрильные" },
  { value: "breath_holding", label: "аффективно-респираторные" },
  { value: "syncope", label: "обмороки" },
  { value: "unclear", label: "неясные эпизоды" },
];

export const HEADACHE_KINDS: ReadonlyArray<Option> = [
  { value: "tension", label: "напряжения" },
  { value: "migraine", label: "мигренозная" },
  { value: "unspecified", label: "неуточнённая" },
];

export const HEADACHE_FREQUENCY: ReadonlyArray<Option> = [
  { value: "rare", label: "редко" },
  { value: "monthly", label: "раз в месяц" },
  { value: "weekly", label: "раз в неделю" },
  { value: "daily", label: "ежедневно" },
];

// ── Обследования ─────────────────────────────────────────────────────────────

export const STUDY_KINDS: ReadonlyArray<Option> = [
  { value: "nsg", label: "Нейросонография" },
  { value: "eeg", label: "ЭЭГ" },
  { value: "eeg_sleep", label: "ЭЭГ во сне" },
  { value: "video_eeg", label: "Видео-ЭЭГ" },
  { value: "mri", label: "МРТ головного мозга" },
  { value: "ct", label: "КТ" },
  { value: "hearing", label: "Слух (ОАЭ, КСВП)" },
  { value: "fundus", label: "Глазное дно" },
  { value: "enmg", label: "ЭНМГ" },
  { value: "ck", label: "КФК" },
  { value: "tsh", label: "ТТГ" },
  { value: "genetics", label: "Генетика" },
];

export type StudyResult = "normal" | "abnormal" | "above3x";

export const STUDY_RESULTS: ReadonlyArray<Option<StudyResult>> = [
  { value: "normal", label: "норма" },
  { value: "abnormal", label: "отклонения" },
];

export const CK_RESULTS: ReadonlyArray<Option<StudyResult>> = [
  { value: "normal", label: "норма" },
  { value: "abnormal", label: "повышена" },
  { value: "above3x", label: "выше трёх норм" },
];

// ── Тревожные признаки ───────────────────────────────────────────────────────

export interface RedFlagDef extends Option {
  urgent: boolean;
}

export const RED_FLAGS: ReadonlyArray<RedFlagDef> = [
  { value: "regression", label: "Утратил{а} навык: речь, общение или движения", urgent: true },
  { value: "seizure", label: "Судороги или приступ — сейчас или впервые", urgent: true },
  { value: "fontanelle", label: "Родничок напряжён или выбухает (ребёнок спокоен, вертикально)", urgent: true },
  { value: "vomiting_lethargy", label: "Рвота с вялостью", urgent: true },
  { value: "asymmetry", label: "Асимметрия движений, тонуса или рефлексов", urgent: false },
  { value: "handedness", label: "Ранняя «рукость»: явное предпочтение одной руки до 12–18 мес", urgent: false },
  { value: "sunset", label: "Симптом «заходящего солнца»", urgent: false },
];

// ── Диагнозы и заключения (МКБ-10 ВОЗ, редакция 2019) ────────────────────────

export type DiagnosisGroup = "exam" | "infant" | "development" | "seizures" | "movement" | "behavior";

export const DIAGNOSIS_GROUPS: ReadonlyArray<Option<DiagnosisGroup>> = [
  { value: "exam", label: "Заключение осмотра" },
  { value: "infant", label: "Первый год" },
  { value: "development", label: "Развитие и речь" },
  { value: "seizures", label: "Приступы и сон" },
  { value: "movement", label: "Движения и голова" },
  { value: "behavior", label: "Поведение и прочее" },
];

export interface DiagnosisVariant extends Option {
  icd: string;
}

export interface DiagnosisDef extends Option {
  icd: string;
  group: DiagnosisGroup;
  /** Варианты, которые меняют код; первый — по умолчанию. */
  variants?: ReadonlyArray<DiagnosisVariant>;
  /** Нужна сторона: парезы, паралич лицевого нерва, кривошея. */
  sided?: boolean;
  /** Только заключение осмотра — в диагнозы не предлагается. */
  conclusionOnly?: boolean;
  /** Подсказка в окне: «ставит психиатр», «только при подтверждении». */
  warning?: string;
  /** Кнопка даёт неуточнённый код — врач уточняет его в окне диагноза (G40). */
  refine?: boolean;
}

const PSYCHIATRIST = "Ставит психиатр: вносите по заключению психиатра (протокол МЗ КР)";
const SLACK_SPASTIC = (codes: [string, string, string]): DiagnosisVariant[] => [
  { value: "unspecified", label: "неуточнённая", icd: codes[2] },
  { value: "flaccid", label: "вялая", icd: codes[0] },
  { value: "spastic", label: "спастическая", icd: codes[1] },
];

export const DIAGNOSES: ReadonlyArray<DiagnosisDef> = [
  { value: "healthy", label: "Неврологически здоров{а}", icd: "Z00.1", group: "exam", conclusionOnly: true },
  { value: "suspected", label: "Наблюдение при подозрении на болезнь нервной системы", icd: "Z03.3", group: "exam", conclusionOnly: true },

  { value: "cerebral_excitability", label: "Церебральная возбудимость", icd: "P91.3", group: "infant" },
  { value: "cerebral_depression", label: "Церебральная депрессия", icd: "P91.4", group: "infant" },
  { value: "cerebral_ischemia", label: "Церебральная ишемия", icd: "P91.0", group: "infant" },
  { value: "pv_cysts", label: "Перивентрикулярные кисты", icd: "P91.1", group: "infant" },
  { value: "leukomalacia", label: "Лейкомаляция", icd: "P91.2", group: "infant" },
  { value: "hie", label: "Гипоксически-ишемическая энцефалопатия", icd: "P91.6", group: "infant" },
  {
    value: "hydrocephalus_newborn",
    label: "Приобретённая гидроцефалия новорождённого",
    icd: "P91.7",
    group: "infant",
    warning: "P91.7 есть в МКБ-10 ВОЗ, но может отсутствовать в справочнике клиники — проверьте",
  },
  {
    value: "ivh",
    label: "Внутрижелудочковое кровоизлияние",
    icd: "P52.3",
    group: "infant",
    variants: [
      { value: "unspecified", label: "неуточнённое", icd: "P52.3" },
      { value: "deg1", label: "степень 1", icd: "P52.0" },
      { value: "deg2", label: "степень 2", icd: "P52.1" },
      { value: "deg34", label: "степень 3–4", icd: "P52.2" },
    ],
  },
  { value: "birth_injury", label: "Родовая травма ЦНС", icd: "P11.9", group: "infant" },
  { value: "erb", label: "Паралич Эрба", icd: "P14.0", group: "infant", sided: true },
  { value: "neonatal_seizures", label: "Судороги новорождённого", icd: "P90", group: "infant" },
  { value: "congenital_hypertonia", label: "Врождённый гипертонус", icd: "P94.1", group: "infant" },
  { value: "congenital_hypotonia", label: "Врождённая гипотония («вялый ребёнок»)", icd: "P94.2", group: "infant" },
  { value: "dystonia_syndrome", label: "Синдром мышечной дистонии", icd: "P94.8", group: "infant" },

  { value: "dev_delay", label: "Задержка этапов развития", icd: "R62.0", group: "development" },
  { value: "motor_delay", label: "Задержка моторного развития", icd: "F82", group: "development" },
  { value: "dyslalia", label: "Дислалия", icd: "F80.0", group: "development" },
  { value: "speech_delay", label: "Задержка речевого развития (ЗРР)", icd: "F80.1", group: "development" },
  { value: "alalia_motor", label: "Моторная алалия", icd: "F80.1", group: "development" },
  { value: "alalia_sensory", label: "Сенсорная алалия", icd: "F80.2", group: "development" },
  { value: "landau_kleffner", label: "Синдром Ландау–Клеффнера", icd: "F80.3", group: "development" },
  { value: "psycho_speech_delay", label: "Задержка психоречевого развития (ЗПРР)", icd: "F83", group: "development" },
  { value: "dysarthria", label: "Дизартрия", icd: "R47.1", group: "development" },
  { value: "stuttering", label: "Заикание", icd: "F98.5", group: "development" },
  {
    value: "asd",
    label: "Расстройство аутистического спектра",
    icd: "F84.9",
    group: "development",
    warning: PSYCHIATRIST,
    variants: [
      { value: "unspecified", label: "неуточнённое", icd: "F84.9" },
      { value: "childhood", label: "детский аутизм", icd: "F84.0" },
      { value: "atypical", label: "атипичный аутизм", icd: "F84.1" },
    ],
  },

  { value: "febrile_seizures", label: "Фебрильные судороги", icd: "R56.0", group: "seizures" },
  { value: "other_seizures", label: "Другие судороги", icd: "R56.8", group: "seizures" },
  {
    value: "epilepsy",
    label: "Эпилепсия",
    icd: "G40.9",
    group: "seizures",
    refine: true,
    warning: "G40.9 — эпилепсия неуточнённая: уточните форму, исправив код",
  },
  { value: "breath_holding", label: "Аффективно-респираторные приступы", icd: "R06.8", group: "seizures" },
  { value: "syncope", label: "Обморок", icd: "R55", group: "seizures" },
  { value: "sleepwalking", label: "Снохождение", icd: "F51.3", group: "seizures" },
  { value: "night_terrors", label: "Ночные страхи", icd: "F51.4", group: "seizures" },
  { value: "nightmares", label: "Кошмары", icd: "F51.5", group: "seizures" },
  { value: "sleep_apnea", label: "Апноэ сна", icd: "G47.3", group: "seizures" },

  {
    value: "cp",
    label: "ДЦП",
    icd: "G80.9",
    group: "movement",
    variants: [
      { value: "unspecified", label: "неуточнённый", icd: "G80.9" },
      { value: "spastic_tetra", label: "спастический тетрапарез", icd: "G80.0" },
      { value: "diplegia", label: "спастическая диплегия", icd: "G80.1" },
      { value: "hemiplegic", label: "гемиплегический", icd: "G80.2" },
      { value: "dyskinetic", label: "дискинетический", icd: "G80.3" },
      { value: "ataxic", label: "атаксический", icd: "G80.4" },
      { value: "other", label: "другой", icd: "G80.8" },
    ],
  },
  { value: "hemiplegia", label: "Гемиплегия", icd: "G81.9", group: "movement", sided: true, variants: SLACK_SPASTIC(["G81.0", "G81.1", "G81.9"]) },
  { value: "paraplegia", label: "Параплегия", icd: "G82.2", group: "movement", variants: SLACK_SPASTIC(["G82.0", "G82.1", "G82.2"]) },
  { value: "tetraplegia", label: "Тетраплегия", icd: "G82.5", group: "movement", variants: SLACK_SPASTIC(["G82.3", "G82.4", "G82.5"]) },
  { value: "tics_transient", label: "Тики транзиторные", icd: "F95.0", group: "movement" },
  { value: "tics_chronic", label: "Тики хронические", icd: "F95.1", group: "movement" },
  { value: "tourette", label: "Синдром Туретта", icd: "F95.2", group: "movement" },
  { value: "stereotypies", label: "Стереотипии", icd: "F98.4", group: "movement" },
  { value: "tremor", label: "Тремор", icd: "R25.1", group: "movement" },
  { value: "ataxia", label: "Атаксия", icd: "R27.0", group: "movement" },
  { value: "microcephaly", label: "Микроцефалия", icd: "Q02", group: "movement" },
  { value: "macrocephaly", label: "Макроцефалия", icd: "Q75.3", group: "movement" },
  { value: "craniosynostosis", label: "Краниосиностоз", icd: "Q75.0", group: "movement" },
  { value: "plagiocephaly", label: "Плагиоцефалия", icd: "Q67.3", group: "movement" },
  { value: "torticollis_congenital", label: "Врождённая мышечная кривошея", icd: "Q68.0", group: "movement", sided: true },
  { value: "torticollis", label: "Кривошея", icd: "M43.6", group: "movement", sided: true },
  { value: "bell_palsy", label: "Паралич лицевого нерва (Белла)", icd: "G51.0", group: "movement", sided: true },
  {
    value: "sma",
    label: "Спинальная мышечная атрофия",
    icd: "G12.9",
    group: "movement",
    variants: [
      { value: "unspecified", label: "неуточнённая", icd: "G12.9" },
      { value: "type1", label: "тип I", icd: "G12.0" },
      { value: "other", label: "другие наследственные", icd: "G12.1" },
    ],
  },
  {
    value: "hydrocephalus",
    label: "Гидроцефалия",
    icd: "Q03.9",
    group: "movement",
    variants: [
      { value: "congenital", label: "врождённая", icd: "Q03.9" },
      { value: "acquired", label: "приобретённая", icd: "G91.9" },
    ],
  },
  {
    value: "iih",
    label: "Доброкачественная внутричерепная гипертензия",
    icd: "G93.2",
    group: "movement",
    warning: "Ставить только при подтверждении (глазное дно, МРТ): диагноз часто ставят лишний раз",
  },
  {
    value: "vegetative",
    label: "Вегетативная дисфункция",
    icd: "G90.9",
    group: "movement",
    variants: [
      { value: "unspecified", label: "неуточнённая", icd: "G90.9" },
      { value: "other", label: "другая уточнённая", icd: "G90.8" },
    ],
  },

  { value: "adhd", label: "СДВГ", icd: "F90.0", group: "behavior" },
  { value: "enuresis", label: "Энурез", icd: "F98.0", group: "behavior", warning: "Диагноз ставят с 5 лет" },
  { value: "encopresis", label: "Энкопрез", icd: "F98.1", group: "behavior" },
  {
    value: "emotional",
    label: "Эмоциональное расстройство детского возраста",
    icd: "F93.9",
    group: "behavior",
    variants: [
      { value: "unspecified", label: "неуточнённое", icd: "F93.9" },
      { value: "separation", label: "тревога разлуки", icd: "F93.0" },
      { value: "other", label: "другое", icd: "F93.8" },
    ],
  },
  {
    value: "migraine",
    label: "Мигрень",
    icd: "G43.0",
    group: "behavior",
    variants: [
      { value: "no_aura", label: "без ауры", icd: "G43.0" },
      { value: "aura", label: "с аурой", icd: "G43.1" },
    ],
  },
  { value: "tension_headache", label: "Головная боль напряжения", icd: "G44.2", group: "behavior" },
  { value: "headache", label: "Головная боль", icd: "R51", group: "behavior" },
];

export function diagnosisDef(code: string | null | undefined): DiagnosisDef | undefined {
  return DIAGNOSES.find((item) => item.value === code);
}

/** Код по варианту: «степень 2» → P52.1; без варианта — код пункта. */
export function diagnosisIcd(code: string, variant: string | null | undefined): string {
  const def = diagnosisDef(code);
  if (!def) return "";
  return def.variants?.find((item) => item.value === variant)?.icd ?? def.icd;
}

/** Частые заключения — первыми кнопками в окне осмотра. */
export const FREQUENT_CONCLUSIONS: ReadonlyArray<string> = ["healthy", "dystonia_syndrome", "speech_delay", "psycho_speech_delay"];

/** Пункт «неврологически здоров(а)» исключает остальные заключения. */
export const HEALTHY = "healthy";

// ── Рекомендации ─────────────────────────────────────────────────────────────

export type RecommendationGroup = "regime" | "classes" | "studies" | "consult" | "urgent";

export const RECOMMENDATION_GROUPS: ReadonlyArray<Option<RecommendationGroup>> = [
  { value: "regime", label: "Режим и развитие" },
  { value: "classes", label: "Занятия" },
  { value: "studies", label: "Обследования" },
  { value: "consult", label: "Консультации" },
  { value: "urgent", label: "Срочно" },
];

export interface RecommendationDef extends Option {
  text: string;
  group: RecommendationGroup;
}

export const RECOMMENDATIONS: ReadonlyArray<RecommendationDef> = [
  { value: "tummy", label: "Выкладывание на живот", text: "Выкладывание на живот несколько раз в день", group: "regime" },
  { value: "massage", label: "Массаж", text: "Массаж, курс", group: "regime" },
  { value: "lfk", label: "ЛФК", text: "ЛФК", group: "regime" },
  { value: "positioning", label: "Позиционирование, укладки", text: "Позиционирование, укладки", group: "regime" },
  { value: "swimming", label: "Плавание", text: "Плавание", group: "regime" },
  {
    value: "dev_care",
    label: "Уход в целях развития",
    text: "Уход в целях развития: читать, разговаривать, играть каждый день",
    group: "regime",
  },
  { value: "sleep_hygiene", label: "Гигиена сна и режим дня", text: "Гигиена сна и режим дня", group: "regime" },
  { value: "screens", label: "Ограничить экраны", text: "Без экранов до 2 лет, в 2–4 года — не больше 1 ч в день", group: "regime" },
  { value: "speech_therapist", label: "Логопед", text: "Занятия с логопедом", group: "classes" },
  { value: "defectologist", label: "Дефектолог", text: "Занятия с дефектологом", group: "classes" },
  { value: "psychologist", label: "Психолог или нейропсихолог", text: "Занятия с психологом или нейропсихологом", group: "classes" },
  { value: "nsg", label: "Нейросонография", text: "Нейросонография", group: "studies" },
  { value: "eeg", label: "ЭЭГ", text: "ЭЭГ (обычная, во сне, видео-ЭЭГ мониторинг)", group: "studies" },
  { value: "mri", label: "МРТ головного мозга", text: "МРТ головного мозга", group: "studies" },
  { value: "ct", label: "КТ", text: "КТ головы", group: "studies" },
  { value: "hearing", label: "Обследование слуха", text: "Обследование слуха: ОАЭ, КСВП", group: "studies" },
  { value: "fundus", label: "Глазное дно", text: "Осмотр глазного дна", group: "studies" },
  { value: "ck_tsh", label: "КФК и ТТГ", text: "КФК и ТТГ", group: "studies" },
  { value: "enmg", label: "ЭНМГ", text: "ЭНМГ", group: "studies" },
  {
    value: "genetics",
    label: "Генетик",
    text: "Консультация генетика (хромосомный микроматричный анализ, синдром ломкой X)",
    group: "studies",
  },
  { value: "ophthalmologist", label: "Офтальмолог", text: "Консультация офтальмолога", group: "consult" },
  { value: "ent", label: "ЛОР или сурдолог", text: "Консультация ЛОР-врача или сурдолога", group: "consult" },
  { value: "orthopedist", label: "Ортопед", text: "Консультация ортопеда", group: "consult" },
  { value: "psychiatrist", label: "Детский психиатр", text: "Консультация детского психиатра", group: "consult" },
  { value: "epileptologist", label: "Эпилептолог", text: "Консультация эпилептолога", group: "consult" },
  { value: "neurosurgeon", label: "Нейрохирург", text: "Консультация нейрохирурга", group: "consult" },
  { value: "rehab", label: "Реабилитолог", text: "Консультация реабилитолога", group: "consult" },
  { value: "hospital", label: "Срочно в стационар", text: "Срочно в стационар", group: "urgent" },
];

export const NEXT_CHECK: ReadonlyArray<Option<number>> = [
  { value: 1, label: "через 1 мес." },
  { value: 2, label: "через 2 мес." },
  { value: 3, label: "через 3 мес." },
  { value: 6, label: "через 6 мес." },
  { value: 12, label: "через 12 мес." },
];

export type DiagnosisState = "observation" | "treatment" | "resolved";

export const DIAGNOSIS_STATES: ReadonlyArray<Option<DiagnosisState>> = [
  { value: "observation", label: "Наблюдение" },
  { value: "treatment", label: "Лечение" },
  { value: "resolved", label: "Снят" },
];

export const DIAGNOSIS_SIDES: ReadonlyArray<Option<"D" | "S" | "both">> = [
  { value: "D", label: "Справа (D)" },
  { value: "S", label: "Слева (S)" },
  { value: "both", label: "С двух сторон" },
];
