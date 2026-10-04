/**
 * Каталоги раздела «Опорно-двигательная система» (ТЗ §3.4–3.5): быстрые
 * кнопки осмотра, заключения с МКБ-10, шаблоны рекомендаций. Подписи — для
 * людей, значения — коды, которые лежат в `record.data`.
 */

export interface Option<T extends string | number = string> {
  value: T;
  label: string;
}

export function optionLabel<T extends string | number>(options: ReadonlyArray<Option<T>>, value: T | null | undefined): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

export type Side = "L" | "R" | "both";

export const SIDES: ReadonlyArray<Option<Side>> = [
  { value: "L", label: "Слева" },
  { value: "R", label: "Справа" },
  { value: "both", label: "С двух сторон" },
];

export function sideShort(side: Side | null | undefined): string {
  if (side === "L") return "слева";
  if (side === "R") return "справа";
  if (side === "both") return "с двух сторон";
  return "";
}

export type ExamType = "screening" | "orthopedist" | "control";

export const EXAM_TYPES: ReadonlyArray<Option<ExamType> & { title: string }> = [
  { value: "screening", label: "Скрининг педиатра", title: "Скрининг опорно-двигательной системы" },
  { value: "orthopedist", label: "Осмотр ортопеда", title: "Осмотр ортопеда" },
  { value: "control", label: "Контроль", title: "Контрольный осмотр ортопеда" },
];

// ── Тазобедренные суставы ────────────────────────────────────────────────────

export const HIP_RISKS: ReadonlyArray<Option> = [
  { value: "breech", label: "Тазовое предлежание" },
  { value: "family", label: "Дисплазия у родственников" },
  { value: "girl", label: "Девочка" },
  { value: "firstborn", label: "Первые роды" },
  { value: "swaddling", label: "Тугое пеленание или бешик" },
];

export const GRAF_TYPES: ReadonlyArray<Option> = [
  { value: "Ia", label: "Ia" },
  { value: "Ib", label: "Ib" },
  { value: "IIa", label: "IIa" },
  { value: "IIa+", label: "IIa(+)" },
  { value: "IIa-", label: "IIa(−)" },
  { value: "IIb", label: "IIb" },
  { value: "IIc", label: "IIc" },
  { value: "D", label: "D" },
  { value: "IIIa", label: "IIIa" },
  { value: "IIIb", label: "IIIb" },
  { value: "IV", label: "IV" },
];

export type SplintKind = "pavlik" | "freyka" | "vilensky";

export const SPLINTS: ReadonlyArray<Option<SplintKind>> = [
  { value: "pavlik", label: "Стремена Павлика" },
  { value: "freyka", label: "Подушка Фрейка" },
  { value: "vilensky", label: "Шина Виленского" },
];

// ── Шея ──────────────────────────────────────────────────────────────────────

export type TorticollisKind = "none" | "muscular" | "positional" | "bony" | "other";

export const TORTICOLLIS: ReadonlyArray<Option<TorticollisKind>> = [
  { value: "none", label: "Нет" },
  { value: "muscular", label: "Мышечная" },
  { value: "positional", label: "Позиционная" },
  { value: "bony", label: "Костная" },
  { value: "other", label: "Другая" },
];

export const ROTATION_DIFF_CHOICES: ReadonlyArray<Option<number>> = [
  { value: 10, label: "до 15°" },
  { value: 20, label: "15–30°" },
  { value: 35, label: "больше 30°" },
];

// ── Стопы ────────────────────────────────────────────────────────────────────

export type ArchType = "high" | "normal" | "flattened" | "flat";

export const ARCHES: ReadonlyArray<Option<ArchType>> = [
  { value: "normal", label: "Норма" },
  { value: "flattened", label: "Уплощён" },
  { value: "flat", label: "Плоский" },
  { value: "high", label: "Высокий" },
];

export type FootMobility = "mobile" | "rigid";

export const MOBILITY: ReadonlyArray<Option<FootMobility>> = [
  { value: "mobile", label: "Мобильная (свод на носках есть)" },
  { value: "rigid", label: "Ригидная" },
];

export const FOOT_FINDINGS: ReadonlyArray<Option> = [
  { value: "clubfoot", label: "Косолапость" },
  { value: "adductus", label: "Приведение переднего отдела" },
  { value: "calcaneovalgus", label: "Пяточно-вальгусная установка" },
  { value: "cavus", label: "Полая стопа" },
  { value: "halluxValgus", label: "Вальгус I пальца" },
  { value: "verticalTalus", label: "Вертикальный таран" },
  { value: "coalition", label: "Подозрение на коалицию" },
];

/** Угол пятки кнопками: плюс — вальгус, минус — варус. */
export const HEEL_CHOICES: ReadonlyArray<Option<number>> = [
  { value: -5, label: "вар 5°" },
  { value: 0, label: "0°" },
  { value: 5, label: "5°" },
  { value: 8, label: "8°" },
  { value: 10, label: "10°" },
  { value: 12, label: "12°" },
  { value: 15, label: "15°" },
  { value: 20, label: "20°" },
];

// ── Ноги и походка ───────────────────────────────────────────────────────────

export type LegAxis = "neutral" | "varus" | "valgus";

export const LEG_AXES: ReadonlyArray<Option<LegAxis>> = [
  { value: "neutral", label: "Прямые" },
  { value: "varus", label: "О-образные (варус)" },
  { value: "valgus", label: "Х-образные (вальгус)" },
];

export const GAIT: ReadonlyArray<Option> = [
  { value: "normal", label: "Обычная" },
  { value: "limp", label: "Хромает" },
  { value: "inToeing", label: "Носки внутрь" },
  { value: "outToeing", label: "Носки наружу" },
  { value: "toeWalking", label: "На носках" },
  { value: "waddling", label: "Утиная" },
  { value: "falls", label: "Часто падает" },
];

// ── Позвоночник и осанка ─────────────────────────────────────────────────────

export type PostureType = "normal" | "stooped" | "round" | "roundConcave" | "flat" | "flatConcave";

export const POSTURES: ReadonlyArray<Option<PostureType>> = [
  { value: "normal", label: "Нормальная" },
  { value: "stooped", label: "Сутулая" },
  { value: "round", label: "Круглая" },
  { value: "roundConcave", label: "Кругло-вогнутая" },
  { value: "flat", label: "Плоская" },
  { value: "flatConcave", label: "Плоско-вогнутая" },
];

export const ASYMMETRIES: ReadonlyArray<Option> = [
  { value: "headTilt", label: "Наклон головы" },
  { value: "shoulder", label: "Надплечье выше" },
  { value: "scapula", label: "Лопатка выше" },
  { value: "wingedScapula", label: "Крыловидные лопатки" },
  { value: "waist", label: "Треугольник талии" },
  { value: "pelvis", label: "Перекос таза" },
];

/** Скрининг-карта осанки (сад, школа): «да» на вопрос — повод присмотреться. */
export const POSTURE_CARD: ReadonlyArray<Option<number>> = [
  { value: 1, label: "Явное повреждение органов движения" },
  { value: 2, label: "Голова, плечи, лопатки или таз несимметричны" },
  { value: 3, label: "Деформация грудной клетки" },
  { value: 4, label: "Изгибы позвоночника сильно увеличены или сглажены" },
  { value: 5, label: "Крыловидные лопатки" },
  { value: 6, label: "Живот выступает больше чем на 2 см" },
  { value: 7, label: "О- или Х-образные ноги" },
  { value: 8, label: "Треугольники талии неравны" },
  { value: 9, label: "Пятки отклонены наружу стоя" },
  { value: 10, label: "Явные отклонения походки" },
];

export type AdamsResult = "negative" | "rib" | "lumbar";

export const ADAMS: ReadonlyArray<Option<AdamsResult>> = [
  { value: "negative", label: "Отрицательный" },
  { value: "rib", label: "Рёберный горб" },
  { value: "lumbar", label: "Поясничный валик" },
];

export const ATR_CHOICES: ReadonlyArray<Option<number>> = [0, 2, 3, 4, 5, 6, 7, 8, 10].map((value) => ({
  value,
  label: `${value}°`,
}));

// ── Прочее ───────────────────────────────────────────────────────────────────

export type ChestShape = "normal" | "funnel" | "keel" | "asymmetric";

export const CHEST: ReadonlyArray<Option<ChestShape>> = [
  { value: "normal", label: "Обычная" },
  { value: "funnel", label: "Воронкообразная" },
  { value: "keel", label: "Килевидная" },
  { value: "asymmetric", label: "Асимметричная" },
];

export const RED_FLAGS: ReadonlyArray<Option> = [
  { value: "nightPain", label: "Боль ночью или в покое" },
  { value: "limp", label: "Хромота" },
  { value: "swelling", label: "Отёк сустава" },
  { value: "rapid", label: "Быстрое ухудшение" },
  { value: "rigidFoot", label: "Ригидная стопа" },
  { value: "neuro", label: "Неврологические признаки" },
];

export const NEXT_CHECK: ReadonlyArray<Option<number>> = [
  { value: 1, label: "через 1 мес." },
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

// ── Заключения и хронические диагнозы ────────────────────────────────────────

export type OrthoBlock = "hips" | "neck" | "foot" | "legs" | "spine" | "other";

export interface DiagnosisDef extends Option {
  icd: string;
  block: OrthoBlock;
  /** Вариант нормы: только в заключении осмотра, без кода и без хронических. */
  variant?: boolean;
  /** «Норма» — исключает остальные заключения. */
  normal?: boolean;
}

export const CONCLUSIONS: ReadonlyArray<DiagnosisDef> = [
  { value: "normal", label: "Норма", icd: "", block: "other", normal: true },
  { value: "hipImmature", label: "Незрелость суставов (IIa) — вариант нормы", icd: "", block: "hips", variant: true },
  { value: "hipDysplasia", label: "Дисплазия тазобедренного сустава", icd: "Q65.8", block: "hips" },
  { value: "hipUnstable", label: "Неустойчивое бедро", icd: "Q65.6", block: "hips" },
  { value: "hipSubluxation", label: "Подвывих бедра", icd: "Q65.5", block: "hips" },
  { value: "hipDislocation", label: "Вывих бедра", icd: "Q65.2", block: "hips" },
  { value: "torticollisCongenital", label: "Мышечная кривошея", icd: "Q68.0", block: "neck" },
  { value: "torticollisAcquired", label: "Кривошея приобретённая", icd: "M43.6", block: "neck" },
  { value: "plagiocephaly", label: "Плагиоцефалия", icd: "Q67.3", block: "neck" },
  { value: "flatfootPhysiological", label: "Физиологическое плоскостопие — вариант нормы", icd: "", block: "foot", variant: true },
  { value: "planovalgus", label: "Плоско-вальгусная стопа", icd: "M21.07", block: "foot" },
  { value: "flatfootSymptomatic", label: "Плоскостопие с жалобами", icd: "M21.4", block: "foot" },
  { value: "flatfootCongenital", label: "Врождённая плоская стопа", icd: "Q66.5", block: "foot" },
  { value: "clubfoot", label: "Косолапость", icd: "Q66.0", block: "foot" },
  { value: "metatarsusAdductus", label: "Приведение стопы", icd: "Q66.2", block: "foot" },
  { value: "calcaneovalgus", label: "Пяточно-вальгусная стопа", icd: "Q66.4", block: "foot" },
  { value: "cavus", label: "Полая стопа", icd: "Q66.7", block: "foot" },
  { value: "halluxValgus", label: "Вальгус I пальца", icd: "M20.1", block: "foot" },
  { value: "legsPhysiological", label: "Физиологический варус или вальгус ног — вариант нормы", icd: "", block: "legs", variant: true },
  { value: "genuValgum", label: "Вальгус коленей", icd: "M21.06", block: "legs" },
  { value: "genuVarum", label: "Варус коленей", icd: "M21.16", block: "legs" },
  { value: "legLength", label: "Разная длина ног", icd: "M21.7", block: "legs" },
  { value: "postureDisorder", label: "Нарушение осанки", icd: "M40.0", block: "spine" },
  { value: "scoliosisJuvenile", label: "Сколиоз юношеский идиопатический", icd: "M41.1", block: "spine" },
  { value: "scoliosisInfantile", label: "Сколиоз инфантильный", icd: "M41.0", block: "spine" },
  { value: "kyphosis", label: "Кифоз", icd: "M40.2", block: "spine" },
  { value: "scheuermann", label: "Болезнь Шейермана — Мау", icd: "M42.0", block: "spine" },
  { value: "funnelChest", label: "Воронкообразная грудь", icd: "Q67.6", block: "other" },
  { value: "keelChest", label: "Килевидная грудь", icd: "Q67.7", block: "other" },
  { value: "hypermobility", label: "Гипермобильность суставов", icd: "M35.7", block: "other" },
  { value: "osgood", label: "Болезнь Осгуда — Шлаттера", icd: "M92.5", block: "legs" },
  { value: "sever", label: "Болезнь Севера", icd: "M92.6", block: "foot" },
  { value: "perthes", label: "Болезнь Пертеса", icd: "M91.1", block: "hips" },
  { value: "scfe", label: "Эпифизеолиз головки бедра", icd: "M93.0", block: "hips" },
];

export function diagnosisDef(code: string): DiagnosisDef | undefined {
  return CONCLUSIONS.find((item) => item.value === code);
}

/** Хронические диагнозы — всё, кроме нормы и вариантов нормы. */
export const CHRONIC_DIAGNOSES: ReadonlyArray<DiagnosisDef> = CONCLUSIONS.filter((item) => !item.normal && !item.variant);

// ── Рекомендации ─────────────────────────────────────────────────────────────

export interface RecommendationDef extends Option {
  text: string;
  block: OrthoBlock;
}

export const RECOMMENDATIONS: ReadonlyArray<RecommendationDef> = [
  { value: "wideSwaddling", label: "Широкое пеленание", text: "Широкое пеленание", block: "hips" },
  {
    value: "noBeshik",
    label: "Не укладывать в бешик с выпрямленными ножками",
    text: "Не пеленать туго и не укладывать в бешик с выпрямленными ножками",
    block: "hips",
  },
  { value: "usIn6Weeks", label: "Контроль УЗИ через 6 нед", text: "Контроль УЗИ тазобедренных суставов через 6 недель", block: "hips" },
  { value: "usAt3Months", label: "УЗИ суставов в 3 мес", text: "УЗИ тазобедренных суставов в 3 месяца", block: "hips" },
  { value: "pavlik", label: "Стремена Павлика", text: "Стремена Павлика", block: "hips" },
  { value: "hipXray", label: "Рентген суставов", text: "Рентгенография тазобедренных суставов", block: "hips" },
  { value: "positioning", label: "Лечение положением", text: "Лечение положением", block: "neck" },
  { value: "neckStretch", label: "Растяжение мышцы шеи", text: "Упражнения на растяжение грудино-ключично-сосцевидной мышцы", block: "neck" },
  { value: "massage", label: "Массаж", text: "Массаж", block: "neck" },
  { value: "neckControl", label: "Контроль через 2–4 нед", text: "Контрольный осмотр через 2–4 недели", block: "neck" },
  {
    value: "feetPhysiological",
    label: "Физиологично, лечение не нужно",
    text: "Плоскостопие физиологическое для возраста, лечение не требуется",
    block: "foot",
  },
  { value: "softShoes", label: "Мягкая удобная обувь", text: "Мягкая удобная обувь", block: "foot" },
  { value: "footExercises", label: "Упражнения для стоп", text: "Упражнения для мышц стоп и растяжка голени", block: "foot" },
  // По КР РФ «Плоскостопие у детей» (2025) стельки не исправляют форму стопы —
  // шаблон есть, но сам не отмечается и говорит «только от боли».
  { value: "insoles", label: "Стельки только от боли", text: "Стельки — только для облегчения боли, не для коррекции формы", block: "foot" },
  { value: "footXray", label: "Рентген стоп стоя", text: "Рентгенография стоп стоя в двух проекциях", block: "foot" },
  {
    value: "legsPhysiological",
    label: "Физиологично, контроль через 6–12 мес",
    text: "Форма ног физиологическая для возраста, контроль через 6–12 месяцев",
    block: "legs",
  },
  { value: "ricketsCheck", label: "Исключить рахит", text: "Исключить рахит: кальций, фосфор, щелочная фосфатаза, витамин D", block: "legs" },
  { value: "legsXray", label: "Рентген ног стоя", text: "Рентгенография ног стоя", block: "legs" },
  { value: "exerciseTherapy", label: "ЛФК ежедневно", text: "ЛФК ежедневно", block: "spine" },
  { value: "swimming", label: "Плавание", text: "Плавание", block: "spine" },
  { value: "scoliometry", label: "Сколиометрия на каждом визите", text: "Сколиометрия на каждом визите", block: "spine" },
  { value: "spineXray", label: "Рентген позвоночника стоя", text: "Рентгенография позвоночника стоя", block: "spine" },
  { value: "brace", label: "Корсет", text: "Корсет", block: "spine" },
  { value: "specialCenter", label: "В специализированный центр", text: "Консультация в специализированном центре", block: "spine" },
  { value: "neurologist", label: "Невролог", text: "Консультация невролога", block: "other" },
  { value: "surgeon", label: "Хирург", text: "Консультация детского хирурга", block: "other" },
];
