import dayjs from "dayjs";

import {
  FONTANELLE_STATES,
  NPR_SPHERES,
  PARESIS,
  SEIZURE_KINDS,
  SPEECH,
  STUDY_KINDS,
  SYMMETRY_WORDS,
  TENDON_LEVELS,
  TONE_PARTS,
  TONE_PATTERNS,
  TONE_WORDS,
  gendered,
  optionLabel,
  type Sex,
} from "./neuroCatalog";
import { isDone, type HeadData, type NeuroExam, type NeuroExamBody, type ReflexMark, type ToneData } from "./neuroData";
import { milestoneLabel, stoodBeforeSat, whoNumber, type MilestoneView } from "./neuroMilestones";
import {
  LEVEL_WORD,
  ageFor,
  ageWords,
  babinskiLevel,
  centileCrossings,
  clonusLevel,
  enuresisLevel,
  fmt,
  fontanelleLevel,
  headZLevel,
  levelRank,
  monthsOn,
  neuroAge,
  nprGroupLevel,
  rangeText,
  reflexDef,
  reflexLevel,
  seizuresLevel,
  sleepLevel,
  sleepNorm,
  spheresLevel,
  tendonLevel,
  toneLevel,
  toneScoreLevel,
  toneStateLevel,
  untilText,
  worst,
  zhurbaLevel,
  type AgeContext,
  type NeuroLevel,
} from "./neuroNorms";

/**
 * Находки осмотров, метки «по последним данным», сигналы и баннер (ТЗ §3.8,
 * §4). Сигналы считаются заново при каждом открытии раздела.
 */

// ── Сигналы ──────────────────────────────────────────────────────────────────

export type SignalLevel = "warn" | "bad" | "urgent";

/** Порядок внутри уровня: регресс, родничок, приступы, асимметрия, речь, вехи ВОЗ, остальные вехи, рефлексы, голова, тонус, сон. */
export type SignalGroup =
  | "regression"
  | "fontanelle"
  | "seizures"
  | "asymmetry"
  | "speech"
  | "who"
  | "milestones"
  | "reflexes"
  | "head"
  | "tone"
  | "sleep"
  | "other";

const GROUP_ORDER: ReadonlyArray<SignalGroup> = [
  "regression",
  "fontanelle",
  "seizures",
  "asymmetry",
  "speech",
  "who",
  "milestones",
  "reflexes",
  "head",
  "tone",
  "sleep",
  "other",
];

export interface Signal {
  /** Одинаковые сигналы из разных мест сливаются по ключу. */
  key: string;
  level: SignalLevel;
  group: SignalGroup;
  /** Что и в каком возрасте: «Ещё не ходит сам в 1 год 3 мес». Уровень дописывается при показе. */
  summary: string;
  /** Норма словами — предложения с точкой. */
  details: string[];
  /** Что делать: «Повтор через месяц…», «К неврологу». */
  action: string;
  /** Дата осмотра или последней отметки вехи. */
  date: string | null;
  /** Сигнал по вехам: в баннере — «отмечено …». */
  milestone: boolean;
}

/** «Ещё не ходит сам в 1 год 3 мес — пограничное». */
export function signalTitle(signal: Signal): string {
  return `${signal.summary} — ${LEVEL_WORD[signal.level]}`;
}

/** Норма и действие одним абзацем. */
export function signalText(signal: Signal): string {
  return [...signal.details, signal.action].filter(Boolean).join(" ");
}

const URGENT_ACTION = "В стационар или к неврологу в тот же день.";
const WARN_ACTION = "Повтор через месяц.";
const BAD_ACTION = "К неврологу.";

const defaultAction = (level: NeuroLevel): string => (level === "urgent" ? URGENT_ACTION : level === "bad" ? BAD_ACTION : WARN_ACTION);

const isSignal = (level: NeuroLevel): level is SignalLevel => level === "warn" || level === "bad" || level === "urgent";

function signal(
  key: string,
  group: SignalGroup,
  level: NeuroLevel,
  summary: string,
  details: string[] = [],
  action?: string,
  date: string | null = null,
  milestone = false,
): Signal[] {
  if (!isSignal(level)) return [];
  return [{ key, group, level, summary, details, action: action ?? defaultAction(level), date, milestone }];
}

/** Слить одинаковые: уровень — самый высокий, пояснения — вместе. */
export function mergeSignals(signals: ReadonlyArray<Signal>): Signal[] {
  const merged = new Map<string, Signal>();
  for (const item of signals) {
    const current = merged.get(item.key);
    if (!current) {
      merged.set(item.key, { ...item, details: [...item.details] });
      continue;
    }
    const [main, other] = levelRank(item.level) > levelRank(current.level) ? [item, current] : [current, item];
    const details = [...main.details];
    const add = (text: string) => {
      if (text && !details.includes(text)) details.push(text);
    };
    if (other.summary !== main.summary) add(`${other.summary}.`);
    other.details.forEach(add);
    merged.set(item.key, { ...main, details, milestone: main.milestone || other.milestone });
  }
  return [...merged.values()];
}

const SIGNAL_RANK: Record<SignalLevel, number> = { urgent: 0, bad: 1, warn: 2 };

export function sortSignals(signals: ReadonlyArray<Signal>): Signal[] {
  return [...signals].sort(
    (a, b) => SIGNAL_RANK[a.level] - SIGNAL_RANK[b.level] || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
  );
}

export interface Banner {
  /** Уровень баннера — самый высокий из сигналов. */
  level: SignalLevel;
  /** До трёх строк этого уровня. */
  top: Signal[];
  /** Всё остальное — за «ещё N». */
  rest: Signal[];
}

export const BANNER_LINES = 3;

/** Баннер: самый высокий уровень, до трёх строк этого уровня, остальное — «ещё N». */
export function buildBanner(signals: ReadonlyArray<Signal>): Banner | null {
  const sorted = sortSignals(mergeSignals(signals));
  if (!sorted.length) return null;
  const level = sorted[0].level;
  const top = sorted.filter((item) => item.level === level).slice(0, BANNER_LINES);
  return { level, top, rest: sorted.filter((item) => !top.includes(item)) };
}

// ── Тексты находок ───────────────────────────────────────────────────────────

const SIDE_WORD: Record<"D" | "S", string> = { D: "справа", S: "слева" };
const points = (count: number): string => (count === 1 ? "балл" : count >= 2 && count <= 4 ? "балла" : "баллов");

/** «нормотонус, D = S», «повышен — сгибателей, D > S, ноги, 2 балла». */
export function toneText(tone: ToneData): string {
  const parts: string[] = [];
  if (tone.state) {
    const pattern = tone.state === "high" && tone.pattern ? ` — ${optionLabel(TONE_PATTERNS, tone.pattern)}` : "";
    parts.push(`${TONE_WORDS[tone.state]}${pattern}`);
  }
  if (tone.symmetry) parts.push(SYMMETRY_WORDS[tone.symmetry]);
  if (tone.parts.length) parts.push(tone.parts.map((part) => optionLabel(TONE_PARTS, part)).join(", "));
  if (tone.score != null) parts.push(`${tone.score} ${points(tone.score)}`);
  return parts.join(", ");
}

/** «Родничок 1,0 × 1,0 см, не напряжён»; «Родничок закрыт с 14 мес». */
export function fontanelleText(head: HeadData | null, birthDate: string | null): string {
  const f = head?.fontanelle;
  if (!f) return "";
  if (f.state === "closed") {
    const months = f.closedOn ? monthsOn(birthDate, f.closedOn) : null;
    return months != null ? `Родничок закрыт с ${fmt(months)} мес` : "Родничок закрыт";
  }
  const cm = (value: number) => value.toFixed(1).replace(".", ",");
  const size = f.a != null && f.b != null ? ` ${cm(f.a)} × ${cm(f.b)} см` : f.a != null ? ` ${cm(f.a)} см` : "";
  const state = f.state ? optionLabel(FONTANELLE_STATES, f.state) : "";
  return `Родничок${size}${size && state ? "," : ""}${state ? ` ${state}` : ""}`;
}

export interface Finding {
  key: string;
  text: string;
  level: NeuroLevel;
}

export interface FindingContext {
  /** Возраст для норм на дату осмотра. */
  age: number | null;
  /** Дата осмотра (ISO). */
  date: string;
  sex: Sex;
  ages: AgeContext;
  /** z окружности головы — для оценки рано закрытого родничка. */
  headZ?: number | null;
  /** Скорригированный возраст — в текстах «(скорр.)». */
  corrected?: boolean;
}

interface BlockResult {
  findings: Finding[];
  signals: Signal[];
}

const at = (ctx: FindingContext): string => (ctx.age == null ? "" : ` в ${ageWords(ctx.age)}${ctx.corrected ? " (скорр.)" : ""}`);

function reflexProblem(code: string, mark: ReflexMark, ctx: FindingContext): { level: NeuroLevel; finding: string; signals: Signal[] } {
  const def = reflexDef(code);
  const level = reflexLevel(code, mark, ctx.age);
  const name = def?.short ?? code;
  const date = ctx.date;
  if (mark.state === "asym") {
    const side = mark.side ? `: слабее ${SIDE_WORD[mark.side]}` : "";
    return {
      level,
      finding: `${name} — асимметрия`,
      signals: signal("asymmetry", "asymmetry", "bad", "Асимметрия движений, тонуса или рефлексов", [`${name}${side}.`], BAD_ACTION, date),
    };
  }
  if (mark.state === "obligatory") {
    return { level, finding: "Облигатный АШТР", signals: signal(`reflex:${code}`, "reflexes", "bad", "Облигатный АШТР", [], BAD_ACTION, date) };
  }
  if (!def || !isSignal(level)) return { level, finding: "", signals: [] };
  if (def.kind === "reaction") {
    return {
      level,
      finding: `Нет реакции «${def.short}»`,
      signals: signal(`reflex:${code}`, "reflexes", level, `Нет реакции «${def.short}»${at(ctx)}`, [`Появляется ${def.appears} мес.`], undefined, date),
    };
  }
  if (mark.state === "present") {
    return {
      level,
      finding: `${name} держится`,
      signals: signal(
        `reflex:${code}`,
        "reflexes",
        level,
        `${name} держится${at(ctx)}`,
        [`Угасает к ${fmt(def.normUntil)} мес, не позже ${fmt(def.alarmAfter)}.`],
        undefined,
        date,
      ),
    };
  }
  const newborn = ctx.age != null && ctx.age < 1;
  return {
    level,
    finding: `${name}: нет`,
    signals: signal(
      `reflex:${code}`,
      "reflexes",
      level,
      `${name}: нет${at(ctx)}`,
      [newborn ? "У новорождённого рефлекс должен быть." : `Обычно угасает в ${rangeText(def.fade)}.`],
      undefined,
      date,
    ),
  };
}

function reflexesBlock(reflexes: Readonly<Record<string, ReflexMark>>, ctx: FindingContext): BlockResult {
  const codes = Object.keys(reflexes);
  if (!codes.length) return { findings: [], signals: [] };
  const problems = codes
    .map((code) => ({ code, ...reflexProblem(code, reflexes[code], ctx) }))
    .filter((item) => item.finding !== "")
    .sort((a, b) => levelRank(b.level) - levelRank(a.level));
  const levels = codes.map((code) => reflexLevel(code, reflexes[code], ctx.age));
  const overall = worst(...levels);
  const text = !problems.length
    ? overall === "ok"
      ? "Рефлексы по возрасту"
      : "Рефлексы отмечены"
    : problems.length === 1
      ? `Рефлексы: ${problems[0].finding}`
      : `Рефлексы: ${problems[0].finding} и ещё ${problems.length - 1}`;
  return { findings: [{ key: "reflexes", text, level: overall }], signals: problems.flatMap((item) => item.signals) };
}

function toneBlock(tone: ToneData | null, ctx: FindingContext): BlockResult {
  if (!tone) return { findings: [], signals: [] };
  const text = toneText(tone);
  if (!text) return { findings: [], signals: [] };
  const level = toneLevel(tone, ctx.age);
  const own = worst(toneStateLevel(tone.state, ctx.age), toneScoreLevel(tone.score));
  const signals: Signal[] = [];
  if (tone.symmetry && tone.symmetry !== "equal") {
    signals.push(...signal("asymmetry", "asymmetry", "bad", "Асимметрия движений, тонуса или рефлексов", [`Тонус ${SYMMETRY_WORDS[tone.symmetry]}.`], BAD_ACTION, ctx.date));
  }
  signals.push(...signal("tone", "tone", own, `Тонус: ${text}`, [], undefined, ctx.date));
  return { findings: [{ key: "tone", text: `Тонус: ${text}`, level }], signals };
}

function tendonBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const findings: Finding[] = [];
  const signals: Signal[] = [];
  const tendon = exam.tendon;
  if (tendon && (tendon.level || tendon.symmetry)) {
    const words = [tendon.level ? optionLabel(TENDON_LEVELS, tendon.level) : "", tendon.symmetry ? SYMMETRY_WORDS[tendon.symmetry] : ""].filter(Boolean);
    findings.push({ key: "tendon", text: `Рефлексы ${words.join(", ")}`, level: tendonLevel(tendon.level, tendon.symmetry) });
    if (tendon.symmetry && tendon.symmetry !== "equal") {
      signals.push(
        ...signal("asymmetry", "asymmetry", "bad", "Асимметрия движений, тонуса или рефлексов", [`Сухожильные рефлексы ${SYMMETRY_WORDS[tendon.symmetry]}.`], BAD_ACTION, ctx.date),
      );
    }
  }
  if (exam.clonus && exam.clonus !== "none") {
    const level = clonusLevel(exam.clonus);
    const text = exam.clonus === "sustained" ? "Клонус стоп неистощаемый" : "Клонус стоп истощаемый";
    findings.push({ key: "clonus", text, level });
    signals.push(...signal("clonus", "reflexes", level, text, [], undefined, ctx.date));
  }
  const babinski = exam.babinski;
  if (babinski && (babinski.right || babinski.left)) {
    const where = babinski.right && babinski.left ? "с двух сторон" : babinski.right ? "справа" : "слева";
    const level = babinskiLevel(babinski, ctx.age);
    findings.push({ key: "babinski", text: `Бабинский ${where}`, level });
    signals.push(
      ...signal("babinski", "reflexes", level, `Симптом Бабинского ${where}${at(ctx)}`, [babinski.right !== babinski.left ? "С одной стороны — в любом возрасте." : "После 2 лет — патологический."], undefined, ctx.date),
    );
  }
  if (exam.meningeal != null) {
    findings.push({ key: "meningeal", text: exam.meningeal ? "Менингеальные знаки" : "Менингеальных знаков нет", level: exam.meningeal ? "urgent" : "ok" });
    if (exam.meningeal) signals.push(...signal("meningeal", "fontanelle", "urgent", "Менингеальные знаки", [], URGENT_ACTION, ctx.date));
  }
  return { findings, signals };
}

function cranialBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const cranial = exam.cranial;
  if (!cranial) return { findings: [], signals: [] };
  const findings: Finding[] = [];
  const signals: Signal[] = [];
  if (cranial.tongue === "fasciculations") {
    findings.push({ key: "fasciculations", text: "Фасцикуляции языка", level: "bad" });
    signals.push(...signal("fasciculations", "tone", "bad", "Фасцикуляции языка", ["Признак спинальной мышечной атрофии."], "К неврологу: ЭНМГ, генетик.", ctx.date));
  }
  if (cranial.sucking === "weak" && ctx.age != null && ctx.age < 1) {
    findings.push({ key: "sucking", text: "Вялое сосание", level: "bad" });
    signals.push(...signal("sucking", "tone", "bad", "Вялое сосание в первый месяц", [], BAD_ACTION, ctx.date));
  }
  if (cranial.sunset) {
    findings.push({ key: "sunset", text: "Симптом «заходящего солнца»", level: "bad" });
    signals.push(...signal("sunset", "head", "bad", "Симптом «заходящего солнца»", [], "К неврологу: нейросонография или МРТ.", ctx.date));
  }
  if (cranial.strabismus === "constant") findings.push({ key: "strabismus", text: "Постоянное косоглазие — см. «Зрение»", level: "unknown" });
  return { findings, signals };
}

function headBlock(head: HeadData | null, ctx: FindingContext): BlockResult {
  const f = head?.fontanelle;
  if (!head || !f) return { findings: [], signals: [] };
  const closedAge = f.state === "closed" && f.closedOn ? ageFor(ctx.ages, f.closedOn) : null;
  const shapeChanged = head.shape === "plagiocephaly" || head.shape === "synostosis_suspected";
  const level = fontanelleLevel(f, ctx.age, { closedAge, headZ: ctx.headZ ?? null, shapeChanged });
  const text = fontanelleText(head, ctx.ages.birthDate);
  const findings: Finding[] = text ? [{ key: "fontanelle", text, level }] : [];
  const signals: Signal[] = [];
  if (level === "urgent") {
    signals.push(
      ...signal(
        "fontanelle",
        "fontanelle",
        "urgent",
        "Родничок напряжён или выбухает",
        [`На осмотре: ${optionLabel(FONTANELLE_STATES, f.state)}; оценивают у спокойного ребёнка в вертикальном положении.`],
        URGENT_ACTION,
        ctx.date,
      ),
    );
  } else if (f.state === "closed" && isSignal(level)) {
    const when = closedAge ?? ctx.age;
    signals.push(
      ...signal(
        "fontanelle_early",
        "head",
        level,
        `Родничок закрыт${when != null ? ` в ${ageWords(when)}` : ""}`,
        [
          "Раньше 3 мес закрывается у 1 % детей.",
          level === "bad" ? "Окружность головы ниже −2 SD или голова изменённой формы." : "Окружность головы в норме — следить за ней.",
        ],
        level === "bad" ? "К неврологу; при подозрении на краниосиностоз — КТ и нейрохирург." : WARN_ACTION,
        ctx.date,
      ),
    );
  } else if (isSignal(level)) {
    signals.push(
      ...signal(
        "fontanelle_open",
        "head",
        level,
        `Родничок открыт${at(ctx)}`,
        ["К 24 мес закрывается у 96 % детей."],
        level === "bad" ? "К неврологу: исключить гипотиреоз, рахит, повышенное давление." : WARN_ACTION,
        ctx.date,
      ),
    );
  }
  return { findings, signals };
}

function motorBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const paresis = exam.motor?.paresis;
  if (!paresis) return { findings: [], signals: [] };
  if (paresis === "none") return { findings: [{ key: "paresis", text: "Парезов нет", level: "ok" }], signals: [] };
  const side = exam.motor?.paresisSide ? ` ${SIDE_WORD[exam.motor.paresisSide]}` : "";
  const text = `${optionLabel(PARESIS, paresis)}${side}`;
  const label = text[0].toUpperCase() + text.slice(1);
  const signals = signal("paresis", "tone", "bad", label, [], "К неврологу; МРТ головного мозга.", ctx.date);
  if (paresis === "mono" || paresis === "hemi") {
    signals.push(...signal("asymmetry", "asymmetry", "bad", "Асимметрия движений, тонуса или рефлексов", [`${label}.`], BAD_ACTION, ctx.date));
  }
  return { findings: [{ key: "paresis", text: label, level: "bad" }], signals };
}

function questionnaireBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  if (exam.questionnaire === "positive") {
    const action = ctx.age != null && ctx.age >= 24 ? "К детскому психиатру (211н: анкета в 2 года)." : "К неврологу (211н: анкета в 1 г 6 мес).";
    return {
      findings: [{ key: "questionnaire", text: "Анкета родителей положительная", level: "bad" }],
      signals: signal("questionnaire", "other", "bad", "Анкета родителей на риск нарушений развития положительная", [], action, ctx.date),
    };
  }
  if (exam.questionnaire === "negative") return { findings: [{ key: "questionnaire", text: "Анкета родителей отрицательная", level: "ok" }], signals: [] };
  return { findings: [], signals: [] };
}

function speechBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  if (!exam.speech.length) return { findings: [], signals: [] };
  const labels = exam.speech.map((code) => {
    const label = SPEECH.find((item) => item.value === code)?.label ?? code;
    return code === "onr" && exam.onrLevel ? `${label} ${["", "I", "II", "III", "IV"][exam.onrLevel] ?? ""} уровня` : label;
  });
  const regression = exam.speech.includes("regression");
  const normal = exam.speech.length === 1 && exam.speech[0] === "normal";
  // Заключение по речи даёт сам врач: цвет — на метке, в баннер — только регресс.
  const level: NeuroLevel = regression ? "urgent" : normal ? "ok" : "warn";
  return {
    findings: [{ key: "speech", text: `Речь: ${labels.join(", ")}`, level }],
    signals: regression ? signal("regression", "regression", "urgent", "Регресс речи", [], "К неврологу в тот же день; ЭЭГ.", ctx.date) : [],
  };
}

function nprBlock(exam: NeuroExamBody, ctx: FindingContext, today: number | null): BlockResult {
  const npr = exam.npr;
  if (!npr) return { findings: [], signals: [] };
  const findings: Finding[] = [];
  const signals: Signal[] = [];
  if (npr.zhurba != null) {
    const level = zhurbaLevel(npr.zhurba);
    findings.push({ key: "zhurba", text: `Журба–Мастюкова: ${npr.zhurba} ${points(npr.zhurba)}`, level });
    // Баллы Журбы–Мастюковой — до года: после него сигналов не дают.
    if (today == null || today <= 12) {
      signals.push(
        ...signal(
          "zhurba",
          "other",
          level,
          `Журба–Мастюкова: ${npr.zhurba} ${points(npr.zhurba)}`,
          [level === "bad" ? "22 балла и меньше — задержка развития." : "23–26 баллов — группа риска."],
          undefined,
          ctx.date,
        ),
      );
    }
  }
  if (npr.group != null) {
    const level = nprGroupLevel(npr.group);
    const roman = ["", "I", "II", "III", "IV"][npr.group] ?? String(npr.group);
    findings.push({ key: "npr_group", text: `Группа НПР ${roman}`, level });
    if (today == null || today <= 36) {
      signals.push(
        ...signal(
          "npr_group",
          "other",
          level,
          `Группа НПР ${roman}`,
          [npr.group === 2 ? "Отставание на один эпикризный срок." : "Отставание на два-три эпикризных срока."],
          undefined,
          ctx.date,
        ),
      );
    }
  }
  if (npr.spheres && Object.keys(npr.spheres).length) {
    const level = spheresLevel(npr.spheres);
    const deviations = NPR_SPHERES.filter((item) => npr.spheres?.[item.value] === "deviation").map((item) => item.label);
    const text = deviations.length ? `НПР с отклонениями в: ${deviations.join(", ")}` : "НПР соответствует возрасту";
    findings.push({ key: "npr_spheres", text, level });
    signals.push(...signal("npr_spheres", "other", level, text, [], undefined, ctx.date));
  }
  return { findings, signals };
}

function sleepBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const hours = exam.sleep?.hours ?? null;
  if (hours == null) return { findings: [], signals: [] };
  const level = sleepLevel(hours, ctx.age);
  const norm = sleepNorm(ctx.age);
  return {
    findings: [{ key: "sleep", text: `Сон ${fmt(hours)} ч в сутки`, level }],
    signals: signal(
      "sleep",
      "sleep",
      level,
      `Сон ${fmt(hours)} ч в сутки${at(ctx)}`,
      norm ? [`Норма ВОЗ — ${norm[0]}–${norm[1]} ч.`] : [],
      "Гигиена сна и режим дня; повтор через месяц.",
      ctx.date,
    ),
  };
}

function seizuresBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const kinds = exam.seizures?.kinds ?? [];
  if (!kinds.length) return { findings: [], signals: [] };
  const level = seizuresLevel(kinds);
  const text = kinds.map((kind) => optionLabel(SEIZURE_KINDS, kind) || kind).join(", ");
  return {
    findings: [{ key: "seizures", text: `Приступы: ${text}`, level }],
    signals: signal(
      "seizures_history",
      "seizures",
      level,
      `Приступы в прошлом: ${text}`,
      [],
      level === "bad" ? "К неврологу (эпилептологу), ЭЭГ." : "Повтор через месяц; при повторе приступа — к неврологу.",
      ctx.date,
    ),
  };
}

function otherBlock(exam: NeuroExamBody, ctx: FindingContext): BlockResult {
  const findings: Finding[] = [];
  const signals: Signal[] = [];
  if (exam.enuresis) findings.push({ key: "enuresis", text: ctx.age != null && ctx.age < 60 ? "Энурез — норма до 5 лет" : "Энурез", level: enuresisLevel(true, ctx.age) });
  for (const study of exam.studies) {
    if (!study.result) continue;
    const name = optionLabel(STUDY_KINDS, study.kind) || study.kind;
    if (study.result === "above3x") {
      findings.push({ key: `study:${study.kind}`, text: "КФК выше трёх норм", level: "urgent" });
      signals.push(...signal("ck", "other", "urgent", "КФК выше трёх норм", ["Подозрение на мышечную дистрофию (AAP 2013)."], URGENT_ACTION, ctx.date));
    } else {
      findings.push({ key: `study:${study.kind}`, text: `${name}: ${study.result === "normal" ? "норма" : "отклонения"}`, level: study.result === "normal" ? "ok" : "unknown" });
    }
  }
  return { findings, signals };
}

/** Тревожные признаки быстрого осмотра: регресс, судороги, родничок, рвота с вялостью — срочно; асимметрия, «рукость», «заходящее солнце» — тревожно. */
export function redFlagSignals(flags: ReadonlyArray<string>, sex: Sex, date: string | null): Signal[] {
  const out: Signal[] = [];
  for (const flag of flags) {
    if (flag === "regression") {
      out.push(...signal("regression", "regression", "urgent", gendered("Утратил{а} навык: речь, общение или движения", sex), [], URGENT_ACTION, date));
    } else if (flag === "seizure") {
      out.push(...signal("seizure_now", "seizures", "urgent", "Судороги или приступ — сейчас или впервые", [], URGENT_ACTION, date));
    } else if (flag === "fontanelle") {
      out.push(...signal("fontanelle", "fontanelle", "urgent", "Родничок напряжён или выбухает", [], URGENT_ACTION, date));
    } else if (flag === "vomiting_lethargy") {
      out.push(...signal("vomiting", "fontanelle", "urgent", "Рвота с вялостью", [], URGENT_ACTION, date));
    } else if (flag === "asymmetry") {
      out.push(...signal("asymmetry", "asymmetry", "bad", "Асимметрия движений, тонуса или рефлексов", [], BAD_ACTION, date));
    } else if (flag === "handedness") {
      out.push(...signal("handedness", "asymmetry", "bad", "Ранняя «рукость»", ["Явное предпочтение одной руки до 12–18 мес (AAP 2013)."], BAD_ACTION, date));
    } else if (flag === "sunset") {
      out.push(...signal("sunset", "head", "bad", "Симптом «заходящего солнца»", [], "К неврологу: нейросонография или МРТ.", date));
    }
  }
  return out;
}

const RED_FLAG_TEXT: Record<string, string> = {
  regression: "Утрата навыка",
  seizure: "Судороги или приступ",
  fontanelle: "Родничок напряжён",
  vomiting_lethargy: "Рвота с вялостью",
  asymmetry: "Асимметрия",
  handedness: "Ранняя «рукость»",
  sunset: "«Заходящее солнце»",
};

export type FindingBlock =
  | "tone"
  | "reflexes"
  | "tendon"
  | "cranial"
  | "head"
  | "motor"
  | "questionnaire"
  | "speech"
  | "npr"
  | "sleep"
  | "seizures"
  | "other";

/** Находки блока осмотра на его дату; `today` — сегодняшний возраст для правил «ребёнок вырос из блока». */
function blockResult(block: FindingBlock, exam: NeuroExamBody, ctx: FindingContext, today: number | null): BlockResult {
  switch (block) {
    case "tone":
      return toneBlock(exam.tone, ctx);
    case "reflexes":
      return reflexesBlock(exam.reflexes, ctx);
    case "tendon":
      return tendonBlock(exam, ctx);
    case "cranial":
      return cranialBlock(exam, ctx);
    case "head":
      return headBlock(exam.head, ctx);
    case "motor":
      return motorBlock(exam, ctx);
    case "questionnaire":
      return questionnaireBlock(exam, ctx);
    case "speech":
      return speechBlock(exam, ctx);
    case "npr":
      return nprBlock(exam, ctx, today);
    case "sleep":
      return sleepBlock(exam, ctx);
    case "seizures":
      return seizuresBlock(exam, ctx);
    default:
      return otherBlock(exam, ctx);
  }
}

const BLOCKS: ReadonlyArray<FindingBlock> = ["tone", "reflexes", "tendon", "head", "cranial", "motor", "speech", "questionnaire", "npr", "sleep", "seizures", "other"];

/** Находки осмотра по возрасту на его дату — цветные метки в истории и в окне. */
export function examFindings(exam: NeuroExamBody, ctx: FindingContext): Finding[] {
  const findings = BLOCKS.flatMap((block) => blockResult(block, exam, ctx, ctx.age).findings);
  for (const flag of exam.redFlags) {
    const def = RED_FLAG_TEXT[flag];
    if (def) findings.push({ key: `flag:${flag}`, text: def, level: ["regression", "seizure", "fontanelle", "vomiting_lethargy"].includes(flag) ? "urgent" : "bad" });
  }
  return findings;
}

/** Цвет осмотра — худший из его находок. */
export function examLevel(findings: ReadonlyArray<Finding>): NeuroLevel {
  return worst(...findings.map((item) => item.level));
}

// ── Окружность головы из «Роста» ─────────────────────────────────────────────

export interface HeadMeasure {
  /** Дата замера. */
  at: string;
  cm: number;
  /** z ВОЗ; null — нет пола, возраста или таблицы (старше 5 лет). */
  z: number | null;
}

export interface HeadInfo {
  latest: HeadMeasure;
  previous: HeadMeasure | null;
  level: NeuroLevel;
  crossings: number;
}

export function headInfo(latest: HeadMeasure | null, previous: HeadMeasure | null): HeadInfo | null {
  if (!latest) return null;
  const crossings = centileCrossings(previous?.z ?? null, latest.z);
  return { latest, previous, crossings, level: worst(headZLevel(latest.z), crossings >= 2 ? "bad" : null) };
}

function headSignals(info: HeadInfo | null): Signal[] {
  if (!info) return [];
  const { latest, previous, crossings } = info;
  const out: Signal[] = [];
  const zLevel = headZLevel(latest.z);
  if (latest.z != null && isSignal(zLevel)) {
    const more = latest.z > 0;
    if (zLevel === "bad") {
      out.push(
        ...signal(
          "head_circumference",
          "head",
          "bad",
          `Окружность головы ${fmt(latest.cm)} см — ${more ? "больше" : "меньше"} нормы на 3 SD`,
          [`Подозрение на ${more ? "макроцефалию" : "микроцефалию"} (AAN 2009).`],
          "К неврологу, МРТ головного мозга.",
          latest.at,
        ),
      );
    } else {
      out.push(
        ...signal(
          "head_circumference",
          "head",
          "warn",
          `Окружность головы ${fmt(latest.cm)} см — ${more ? "больше" : "меньше"} нормы на 2–3 SD`,
          ["Сверить с окружностью головы родителей."],
          WARN_ACTION,
          latest.at,
        ),
      );
    }
  }
  if (crossings >= 2 && previous) {
    out.push(
      ...signal(
        "head_crossing",
        "head",
        "bad",
        `Окружность головы пересекла ${crossings} линии центилей`,
        [`${fmt(previous.cm)} → ${fmt(latest.cm)} см между замерами ${dayjs(previous.at).format("DD.MM.YYYY")} и ${dayjs(latest.at).format("DD.MM.YYYY")}.`],
        BAD_ACTION,
        latest.at,
      ),
    );
  }
  return out;
}

// ── Сигналы раздела ──────────────────────────────────────────────────────────

/** Сигнал по вехе: «ещё нет» после срока или утрачена. */
export function milestoneSignals(view: MilestoneView, todayAge: number | null, sex: Sex, corrected = false): Signal[] {
  if (!view.signal || !view.entry) return [];
  const def = view.def;
  const label = milestoneLabel(def, sex, true);
  const date = view.entry.at;
  if (view.state === "lost") {
    return signal("regression", "regression", "urgent", `Утрачен навык «${label[0].toLowerCase()}${label.slice(1)}»`, [], "К неврологу в тот же день.", date, true);
  }
  if (todayAge == null) return [];
  const summary = `${gendered(def.absent, sex)} в ${ageWords(todayAge)}${corrected ? " (скорр.)" : ""}`;
  if (def.kind === "who") {
    return view.level === "warn"
      ? signal(
          `milestone:${def.code}`,
          "who",
          "warn",
          summary,
          [`${def.doers} 90 % детей к ${whoNumber(def.p90)} мес и 99 % — к ${whoNumber(def.p99)} мес.`],
          `Повтор через месяц; если не ${def.will} к ${whoNumber(def.p99)} мес — к неврологу.`,
          date,
          true,
        )
      : signal(`milestone:${def.code}`, "who", view.level, summary, [`${def.doers} 99 % детей к ${whoNumber(def.p99)} мес.`], BAD_ACTION, date, true);
  }
  const speech = def.sphere === "speech";
  const usual = `Обычно — ${rangeText(def.typical)}.`;
  if (view.level === "warn") {
    const action = def.warnAction
      ? `${def.warnAction}.`
      : `Повтор через месяц${def.red != null && def.red > def.yellow ? `; если нет ${untilText(def.red)} — к неврологу` : ""}${speech ? ", проверить слух" : ""}.`;
    return signal(`milestone:${def.code}`, speech ? "speech" : "milestones", "warn", summary, [def.yellowNote ? `${def.yellowNote}.` : usual], action, date, true);
  }
  const action = def.badAction ? `${def.badAction}.` : `К неврологу${speech ? ", проверить слух" : ""}.`;
  return signal(`milestone:${def.code}`, speech ? "speech" : "milestones", view.level, summary, [def.redNote ? `${def.redNote}.` : usual], action, date, true);
}

export interface SectionInput {
  /** Вехи на сегодня. */
  views: ReadonlyMap<string, MilestoneView>;
  /** Осмотры, от новых к старым. */
  exams: ReadonlyArray<NeuroExam>;
  ages: AgeContext;
  today: string;
  sex: Sex;
  head: HeadInfo | null;
}

/** Блок и проверка «заполнен ли он в осмотре» — для «последнего значения каждого блока». */
const BLOCK_FILLED: ReadonlyArray<[FindingBlock, (exam: NeuroExamBody) => boolean]> = [
  ["tone", (exam) => exam.tone != null && toneText(exam.tone) !== ""],
  ["reflexes", (exam) => Object.keys(exam.reflexes).length > 0],
  ["tendon", (exam) => exam.tendon != null || exam.clonus != null || exam.babinski != null || exam.meningeal != null],
  ["cranial", (exam) => exam.cranial != null],
  ["head", (exam) => exam.head?.fontanelle != null],
  ["motor", (exam) => exam.motor?.paresis != null],
  ["questionnaire", (exam) => exam.questionnaire != null],
  ["speech", (exam) => exam.speech.length > 0],
  ["npr", (exam) => exam.npr != null],
  ["sleep", (exam) => exam.sleep?.hours != null],
  ["seizures", (exam) => (exam.seizures?.kinds.length ?? 0) > 0],
  ["other", (exam) => exam.enuresis != null || exam.studies.length > 0],
];

/**
 * Все сигналы раздела (ТЗ §3.8): по картине вех на сегодня, по последнему
 * значению каждого блока осмотра, по тревожным признакам последнего осмотра и
 * по последнему замеру окружности головы. Блок, из которого ребёнок вырос,
 * сигналов не даёт: безусловные рефлексы — после 18 мес.
 */
export function collectSignals(input: SectionInput): Signal[] {
  const { views, ages, today, sex } = input;
  const now = neuroAge(ages, today);
  const todayAge = now.months;
  const signals: Signal[] = [];
  for (const view of views.values()) signals.push(...milestoneSignals(view, todayAge, sex, now.corrected));
  const stood = stoodBeforeSat(views);
  // «Встал раньше, чем сел» — признак тонуса первого года: в баннере до 18 мес, дальше — в истории.
  if (stood && todayAge != null && todayAge < 18) {
    signals.push(
      ...signal(
        "stand_sit",
        "who",
        "warn",
        gendered("Встал{а} с поддержкой раньше, чем сел{а}", sex),
        [
          gendered(`Стоит с поддержкой с ${fmt(stood.standAge)} мес, ${stood.sitAge != null ? `сидит — с ${fmt(stood.sitAge)}` : "сидеть ещё не начал{а}"}.`, sex),
          "Возможный признак повышенного тонуса (AAP 2013).",
        ],
        "Проверить тонус; повтор через месяц.",
        views.get("stands_support")?.entry?.at ?? null,
        true,
      ),
    );
  }
  const done = input.exams.filter((exam) => isDone(exam.record));
  for (const [block, filled] of BLOCK_FILLED) {
    if (block === "reflexes" && todayAge != null && todayAge > 18) continue;
    const exam = done.find(filled);
    if (!exam) continue;
    const date = exam.record.occurredAt;
    const age = neuroAge(ages, date);
    signals.push(...blockResult(block, exam, { age: age.months, date, sex, ages, headZ: input.head?.latest.z ?? null, corrected: age.corrected }, todayAge).signals);
  }
  const latest = done[0];
  if (latest) signals.push(...redFlagSignals(latest.redFlags, sex, latest.record.occurredAt));
  signals.push(...headSignals(input.head));
  return sortSignals(mergeSignals(signals));
}

// ── Метки «по последним данным» ──────────────────────────────────────────────

export interface SummaryChip {
  key: string;
  text: string;
  level: NeuroLevel;
  /** Дата, если метка не из последнего осмотра. */
  date: string | null;
}

/**
 * Метки вкладки «Развитие» (ТЗ §4): тонус; рефлексы — до года безусловные,
 * дальше сухожильные; родничок — до 2 лет или пока не закрыт; окружность
 * головы из «Роста»; сон; речь — с года; приступы — если были.
 */
export function summaryChips(input: SectionInput): SummaryChip[] {
  const { ages, today, sex } = input;
  const todayAge = ageFor(ages, today);
  const done = input.exams.filter((exam) => isDone(exam.record));
  const latest = done[0];
  const chips: SummaryChip[] = [];
  const add = (block: FindingBlock, filled: (exam: NeuroExamBody) => boolean, keys?: ReadonlyArray<string>, only?: (finding: Finding, exam: NeuroExam) => boolean) => {
    const exam = done.find(filled);
    if (!exam) return;
    const date = exam.record.occurredAt;
    const ctx: FindingContext = { age: ageFor(ages, date), date, sex, ages, headZ: input.head?.latest.z ?? null };
    for (const finding of blockResult(block, exam, ctx, todayAge).findings) {
      if (keys && !keys.includes(finding.key)) continue;
      if (only && !only(finding, exam)) continue;
      chips.push({ key: finding.key, text: finding.text, level: finding.level, date: exam === latest ? null : date });
    }
  };
  add("tone", (exam) => exam.tone != null && toneText(exam.tone) !== "");
  if (todayAge != null && todayAge < 12) add("reflexes", (exam) => Object.keys(exam.reflexes).length > 0);
  else add("tendon", (exam) => exam.tendon != null, ["tendon"]);
  add("head", (exam) => exam.head?.fontanelle != null, ["fontanelle"], (_finding, exam) => {
    const closed = exam.head?.fontanelle?.state === "closed";
    return todayAge == null || todayAge < 24 || !closed;
  });
  if (input.head) {
    const { latest: measure, level } = input.head;
    chips.push({
      key: "head_circumference",
      text: `Окружность головы ${fmt(measure.cm)} см — ${level === "unknown" ? "без оценки" : LEVEL_WORD[level]}, из «Роста»`,
      level,
      date: measure.at,
    });
  }
  add("sleep", (exam) => exam.sleep?.hours != null);
  if (todayAge == null || todayAge >= 12) add("speech", (exam) => exam.speech.length > 0);
  add("seizures", (exam) => (exam.seizures?.kinds.length ?? 0) > 0);
  return chips;
}

// ── Подсказки рекомендаций ───────────────────────────────────────────────────

export interface HintInput {
  form: NeuroExamBody;
  views: ReadonlyMap<string, MilestoneView>;
  headLevel: NeuroLevel;
  /** Родничок закрыт — нейросонография неинформативна. */
  fontanelleClosed: boolean;
}

/**
 * Подсказки шаблонов (ТЗ §3.12): шаблон подсвечивается, но сам не выбирается.
 * Ключ — код шаблона, значение — почему.
 */
export function recommendationHints({ form, views, headLevel, fontanelleClosed }: HintInput): Map<string, string> {
  const hints = new Map<string, string>();
  const add = (code: string, reason: string) => {
    if (!hints.has(code)) hints.set(code, reason);
  };
  const speechMilestone = [...views.values()].some((view) => view.def.sphere === "speech" && view.state === "no" && (view.level === "warn" || view.level === "bad"));
  const speechDelay = form.speech.some((code) => code !== "normal") || speechMilestone;
  if (speechDelay) add("hearing", "задержка речи — обследование слуха");
  const regression =
    form.redFlags.includes("regression") || form.speech.includes("regression") || [...views.values()].some((view) => view.state === "lost");
  const tone = form.tone;
  const highTone = tone?.state === "high" || tone?.state === "spastic" || tone?.state === "rigid";
  const focal = (form.motor?.paresis != null && form.motor.paresis !== "none") || (tone?.symmetry != null && tone.symmetry !== "equal");
  const marked = (form.npr?.group ?? 0) >= 3 || (form.npr?.zhurba != null && form.npr.zhurba <= 22);
  const cp = form.conclusions.includes("cp");
  if (highTone || cp || focal || regression || marked || headLevel === "warn" || headLevel === "bad") {
    add("mri", "повышенный тонус, очаговые знаки, регресс, выраженная задержка или окружность головы вне нормы — МРТ");
  }
  const seizures = (form.seizures?.kinds.length ?? 0) > 0 || form.redFlags.includes("seizure") || form.conclusions.includes("epilepsy");
  if (seizures || form.speech.includes("regression")) add("eeg", "приступы, подозрение на эпилепсию или регресс речи — ЭЭГ");
  if (tone?.state === "low") add("ck_tsh", "сниженный тонус — КФК и ТТГ");
  if (form.conclusions.some((code) => ["dev_delay", "psycho_speech_delay", "motor_delay"].includes(code)) || marked) {
    add("genetics", "задержка развития неясной причины — генетик");
  }
  if (form.head?.shape === "synostosis_suspected" || form.conclusions.includes("craniosynostosis")) {
    add("ct", "подозрение на краниосиностоз — КТ");
    add("neurosurgeon", "подозрение на краниосиностоз — нейрохирург");
  }
  const urgent =
    form.redFlags.some((flag) => ["regression", "seizure", "fontanelle", "vomiting_lethargy"].includes(flag)) ||
    form.head?.fontanelle?.state === "tense" ||
    form.head?.fontanelle?.state === "bulging" ||
    form.meningeal === true ||
    form.studies.some((study) => study.result === "above3x");
  if (urgent) add("hospital", "срочный признак — в стационар");
  if (fontanelleClosed) hints.delete("nsg");
  return hints;
}

/** Нейросонография — только пока родничок открыт. */
export const NSG_CLOSED_HINT = "Неинформативна: ультразвук не проходит через кость";
