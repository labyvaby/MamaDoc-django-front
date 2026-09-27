/**
 * Каталоги быстрых кнопок раздела «Зрение» (ТЗ «Зрение» §3.3). В записи
 * хранятся коды, подписи — только здесь.
 */

export interface Option<T extends string | number = string> {
  value: T;
  label: string;
}

export type ExamType = "preventive" | "ophthalmologist" | "screening" | "control";
export type Eye = "OD" | "OS" | "OU";
export type Correction = "none" | "glasses" | "lenses" | "orthok";
export type AlignmentKind = "ortho" | "eso" | "exo" | "vertical";
export type DiagnosisState = "observation" | "treatment" | "resolved";

export const EXAM_TYPES: ReadonlyArray<Option<ExamType> & { title: string }> = [
  { value: "preventive", label: "Профилактический", title: "Профилактический осмотр зрения" },
  { value: "ophthalmologist", label: "Офтальмолог", title: "Осмотр офтальмолога" },
  { value: "screening", label: "Скрининг в саду / школе", title: "Скрининг зрения" },
  { value: "control", label: "Контроль", title: "Контрольный осмотр зрения" },
];

/** «Не определяется»: младенец, отказ, счёт пальцев. */
export const ACUITY_UNKNOWN = "н/о";

export const ACUITY_CHOICES: ReadonlyArray<Option> = [
  ...["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0", "1.2", "1.5", "2.0"].map((value) => ({
    value,
    label: value.replace(".", ","),
  })),
  { value: ACUITY_UNKNOWN, label: "н/о" },
];

export const COMPLAINTS: ReadonlyArray<Option> = [
  { value: "far", label: "Плохо видит вдаль" },
  { value: "near", label: "Плохо видит вблизи" },
  { value: "fatigue", label: "Устаёт при чтении" },
  { value: "squint", label: "Щурится" },
  { value: "strabismus", label: "Косит" },
  { value: "rubs", label: "Трёт глаза" },
  { value: "tearing", label: "Слезотечение" },
  { value: "redness", label: "Покраснение" },
  { value: "none", label: "Нет жалоб" },
];

export const CORRECTIONS: ReadonlyArray<Option<Correction>> = [
  { value: "none", label: "Без коррекции" },
  { value: "glasses", label: "Очки" },
  { value: "lenses", label: "Контактные линзы" },
  { value: "orthok", label: "Ночные линзы" },
];

export const ALIGNMENTS: ReadonlyArray<Option<AlignmentKind>> = [
  { value: "ortho", label: "Ортофория" },
  { value: "eso", label: "Сходящееся" },
  { value: "exo", label: "Расходящееся" },
  { value: "vertical", label: "Вертикальное" },
];

/** Угол косоглазия по Гиршбергу. */
export const DEVIATION_ANGLES: ReadonlyArray<Option<number>> = [
  { value: 5, label: "5°" },
  { value: 10, label: "10°" },
  { value: 15, label: "15°" },
  { value: 20, label: "20°" },
  { value: 25, label: "25°+" },
];

export const BINOCULAR: ReadonlyArray<Option> = [
  { value: "binocular", label: "Бинокулярное" },
  { value: "simultaneous", label: "Одновременное" },
  { value: "monocular", label: "Монокулярное" },
];

export const COLOR_VISION: ReadonlyArray<Option> = [
  { value: "normal", label: "Норма" },
  { value: "anomaly", label: "Аномалия" },
];

export const EYES: ReadonlyArray<Option<Eye>> = [
  { value: "OD", label: "Правый · OD" },
  { value: "OS", label: "Левый · OS" },
  { value: "OU", label: "Оба · OU" },
];

export const DEGREES: ReadonlyArray<Option> = [
  { value: "weak", label: "слабой степени" },
  { value: "moderate", label: "средней степени" },
  { value: "high", label: "высокой степени" },
];

export const DIAGNOSIS_STATES: ReadonlyArray<Option<DiagnosisState>> = [
  { value: "observation", label: "Наблюдение" },
  { value: "treatment", label: "Лечение" },
  { value: "resolved", label: "Снят" },
];

export interface DiagnosisDef {
  code: string;
  label: string;
  /** Код МКБ-10; у «Нормы» и «Другого» пусто. */
  icd: string;
  /** Есть степень: слабая, средняя, высокая. */
  degrees?: boolean;
  subtypes?: ReadonlyArray<Option>;
  /** Только заключение осмотра — в хронические не попадает. */
  conclusionOnly?: boolean;
}

export const DIAGNOSES: ReadonlyArray<DiagnosisDef> = [
  { code: "normal", label: "Норма", icd: "", conclusionOnly: true },
  { code: "myopia", label: "Миопия", icd: "H52.1", degrees: true },
  { code: "hyperopia", label: "Гиперметропия", icd: "H52.0", degrees: true },
  {
    code: "astigmatism",
    label: "Астигматизм",
    icd: "H52.2",
    subtypes: [
      { value: "myopic-simple", label: "миопический простой" },
      { value: "myopic-compound", label: "миопический сложный" },
      { value: "hyperopic-simple", label: "гиперметропический простой" },
      { value: "hyperopic-compound", label: "гиперметропический сложный" },
      { value: "mixed", label: "смешанный" },
    ],
  },
  { code: "anisometropia", label: "Анизометропия", icd: "H52.3" },
  { code: "accommodation-spasm", label: "Спазм аккомодации", icd: "H52.5" },
  {
    code: "amblyopia",
    label: "Амблиопия",
    icd: "H53.0",
    degrees: true,
    subtypes: [
      { value: "refractive", label: "рефракционная" },
      { value: "dysbinocular", label: "дисбинокулярная" },
      { value: "anisometropic", label: "анизометропическая" },
    ],
  },
  { code: "esotropia", label: "Сходящееся косоглазие", icd: "H50.0" },
  { code: "exotropia", label: "Расходящееся косоглазие", icd: "H50.1" },
  { code: "vertical-strabismus", label: "Вертикальное косоглазие", icd: "H50.2" },
  { code: "nystagmus", label: "Нистагм", icd: "H55" },
  { code: "rop", label: "Ретинопатия недоношенных", icd: "H35.1" },
  { code: "dacryostenosis", label: "Дакриостеноз", icd: "H04.5" },
  { code: "ptosis", label: "Птоз", icd: "H02.4" },
  { code: "optic-atrophy", label: "Частичная атрофия зрительного нерва", icd: "H47.2" },
  { code: "congenital-cataract", label: "Врождённая катаракта", icd: "Q12.0" },
  { code: "allergic-conjunctivitis", label: "Аллергический конъюнктивит", icd: "H10.1" },
  { code: "other", label: "Другой", icd: "" },
];

export function diagnosisDef(code: string): DiagnosisDef | undefined {
  return DIAGNOSES.find((item) => item.code === code);
}

/** Кнопки заключения осмотра — всё, кроме «Другого». */
export const CONCLUSIONS: ReadonlyArray<Option> = DIAGNOSES.filter((item) => item.code !== "other").map((item) => ({
  value: item.code,
  label: item.label,
}));

/** Кнопки хронического диагноза — без «Нормы». */
export const CHRONIC_DIAGNOSES: ReadonlyArray<Option> = DIAGNOSES.filter((item) => !item.conclusionOnly).map(
  (item) => ({ value: item.code, label: item.label }),
);

export const RECOMMENDATIONS: ReadonlyArray<Option & { text: string }> = [
  { value: "glasses-constant", label: "Очки постоянно", text: "Очки для постоянного ношения" },
  { value: "glasses-far", label: "Очки для дали", text: "Очки для дали" },
  { value: "glasses-near", label: "Очки для близи", text: "Очки для работы вблизи" },
  { value: "orthok", label: "Ночные линзы", text: "Ночные (ортокератологические) линзы" },
  { value: "atropine", label: "Атропин 0,01%", text: "Атропин 0,01% на ночь" },
  { value: "occlusion-1", label: "Окклюзия 1 ч", text: "Окклюзия лучше видящего глаза 1 час в день" },
  { value: "occlusion-2", label: "Окклюзия 2 ч", text: "Окклюзия лучше видящего глаза 2 часа в день" },
  { value: "occlusion-4", label: "Окклюзия 4 ч", text: "Окклюзия лучше видящего глаза 4 часа в день" },
  { value: "hardware", label: "Аппаратное лечение", text: "Курс аппаратного лечения" },
  { value: "exercises", label: "Гимнастика для глаз", text: "Гимнастика для глаз" },
  { value: "screens", label: "Меньше экранов", text: "Ограничить время у экранов" },
  { value: "outdoors", label: "Больше на улице", text: "Больше времени на улице, от 2 часов в день" },
  { value: "ophthalmologist", label: "К офтальмологу", text: "Консультация офтальмолога" },
];

export const NEXT_CHECK: ReadonlyArray<Option<number>> = [
  { value: 3, label: "через 3 мес." },
  { value: 6, label: "через 6 мес." },
  { value: 12, label: "через год" },
];

export function optionLabel<T extends string | number>(
  options: ReadonlyArray<Option<T>>,
  value: T | null | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? "";
}
