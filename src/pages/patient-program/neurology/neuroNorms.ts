import dayjs from "dayjs";

import { normsAge, type Gestation } from "../growth/growthData";
import { CENTILE_LINES, ageMonths as passportMonths } from "../growth/growthNorms";
import { ageLabel } from "../vision/visionNorms";
import type { Clonus, FontanelleState, Symmetry, TendonLevel, ToneState } from "./neuroCatalog";

/**
 * Нормы раздела «Неврология и развитие» (ТЗ §3.1, §3.6–3.7, §3.9): возраст с
 * поправкой на недоношенность, таблица рефлексов, тонус, родничок,
 * окружность головы, сон, сроки осмотров по 211н. Все пороги — здесь, у
 * каждого — источник для подсказки. Пометка «врачу подтвердить» — порог
 * предложен справкой, его утверждает невролог клиники.
 */

// ── Уровни ───────────────────────────────────────────────────────────────────

/** Норма, пограничное, тревожно, срочно; `unknown` — серое: ожидается, нет отметки, нет оценки. */
export type NeuroLevel = "ok" | "warn" | "bad" | "urgent" | "unknown";

const RANK: Record<NeuroLevel, number> = { unknown: 0, ok: 1, warn: 2, bad: 3, urgent: 4 };

export function levelRank(level: NeuroLevel): number {
  return RANK[level];
}

/** Худший уровень; «нет оценки» уступает любой оценке. */
export function worst(...levels: ReadonlyArray<NeuroLevel | null | undefined>): NeuroLevel {
  let result: NeuroLevel = "unknown";
  for (const level of levels) {
    if (level && RANK[level] > RANK[result]) result = level;
  }
  return result;
}

export const LEVEL_WORD: Record<NeuroLevel, string> = {
  ok: "норма",
  warn: "пограничное",
  bad: "тревожно",
  urgent: "срочно",
  unknown: "нет оценки",
};

// ── Возраст ──────────────────────────────────────────────────────────────────

export interface AgeContext {
  birthDate: string | null;
  /** Срок гестации из медкарты; null — нет доступа или не заполнен (без поправки). */
  gestation: Gestation | null;
}

export interface NeuroAge {
  /** Возраст для норм, мес с долями: недоношенным до 2 лет — скорригированный; до срока доношенности — null. */
  months: number | null;
  /** Паспортный возраст, мес с долями. */
  passport: number | null;
  corrected: boolean;
}

const day = (at: string | dayjs.Dayjs): string => dayjs(at).format("YYYY-MM-DD");

/** Возраст на дату: дни / 30,4375, недоношенным — та же поправка, что в «Росте» (`normsAge`). */
export function neuroAge(ctx: AgeContext, at: string | dayjs.Dayjs): NeuroAge {
  const date = day(at);
  const { months, corrected } = normsAge(ctx.birthDate, date, ctx.gestation);
  return { months, passport: passportMonths(ctx.birthDate, date), corrected };
}

/** Возраст для норм на дату — коротко. */
export function ageFor(ctx: AgeContext, at: string | dayjs.Dayjs): number | null {
  return neuroAge(ctx, at).months;
}

/** «7,5»: десятые через запятую, без лишнего нуля. */
export const fmt = (value: number): string => String(Math.round(value * 10) / 10).replace(".", ",");

function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (count % 10 === 1) return one;
  if (count % 10 >= 2 && count % 10 <= 4) return few;
  return many;
}

const yearsWord = (years: number): string => plural(years, "год", "года", "лет");

/** Возраст в тексте сигнала: «3 нед», «7 мес», «1 год 5 мес», «2 года». */
export function ageWords(months: number): string {
  if (months < 1) return `${Math.max(1, Math.round(months * 4.345))} нед`;
  const whole = Math.floor(months + 1e-9);
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  if (!years) return `${rest} мес`;
  const text = `${years} ${yearsWord(years)}`;
  return rest ? `${text} ${rest} мес` : text;
}

/** Возраст в шапке и окнах: «3 нед.», «1 год 6 мес.». */
export function ageText(months: number | null): string {
  if (months == null) return "";
  if (months < 1) return `${Math.max(1, Math.round(months * 4.345))} нед.`;
  return ageLabel(Math.floor(months + 1e-9));
}

/** Строка возраста в окнах: «Ребёнку 1 год 6 мес.», недоношенному — и скорригированный. */
export function ageLine(ctx: AgeContext, at: string | dayjs.Dayjs): string {
  if (!ctx.birthDate) return "Нет даты рождения — нормы по возрасту не считаются";
  const age = neuroAge(ctx, at);
  if (age.passport == null) return "Дата раньше даты рождения";
  const corrected = !age.corrected ? "" : age.months == null ? " · до срока доношенности оценок нет" : ` · скорр. ${ageText(age.months)}`;
  return `Ребёнку ${ageText(age.passport)}${corrected}`;
}

/** Порог «к 18 мес», «к 3 годам». */
export function untilText(months: number): string {
  if (months >= 36 && months % 12 === 0) return `к ${months / 12} годам`;
  return `к ${fmt(months)} мес`;
}

/** Обычный возраст вехи: «9–12 мес», «до 1 мес», «4–5 лет», «3 года». */
export function rangeText([from, to]: readonly [number, number]): string {
  if (from === 0) return `до ${fmt(to)} мес`;
  const inYears = to >= 36 && from % 12 === 0 && to % 12 === 0;
  if (!inYears) return from === to ? `${fmt(from)} мес` : `${fmt(from)}–${fmt(to)} мес`;
  const a = from / 12;
  const b = to / 12;
  return a === b ? `${a} ${yearsWord(a)}` : `${a}–${b} ${yearsWord(b)}`;
}

/** Дата «с N мес»: дата рождения + N календарных месяцев, полмесяца — ещё 15 дней. */
export function sinceDate(birthDate: string, months: number): string {
  const whole = Math.floor(months + 1e-9);
  const half = months - whole >= 0.5 - 1e-9;
  return dayjs(birthDate).add(whole, "month").add(half ? 15 : 0, "day").format("YYYY-MM-DD");
}

/** Паспортный возраст на дату, округлённый до полумесяца: «с 14,5 мес». */
export function monthsOn(birthDate: string | null, date: string): number | null {
  const months = passportMonths(birthDate, date);
  return months == null ? null : Math.round(months * 2) / 2;
}

// ── Безусловные рефлексы и установочные реакции (ТЗ §3.6) ────────────────────

export interface FadingReflex {
  kind: "fading";
  code: string;
  label: string;
  /** Коротко — на карте и в сигналах. */
  short: string;
  /** «Обычно угасает», мес — диапазон по источникам. */
  fade: readonly [number, number];
  /** Рефлекс есть — норма до этого возраста включительно. */
  normUntil: number;
  /** Рефлекс есть — тревожно после этого возраста; между — пограничное. */
  alarmAfter: number;
  basis: string;
}

export interface PosturalReaction {
  kind: "reaction";
  code: string;
  label: string;
  short: string;
  /** Когда появляется — словами: «к 4», «5–6». */
  appears: string;
  /** Реакции нет после этого возраста — пограничное. */
  due: number;
  /** Реакции нет после этого возраста — тревожно (через 3 мес после срока). */
  alarmAfter: number;
  basis: string;
}

/** Вся таблица — врачу подтвердить: сроки в источниках расходятся. */
export const FADING_REFLEXES: ReadonlyArray<FadingReflex> = [
  { kind: "fading", code: "moro", label: "Моро", short: "Моро", fade: [4, 6], normUntil: 4, alarmAfter: 6, basis: "КубГМУ — 4 мес, протокол КР — 5–6" },
  {
    kind: "fading",
    code: "palmar_grasp",
    label: "Хватательный (Робинсона)",
    short: "Хватательный",
    fade: [3, 6],
    normUntil: 4,
    alarmAfter: 6,
    basis: "КубГМУ — 3–4 мес, протокол КР — 5–6",
  },
  {
    kind: "fading",
    code: "stepping",
    label: "Опоры и автоматической ходьбы",
    short: "Опоры и шага",
    fade: [2, 3],
    normUntil: 2,
    alarmAfter: 4,
    basis: "КубГМУ — 2 мес, протокол КР — 2–3",
  },
  { kind: "fading", code: "babkin", label: "Ладонно-ротовой (Бабкина)", short: "Бабкина", fade: [3, 3], normUntil: 3, alarmAfter: 4, basis: "КубГМУ" },
  {
    kind: "fading",
    code: "atnr",
    label: "Асимметричный шейный тонический (АШТР)",
    short: "АШТР",
    fade: [1, 3],
    normUntil: 3,
    alarmAfter: 6,
    basis: "КубГМУ, протокол КР; в памятке AAP для родителей — 5–7 мес",
  },
  { kind: "fading", code: "galant", label: "Галанта", short: "Галанта", fade: [4, 6], normUntil: 4, alarmAfter: 6, basis: "КубГМУ — 4 мес, протокол КР — 6" },
  {
    kind: "fading",
    code: "rooting",
    label: "Поисковый (Куссмауля)",
    short: "Поисковый",
    fade: [2, 4],
    normUntil: 4,
    alarmAfter: 6,
    basis: "КубГМУ — 3–4 мес, протокол КР — 2–3",
  },
  { kind: "fading", code: "proboscis", label: "Хоботковый", short: "Хоботковый", fade: [2, 3], normUntil: 3, alarmAfter: 12, basis: "КубГМУ; порог — справка" },
  {
    kind: "fading",
    code: "plantar_grasp",
    label: "Подошвенный хватательный",
    short: "Подошвенный",
    fade: [9, 10],
    normUntil: 10,
    alarmAfter: 12,
    basis: "протокол КР",
  },
  { kind: "fading", code: "protective", label: "Защитный", short: "Защитный", fade: [2, 2], normUntil: 2, alarmAfter: 4, basis: "КубГМУ; порог — общее правило" },
  { kind: "fading", code: "bauer", label: "Ползания (Бауэра)", short: "Бауэра", fade: [4, 4], normUntil: 4, alarmAfter: 6, basis: "КубГМУ; порог — общее правило" },
  { kind: "fading", code: "perez", label: "Переса", short: "Переса", fade: [4, 4], normUntil: 4, alarmAfter: 6, basis: "КубГМУ" },
  {
    kind: "fading",
    code: "stnr",
    label: "Симметричный шейный и лабиринтный тонические",
    short: "СШТР",
    fade: [2, 3],
    normUntil: 3,
    alarmAfter: 6,
    basis: "КубГМУ; порог — справка",
  },
];

export const REACTIONS: ReadonlyArray<PosturalReaction> = [
  { kind: "reaction", code: "landau_upper", label: "Ландау верхний", short: "Ландау верхний", appears: "к 4", due: 4, alarmAfter: 7, basis: "КубГМУ, протокол КР" },
  { kind: "reaction", code: "landau_lower", label: "Ландау нижний", short: "Ландау нижний", appears: "5–6", due: 6, alarmAfter: 9, basis: "КубГМУ, протокол КР" },
  { kind: "reaction", code: "righting", label: "Цепные выпрямляющие", short: "Цепные", appears: "к 6", due: 6, alarmAfter: 9, basis: "КубГМУ, протокол КР" },
  {
    kind: "reaction",
    code: "parachute",
    label: "«Парашют» (остаётся на всю жизнь)",
    short: "«Парашют»",
    appears: "8–9",
    due: 9,
    alarmAfter: 12,
    basis: "КубГМУ, протокол КР",
  },
];

export type ReflexDef = FadingReflex | PosturalReaction;

export const ALL_REFLEXES: ReadonlyArray<ReflexDef> = [...FADING_REFLEXES, ...REACTIONS];

export function reflexDef(code: string): ReflexDef | undefined {
  return ALL_REFLEXES.find((item) => item.code === code);
}

export interface ReflexMarkInput {
  state: "present" | "absent" | "asym" | "obligatory";
  side: "D" | "S" | null;
}

/**
 * Рефлекс или реакция на дату осмотра (ТЗ §3.6): асимметрия и облигатный
 * АШТР — тревожно в любом возрасте; рефлекс есть — норма до «нормы до»,
 * дальше пограничное, после «тревожно после» — тревожно; нет в первый месяц —
 * тревожно, до начала угасания — пограничное. Реакции нет до срока —
 * ожидается, после срока — пограничное, через 3 мес — тревожно.
 */
export function reflexLevel(code: string, mark: ReflexMarkInput | null | undefined, age: number | null): NeuroLevel {
  if (!mark) return "unknown";
  if (mark.state === "asym" || mark.state === "obligatory") return "bad";
  const def = reflexDef(code);
  if (!def || age == null) return "unknown";
  if (def.kind === "fading") {
    if (mark.state === "present") return age <= def.normUntil ? "ok" : age <= def.alarmAfter ? "warn" : "bad";
    if (age < 1) return "bad";
    return age < def.fade[0] ? "warn" : "ok";
  }
  if (mark.state === "present") return "ok";
  return age <= def.due ? "unknown" : age <= def.alarmAfter ? "warn" : "bad";
}

// ── Тонус (ТЗ §3.7) ──────────────────────────────────────────────────────────

export interface ToneInput {
  state: ToneState | null;
  symmetry: Symmetry | null;
  score: number | null;
}

/** Баллы Журбы–Мастюковой: 3 — норма, 2 — пограничное, 1 и 0 — тревожно (цвета — врачу подтвердить). */
export function toneScoreLevel(score: number | null): NeuroLevel {
  if (score == null) return "unknown";
  return score >= 3 ? "ok" : score === 2 ? "warn" : "bad";
}

/** Тонус без баллов: повышен, снижен, дистония — пограничное; спастичность, ригидность — тревожно. */
export function toneStateLevel(state: ToneState | null, age: number | null): NeuroLevel {
  if (!state) return "unknown";
  if (state === "normal") return "ok";
  // Физиологический гипертонус сгибателей держится до 3,5–4 мес (КубГМУ).
  if (state === "physiological") return age == null ? "unknown" : age < 4 ? "ok" : "warn";
  if (state === "spastic" || state === "rigid") return "bad";
  return "warn";
}

/** Цвет тонуса — худший из вида, баллов и асимметрии (асимметрия — тревожно). */
export function toneLevel(tone: ToneInput | null, age: number | null): NeuroLevel {
  if (!tone) return "unknown";
  const asymmetric = tone.symmetry != null && tone.symmetry !== "equal";
  return worst(toneStateLevel(tone.state, age), toneScoreLevel(tone.score), asymmetric ? "bad" : null);
}

// ── Сухожильные и патологические рефлексы ────────────────────────────────────

/** Асимметрия — тревожно; «живые, D = S» — норма; остальное без асимметрии — без цвета, оценивает врач. */
export function tendonLevel(level: TendonLevel | null, symmetry: Symmetry | null): NeuroLevel {
  if (symmetry != null && symmetry !== "equal") return "bad";
  if (level === "normal" && symmetry === "equal") return "ok";
  return "unknown";
}

/** Неистощаемый клонус стоп — тревожно (врачу подтвердить). */
export function clonusLevel(clonus: Clonus | null): NeuroLevel {
  if (clonus === "sustained") return "bad";
  if (clonus === "none") return "ok";
  return "unknown";
}

/** Бабинский: до 2 лет — без оценки; после 2 лет или с одной стороны — тревожно. */
export function babinskiLevel(babinski: { right: boolean; left: boolean } | null, age: number | null): NeuroLevel {
  if (!babinski || (!babinski.right && !babinski.left)) return "unknown";
  if (babinski.right !== babinski.left) return "bad";
  if (age == null) return "unknown";
  return age >= 24 ? "bad" : "unknown";
}

// ── Родничок и голова ────────────────────────────────────────────────────────

export interface FontanelleInput {
  a: number | null;
  b: number | null;
  state: FontanelleState | null;
  closedOn: string | null;
}

export interface FontanelleContext {
  /** Возраст закрытия по дате `closedOn`; нет даты — возраст на осмотре. */
  closedAge?: number | null;
  /** z-оценка окружности головы на момент осмотра. */
  headZ?: number | null;
  /** Голова изменённой формы: плагиоцефалия, подозрение на краниосиностоз. */
  shapeChanged?: boolean;
}

/**
 * Большой родничок (ТЗ §3.7): напряжён или выбухает — срочно; закрыт раньше
 * 3 мес — пограничное, а при окружности головы ниже −2 SD или изменённой форме
 * головы — тревожно; открыт в 18–24 мес — пограничное, после 24 — тревожно.
 */
export function fontanelleLevel(f: FontanelleInput | null, age: number | null, ctx: FontanelleContext = {}): NeuroLevel {
  if (!f) return "unknown";
  if (f.state === "tense" || f.state === "bulging") return "urgent";
  if (f.state === "closed") {
    const closedAge = ctx.closedAge ?? age;
    if (closedAge == null) return "unknown";
    if (closedAge >= 3) return "ok";
    return (ctx.headZ != null && ctx.headZ < -2) || ctx.shapeChanged ? "bad" : "warn";
  }
  if (age == null || (f.state == null && f.a == null && f.b == null)) return "unknown";
  const open = age > 24 ? "bad" : age >= 18 ? "warn" : "ok";
  // «Западает» отдельного порога не имеет: зелёным его не красим.
  return f.state === "sunken" && open === "ok" ? "unknown" : open;
}

/** Окружность головы по z ВОЗ: до 2 SD — норма, 2–3 SD — пограничное, больше 3 SD — тревожно. */
export function headZLevel(z: number | null): NeuroLevel {
  if (z == null) return "unknown";
  const abs = Math.abs(z);
  return abs <= 2 ? "ok" : abs <= 3 ? "warn" : "bad";
}

/** Сколько линий центилей (3, 15, 50, 85, 97) окружность пересекла между двумя замерами. */
export function centileCrossings(previousZ: number | null, z: number | null): number {
  if (previousZ == null || z == null) return 0;
  const low = Math.min(previousZ, z);
  const high = Math.max(previousZ, z);
  return CENTILE_LINES.filter((line) => line.z > low && line.z < high).length;
}

/** Пересекла две линии и больше — тревожно (врачу подтвердить). */
export function headCircumferenceLevel(z: number | null, previousZ: number | null): NeuroLevel {
  return worst(headZLevel(z), centileCrossings(previousZ, z) >= 2 ? "bad" : null);
}

// ── Сон (ВОЗ 2019) ───────────────────────────────────────────────────────────

/** Норма сна за сутки, ч; с 5 лет — без оценки. */
export function sleepNorm(age: number | null): readonly [number, number] | null {
  if (age == null) return null;
  if (age < 4) return [14, 17];
  if (age < 12) return [12, 16];
  if (age < 36) return [11, 14];
  if (age < 60) return [10, 13];
  return null;
}

/** Сон вне нормы ВОЗ — пограничное (цвет — врачу подтвердить). */
export function sleepLevel(hours: number | null, age: number | null): NeuroLevel {
  const norm = sleepNorm(age);
  if (hours == null || !norm) return "unknown";
  return hours >= norm[0] && hours <= norm[1] ? "ok" : "warn";
}

// ── Приступы, шкалы, анкета ──────────────────────────────────────────────────

/** Фебрильные, аффективно-респираторные, обмороки — пограничное; афебрильные и неясные — тревожно. */
export function seizuresLevel(kinds: ReadonlyArray<string>): NeuroLevel {
  if (kinds.includes("afebrile") || kinds.includes("unclear")) return "bad";
  if (kinds.length) return "warn";
  return "unknown";
}

/** Сумма баллов Журбы–Мастюковой: 27–30 — норма, 23–26 — группа риска, 22 и меньше — задержка. */
export function zhurbaLevel(sum: number | null): NeuroLevel {
  if (sum == null) return "unknown";
  return sum >= 27 ? "ok" : sum >= 23 ? "warn" : "bad";
}

/** Группа НПР: I — норма, II — пограничное, III–IV — тревожно (цвета — врачу подтвердить). */
export function nprGroupLevel(group: number | null): NeuroLevel {
  if (group == null) return "unknown";
  return group <= 1 ? "ok" : group === 2 ? "warn" : "bad";
}

/** Пять сфер 4–6 лет: хотя бы одна «с отклонениями» — пограничное. */
export function spheresLevel(spheres: Partial<Record<string, string>> | null): NeuroLevel {
  const values = Object.values(spheres ?? {});
  if (!values.length) return "unknown";
  return values.includes("deviation") ? "warn" : "ok";
}

/** Энурез до 5 лет — норма; с 5 лет можно ставить F98.0, без цвета. */
export function enuresisLevel(enuresis: boolean | null, age: number | null): NeuroLevel {
  if (!enuresis || age == null) return "unknown";
  return age < 60 ? "ok" : "unknown";
}

// ── Сроки осмотров невролога (приказ МЗ РФ № 211н) ───────────────────────────

/** 3 и 12 мес, 3, 6, 7, 10, 15, 16 и 17 лет; в 1 г 6 мес — только при положительной анкете. */
export const ORDER_211N_MONTHS: ReadonlyArray<number> = [3, 12, 36, 72, 84, 120, 180, 192, 204];
export const ORDER_211N_QUESTIONNAIRE_MONTHS = 18;

export interface OrderCheck {
  months: number;
  /** ГГГГ-ММ-ДД. */
  date: string;
}

/**
 * Ближайший осмотр невролога по 211н позже даты `after` (паспортный возраст).
 * `gapDays` — срок, который ещё считается этим же осмотром: осмотр за неделю до
 * 3 мес и есть осмотр в 3 мес, следующий — в 12.
 */
export function nextOrderCheck(
  birthDate: string | null,
  after: string,
  options: { questionnairePositive?: boolean; gapDays?: number } = {},
): OrderCheck | null {
  if (!birthDate) return null;
  const ages = [...ORDER_211N_MONTHS];
  if (options.questionnairePositive) ages.push(ORDER_211N_QUESTIONNAIRE_MONTHS);
  ages.sort((a, b) => a - b);
  const limit = dayjs(after).startOf("day").add(options.gapDays ?? 0, "day");
  for (const months of ages) {
    const date = dayjs(birthDate).add(months, "month");
    if (date.isAfter(limit, "day")) return { months, date: date.format("YYYY-MM-DD") };
  }
  return null;
}

/** «в 3 мес», «в 1 год 6 мес», «в 3 года», «в 10 лет». */
export function orderAgeText(months: number): string {
  return `в ${ageWords(months)}`;
}
