import dayjs from "dayjs";

import { gendered, type Option, type Sex } from "./neuroCatalog";
import { ageFor, fmt, monthsOn, rangeText, type AgeContext, type NeuroLevel } from "./neuroNorms";

/**
 * Вехи развития (ТЗ §3.3–3.5): каталог с порогами, статус вехи и картина вех,
 * собранная из отметок во всех записях раздела. Действует последняя отметка.
 */

export type Sphere = "gross" | "fine" | "speech" | "social" | "skills";

export const SPHERES: ReadonlyArray<Option<Sphere>> = [
  { value: "gross", label: "Крупная моторика" },
  { value: "fine", label: "Мелкая моторика" },
  { value: "speech", label: "Речь" },
  { value: "social", label: "Общение и познание" },
  { value: "skills", label: "Навыки" },
];

interface MilestoneBase {
  code: string;
  sphere: Sphere;
  /** Подпись в списках; «{а}» — окончание по полу. */
  label: string;
  /** Коротко — на ленте вех. */
  short: string;
  /** Начало сигнала: «Ещё не ходит сам{а}», «Нет ни одного слова». */
  absent: string;
  /** Основа порогов — в подсказке. */
  basis: string;
}

/** Шесть вех ВОЗ (MGRS, 2006): окна достижения по центилям, мес. */
export interface WhoMilestone extends MilestoneBase {
  kind: "who";
  p1: number;
  p50: number;
  p90: number;
  p99: number;
  /** «Сами ходят» — для текста сигнала. */
  doers: string;
  /** «пойдёт» — «если не пойдёт к 17,6 мес». */
  will: string;
}

/** Остальные вехи: обычный возраст и пороги «жёлтый с», «красный с», мес. */
export interface NormMilestone extends MilestoneBase {
  kind: "norm";
  typical: readonly [number, number];
  yellow: number;
  red: number | null;
  /** Норма словами для жёлтого сигнала, если у порога есть источник (CDC). */
  yellowNote?: string;
  /** Норма словами для красного сигнала (флаги протокола МЗ КР). */
  redNote?: string;
  /** Действие при тревожном сигнале вместо «К неврологу». */
  badAction?: string;
  /** Действие при пограничном сигнале вместо «Повтор через месяц». */
  warnAction?: string;
}

export type MilestoneDef = WhoMilestone | NormMilestone;

const WHO = "окна ВОЗ (MGRS, 2006)";
const CONFIRM = "врачу подтвердить";

const who = (
  code: string,
  label: string,
  short: string,
  absent: string,
  doers: string,
  will: string,
  [p1, p50, p90, p99]: readonly [number, number, number, number],
): WhoMilestone => ({ kind: "who", code, sphere: "gross", label, short, absent, doers, will, p1, p50, p90, p99, basis: WHO });

const norm = (
  sphere: Sphere,
  code: string,
  label: string,
  absent: string,
  typical: readonly [number, number],
  yellow: number,
  red: number | null,
  extra: Partial<NormMilestone> & { short?: string; basis?: string } = {},
): NormMilestone => ({
  kind: "norm",
  code,
  sphere,
  label,
  short: extra.short ?? label,
  absent,
  typical,
  yellow,
  red,
  basis: extra.basis ?? CONFIRM,
  ...extra,
});

export const MILESTONES: ReadonlyArray<MilestoneDef> = [
  // ── Крупная моторика: вехи ВОЗ ─────────────────────────────────────────────
  who("sits", "Сидит без поддержки", "Сидит без поддержки", "Ещё не сидит без поддержки", "Без поддержки сидят", "сядет", [3.8, 5.9, 7.5, 9.2]),
  who("crawls", "Ползает на четвереньках", "Ползает на четвереньках", "Ещё не ползает на четвереньках", "Ползают", "поползёт", [5.2, 8.3, 10.5, 13.5]),
  who("stands_support", "Стоит с поддержкой", "Стоит с поддержкой", "Ещё не стоит с поддержкой", "С поддержкой стоят", "встанет", [4.8, 7.4, 9.4, 11.4]),
  who("walks_support", "Ходит с поддержкой", "Ходит с поддержкой", "Ещё не ходит с поддержкой", "С поддержкой ходят", "пойдёт", [5.9, 9.0, 11.0, 13.7]),
  who("stands_alone", "Стоит самостоятельно", "Стоит сам{а}", "Ещё не стоит сам{а}", "Сами стоят", "встанет", [6.9, 10.8, 13.4, 16.9]),
  who("walks_alone", "Ходит самостоятельно", "Ходит сам{а}", "Ещё не ходит сам{а}", "Сами ходят", "пойдёт", [8.2, 12.0, 14.4, 17.6]),

  // ── Крупная моторика: остальные ────────────────────────────────────────────
  norm("gross", "head_prone", "Поднимает голову лёжа на животе, опирается на предплечья", "Ещё не поднимает голову лёжа на животе", [1, 3], 3, 4, {
    short: "Голову лёжа на животе",
  }),
  norm(
    "gross",
    "head_control",
    "Держит голову вертикально; при подтягивании за руки голова не запрокидывается",
    "Ещё не держит голову",
    [2, 4],
    4,
    5,
    { short: "Держит голову" },
  ),
  norm("gross", "rolls", "Переворачивается (в любую сторону)", "Ещё не переворачивается", [4, 6], 7, 9, { short: "Переворачивается" }),
  norm("gross", "sits_up", "Сам{а} садится из положения лёжа", "Ещё не садится сам{а}", [8, 9], 10, 12),
  norm("gross", "runs", "Бегает", "Ещё не бегает", [15, 15], 24, 30),
  norm("gross", "jumps", "Прыгает на двух ногах", "Ещё не прыгает на двух ногах", [24, 30], 30, 36),
  norm(
    "gross",
    "stairs",
    "Идёт по лестнице чередующимся шагом, крутит педали трёхколёсного велосипеда",
    "Ещё не ходит по лестнице чередующимся шагом",
    [30, 36],
    48,
    null,
    { short: "Лестница чередующимся шагом" },
  ),
  norm("gross", "hops", "Прыгает на одной ноге с продвижением", "Ещё не прыгает на одной ноге", [60, 60], 60, 72),
  norm("gross", "long_jump", "Прыгает в длину с места на 70 см и дальше", "Ещё не прыгает в длину с места на 70 см", [72, 72], 72, null, {
    basis: "КубГМУ",
  }),

  // ── Мелкая моторика ────────────────────────────────────────────────────────
  norm(
    "fine",
    "hands_open",
    "Кисти раскрыты, сводит руки к середине, держит вложенную игрушку",
    "Кисти ещё сжаты в кулачки",
    [3, 4],
    4,
    6,
    { short: "Кисти раскрыты" },
  ),
  norm("fine", "reaches", "Тянется и берёт игрушку", "Ещё не тянется к игрушке", [4, 5], 6, 7),
  norm("fine", "transfers", "Перекладывает предмет из руки в руку", "Ещё не перекладывает предмет из руки в руку", [6, 6], 9, 10),
  norm("fine", "pincer", "Берёт мелкое двумя пальцами (щипковый захват)", "Нет щипкового захвата", [9, 12], 12, 15, { short: "Щипковый захват" }),
  norm("fine", "scribbles", "Рисует каракули, ставит кубик на кубик", "Ещё не рисует каракули", [15, 18], 24, null),
  norm("fine", "circle", "Срисовывает круг", "Ещё не срисовывает круг", [36, 36], 48, null),
  norm("fine", "pencil", "Держит карандаш пальцами, рисует человека из трёх и более частей", "Ещё не держит карандаш пальцами", [48, 48], 60, null),
  norm("fine", "buttons", "Застёгивает пуговицы", "Ещё не застёгивает пуговицы", [48, 60], 60, null),
  norm("fine", "coloring", "Закрашивает круг диаметром 2 см за 70 секунд и быстрее", "Ещё не закрашивает круг за 70 секунд", [72, 72], 72, null, {
    basis: "КубГМУ",
  }),

  // ── Речь ───────────────────────────────────────────────────────────────────
  norm("speech", "coos", "Гулит", "Ещё не гулит", [1, 3], 4, 6, {
    basis: "жёлтый — CDC; красный — врачу подтвердить",
    yellowNote: "По CDC гулят 75 % детей к 4 мес",
  }),
  norm("speech", "babbles", "Лепечет слогами («ба-ба», «ма-ма»)", "Ещё не лепечет", [6, 7], 9, 12, {
    short: "Лепет",
    basis: "CDC, протокол МЗ КР",
    yellowNote: "По CDC лепечут 75 % детей к 9 мес",
    redNote: "По протоколу МЗ КР лепет должен появиться к 12 мес",
  }),
  norm("speech", "name", "Откликается на имя", "Ещё не откликается на имя", [6, 9], 9, 12, {
    basis: "жёлтый — CDC; красный — врачу подтвердить",
    yellowNote: "По CDC откликаются на имя 75 % детей к 9 мес",
  }),
  norm("speech", "gestures", "Жесты: машет «пока», показывает пальцем", "Нет жестов", [9, 12], 12, 12, {
    short: "Жесты",
    basis: "протокол МЗ КР",
    redNote: "По протоколу МЗ КР жесты должны появиться к 12 мес",
  }),
  norm("speech", "first_words", "Первые слова", "Нет ни одного слова", [10, 12], 15, 16, {
    basis: "CDC, протокол МЗ КР",
    yellowNote: "По CDC 75 % детей к 15 мес говорят 1–2 слова",
    redNote: "По протоколу МЗ КР слова должны появиться к 16 мес",
  }),
  norm("speech", "understands", "Выполняет простые просьбы без жеста", "Ещё не выполняет простые просьбы без жеста", [8, 12], 18, 24, {
    basis: "жёлтый — CDC; красный — врачу подтвердить",
    yellowNote: "По CDC так делают 75 % детей к 18 мес",
  }),
  norm("speech", "phrase2", "Своя фраза из двух слов, не повтор", "Нет своей фразы из двух слов", [21, 24], 24, 24, {
    short: "Фраза из двух слов",
    basis: "протокол МЗ КР",
    redNote: "По протоколу МЗ КР своя фраза из двух слов должна появиться к 24 мес",
  }),
  norm("speech", "phrase3", "Фраза из трёх и более слов, около 50 слов", "Нет фразы из трёх слов", [24, 30], 30, 36, {
    basis: "жёлтый — CDC; красный — врачу подтвердить",
    yellowNote: "По CDC так говорят 75 % детей к 30 мес",
  }),
  norm(
    "speech",
    "questions",
    "Спрашивает «где?», «почему?», говорит сложными предложениями; чужие понимают большую часть речи",
    "Ещё не задаёт вопросов и не говорит сложными предложениями",
    [30, 36],
    42,
    48,
  ),
  norm("speech", "story", "Рассказывает по картинке (два события и больше)", "Ещё не рассказывает по картинке", [60, 60], 60, 72),
  norm("speech", "clear_sounds", "Чисто произносит все звуки", "Ещё не произносит чисто все звуки", [60, 72], 60, 84, {
    basis: "врачу подтвердить; оценивает логопед",
    warnAction: "К логопеду",
  }),

  // ── Общение и познание ─────────────────────────────────────────────────────
  norm("social", "fixes_gaze", "Фиксирует взгляд и следит за предметом", "Ещё не фиксирует взгляд", [0, 1], 2, 3, {
    basis: "врачу подтвердить; красный — ещё и к офтальмологу",
    badAction: "К неврологу и офтальмологу",
  }),
  norm("social", "smiles", "Улыбается в ответ, «комплекс оживления»", "Ещё не улыбается в ответ", [1, 3], 3, 4),
  norm("social", "strangers", "Отличает своих от чужих", "Ещё не отличает своих от чужих", [5, 6], 7, 9),
  norm("social", "imitates", "Ищет спрятанный предмет, подражает («ладушки»)", "Ещё не подражает и не ищет спрятанное", [9, 12], 12, 15),
  norm(
    "social",
    "joint_attention",
    "Показывает взрослому интересное (совместное внимание)",
    "Ещё не показывает взрослому интересное",
    [15, 18],
    18,
    24,
  ),
  norm("social", "pretend_play", "Играет «понарошку», сюжетная игра", "Ещё не играет «понарошку»", [18, 30], 30, 36),

  // ── Навыки ─────────────────────────────────────────────────────────────────
  norm("skills", "cup", "Пьёт из чашки", "Ещё не пьёт из чашки", [12, 12], 18, 24),
  norm("skills", "spoon", "Ест ложкой", "Ещё не ест ложкой", [15, 15], 21, 27),
  norm("skills", "dresses", "Одевается сам{а}", "Ещё не одевается сам{а}", [36, 36], 42, 48),
];

export const WHO_MILESTONES: ReadonlyArray<WhoMilestone> = MILESTONES.filter((item): item is WhoMilestone => item.kind === "who");

export function milestoneDef(code: string): MilestoneDef | undefined {
  return MILESTONES.find((item) => item.code === code);
}

/** Возраст, по которому веха стоит в списке: медиана ВОЗ или начало «обычно». */
export const typicalAge = (def: MilestoneDef): number => (def.kind === "who" ? def.p50 : def.typical[0]);

/** Числа ВОЗ — с одним знаком после запятой, как в таблице: «12,0». */
export const whoNumber = (value: number): string => value.toFixed(1).replace(".", ",");

/** Подсказка нормы у вехи: «обычно 9–12 мес» или «ВОЗ: половина детей — к 12,0 мес, 90 % — к 14,4». */
export function normHint(def: MilestoneDef): string {
  if (def.kind === "who") return `ВОЗ: половина детей — к ${whoNumber(def.p50)} мес, 90 % — к ${whoNumber(def.p90)}, 99 % — к ${whoNumber(def.p99)}`;
  const thresholds = [`пограничное — с ${fmt(def.yellow)} мес`, def.red != null ? `тревожно — с ${fmt(def.red)} мес` : ""].filter(Boolean);
  return `обычно ${rangeText(def.typical)}; ${thresholds.join(", ")} · ${def.basis}`;
}

// ── Отметки ──────────────────────────────────────────────────────────────────

/** Освоена / ещё нет / утрачена (регресс) / пропущена — только ползание. */
export type MarkState = "yes" | "no" | "lost" | "skipped";

export interface MilestoneMark {
  state: MarkState;
  /** ГГГГ-ММ-ДД — с какой даты освоена; null — «не помню». */
  since: string | null;
  /** Со слов родителей; иначе — видел врач. */
  reported: boolean;
}

const MARK_STATES: ReadonlyArray<MarkState> = ["yes", "no", "lost", "skipped"];

/** Отметки из `data.milestones`: мусор пропускается, коды не из каталога сохраняются как есть. */
export function readMarks(value: unknown): Record<string, MilestoneMark> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, MilestoneMark> = {};
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const mark = raw as Record<string, unknown>;
    const state = MARK_STATES.find((item) => item === mark.state);
    if (!state) continue;
    const since = typeof mark.since === "string" && dayjs(mark.since).isValid() ? mark.since : null;
    out[code] = { state, since: state === "yes" ? since : null, reported: mark.reported === true };
  }
  return out;
}

/** Отметки для записи: у «есть» — дата или null («не помню»), у остальных даты нет. */
export function cleanMarks(marks: Readonly<Record<string, MilestoneMark>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [code, mark] of Object.entries(marks)) {
    out[code] =
      mark.state === "yes" ? { state: mark.state, since: mark.since, reported: mark.reported } : { state: mark.state, reported: mark.reported };
  }
  return out;
}

/** Запись с отметками вех: осмотр или «Отметка вех развития». */
export interface MarkSource {
  recordId: number;
  /** Дата записи (`occurredAt`). */
  at: string;
  createdAt: string;
  marks: Record<string, MilestoneMark>;
}

export interface PictureEntry {
  code: string;
  /** Последняя отметка — она и действует. */
  mark: MilestoneMark;
  /** Дата записи с последней отметкой. */
  at: string;
  recordId: number;
  /** Последняя отметка «есть»: её срок показывают, если навык потом утрачен. */
  lastYes: { since: string | null; at: string } | null;
}

export type Picture = Map<string, PictureEntry>;

const time = (value: string): number => dayjs(value).valueOf();

/** Картина вех: отметки по дате записи, при равенстве — по времени создания; действует последняя. */
export function buildPicture(sources: ReadonlyArray<MarkSource>): Picture {
  const ordered = [...sources].sort((a, b) => time(a.at) - time(b.at) || time(a.createdAt) - time(b.createdAt));
  const picture: Picture = new Map();
  for (const source of ordered) {
    for (const [code, mark] of Object.entries(source.marks)) {
      const previous = picture.get(code);
      picture.set(code, {
        code,
        mark,
        at: source.at,
        recordId: source.recordId,
        lastYes: mark.state === "yes" ? { since: mark.since, at: source.at } : previous?.lastYes ?? null,
      });
    }
  }
  return picture;
}

// ── Статус вехи ──────────────────────────────────────────────────────────────

export type ViewState = "yes" | "no" | "lost" | "none" | "variant";

export interface MilestoneView {
  def: MilestoneDef;
  entry: PictureEntry | null;
  state: ViewState;
  /** Цвет точки или строки. */
  level: NeuroLevel;
  /** Возраст освоения (для норм), если известна дата. */
  sinceAge: number | null;
  /** «Не помню»: освоена не позже этого возраста (дата записи). */
  byAge: number | null;
  /** Пояснение: «позже, чем у 90 % детей», «уточните, с какого возраста». */
  note: string;
  /** Освоена позже обычного — жёлтая или красная точка, без баннера. */
  late: boolean;
  /** Даёт сигнал в баннер: «ещё нет» после срока или регресс. */
  signal: boolean;
}

/** Освоенная веха ВОЗ по возрасту на дату освоения (границы включительно). */
export function whoAchievedLevel(def: WhoMilestone, age: number): { level: NeuroLevel; note: string; late: boolean } {
  if (age < def.p1) return { level: "ok", note: "раньше 99 % детей — проверьте дату", late: false };
  if (age <= def.p90) return { level: "ok", note: "", late: false };
  if (age <= def.p99) return { level: "warn", note: "позже, чем у 90 % детей", late: true };
  return { level: "bad", note: "позже, чем у 99 % детей", late: true };
}

/** Неосвоенная веха ВОЗ по сегодняшнему возрасту. */
export function whoPendingLevel(def: WhoMilestone, age: number): NeuroLevel {
  if (age <= def.p90) return "unknown";
  return age <= def.p99 ? "warn" : "bad";
}

/** Освоенная веха с порогами: позже «жёлтого» — жёлтая, позже «красного» — красная. */
export function normAchievedLevel(def: NormMilestone, age: number): { level: NeuroLevel; note: string; late: boolean } {
  if (def.red != null && age > def.red) return { level: "bad", note: `позже ${fmt(def.red)} мес`, late: true };
  if (age > def.yellow) return { level: "warn", note: `позже ${fmt(def.yellow)} мес`, late: true };
  return { level: "ok", note: "", late: false };
}

/** Неосвоенная веха с порогами: с «жёлтого» — пограничное, с «красного» — тревожно. */
export function normPendingLevel(def: NormMilestone, age: number): NeuroLevel {
  if (def.red != null && age >= def.red) return "bad";
  return age >= def.yellow ? "warn" : "unknown";
}

function evaluateOne(def: MilestoneDef, entry: PictureEntry | null, ctx: AgeContext, todayAge: number | null): MilestoneView {
  const base: MilestoneView = { def, entry, state: "none", level: "unknown", sinceAge: null, byAge: null, note: "нет отметки", late: false, signal: false };
  if (!entry) return base;
  const { mark } = entry;
  if (mark.state === "lost") {
    return { ...base, state: "lost", level: "urgent", note: "навык утрачен — регресс", signal: true };
  }
  if (mark.state === "skipped") return { ...base, state: "variant", note: "вариант нормы" };
  if (mark.state === "yes") {
    if (mark.since) {
      const age = ageFor(ctx, mark.since);
      if (age == null) return { ...base, state: "yes", note: "" };
      const result = def.kind === "who" ? whoAchievedLevel(def, age) : normAchievedLevel(def, age);
      return { ...base, state: "yes", sinceAge: age, ...result };
    }
    const byAge = ageFor(ctx, entry.at);
    const limit = def.kind === "who" ? def.p90 : def.yellow;
    if (byAge != null && byAge <= limit) return { ...base, state: "yes", byAge, level: "ok", note: "" };
    return { ...base, state: "yes", byAge, level: "unknown", note: byAge == null ? "" : "уточните, с какого возраста" };
  }
  // «Ещё нет» действует до новой отметки: цвет — по сегодняшнему возрасту.
  if (todayAge == null) return { ...base, state: "no", note: "ещё нет" };
  const level = def.kind === "who" ? whoPendingLevel(def, todayAge) : normPendingLevel(def, todayAge);
  return { ...base, state: "no", level, note: level === "unknown" ? "ещё нет, срок не вышел" : "ещё нет", signal: level !== "unknown" };
}

/**
 * Вехи на сегодня. Особое правило ползания: не ползает, но ходит с поддержкой
 * или сам — вариант нормы, серым, без сигнала (не ползают 4,3 % детей, ВОЗ).
 */
export function evaluateMilestones(picture: Picture, ctx: AgeContext, today: string): Map<string, MilestoneView> {
  const todayAge = ageFor(ctx, today);
  const views = new Map<string, MilestoneView>();
  for (const def of MILESTONES) views.set(def.code, evaluateOne(def, picture.get(def.code) ?? null, ctx, todayAge));
  const crawl = views.get("crawls");
  const walks = ["walks_support", "walks_alone"].some((code) => views.get(code)?.state === "yes");
  if (crawl && walks && (crawl.state === "no" || crawl.state === "none")) {
    views.set("crawls", { ...crawl, state: "variant", level: "unknown", note: "не ползал{а}, сразу начал{а} ходить — вариант нормы", signal: false });
  }
  return views;
}

/**
 * «Встал раньше, чем сел» (AAP 2013): «стоит с поддержкой» освоено раньше, чем
 * «сидит без поддержки», — пограничное, возможный признак повышенного тонуса.
 */
export function stoodBeforeSat(views: ReadonlyMap<string, MilestoneView>): { standAge: number; sitAge: number | null } | null {
  const stand = views.get("stands_support");
  const sit = views.get("sits");
  if (!stand || !sit || stand.state !== "yes" || stand.sinceAge == null) return null;
  if (sit.state === "yes" && sit.sinceAge != null && stand.sinceAge < sit.sinceAge) return { standAge: stand.sinceAge, sitAge: sit.sinceAge };
  if (sit.state === "no") return { standAge: stand.sinceAge, sitAge: null };
  return null;
}

// ── Окно вехи и кнопки месяцев ───────────────────────────────────────────────

/** Окно «вех возраста»: от Ц1 (или начала «обычно» − 2 мес) до Ц99 (или «красного», а без него «жёлтого») + 6 мес. */
export function milestoneWindow(def: MilestoneDef): readonly [number, number] {
  if (def.kind === "who") return [def.p1, def.p99 + 6];
  return [Math.max(0, def.typical[0] - 2), (def.red ?? def.yellow) + 6];
}

export function inWindow(def: MilestoneDef, age: number | null): boolean {
  if (age == null) return false;
  const [from, to] = milestoneWindow(def);
  return age >= from && age <= to;
}

/** Шаг кнопок месяцев: до года — полмесяца, до 3 лет — месяц, дальше — три месяца. */
const stepAt = (months: number): number => (months < 12 ? 0.5 : months < 36 ? 1 : 3);

/**
 * Кнопки «с N мес» (паспортный возраст): с нижней границы окна вехи до
 * сегодняшнего возраста. `offset` — на сколько паспортный возраст больше
 * скорригированного у недоношенного.
 */
export function monthChoices(def: MilestoneDef, todayPassport: number | null, offset = 0): number[] {
  if (todayPassport == null) return [];
  let from = Math.max(0, milestoneWindow(def)[0] + offset);
  const to = todayPassport;
  if (from > to) from = Math.max(0, to - 3);
  const out: number[] = [];
  let value = Math.ceil(from / stepAt(from) - 1e-9) * stepAt(from);
  while (value <= to + 1e-9 && out.length < 60) {
    out.push(Math.round(value * 10) / 10);
    const step = stepAt(value);
    value = Math.round((value + step) / step) * step;
  }
  return out;
}

// ── Тексты ───────────────────────────────────────────────────────────────────

/** Подпись вехи по полу. */
export function milestoneLabel(def: MilestoneDef, sex: Sex, short = false): string {
  return gendered(short ? def.short : def.label, sex);
}

/** «с 15 мес», «с 7 мес (скорр. 5)», «не позже 15 мес», «ещё нет», «утрачен». */
export function stateText(view: MilestoneView, birthDate: string | null, sex: Sex): string {
  const entry = view.entry;
  if (view.state === "yes" && entry) {
    const since = entry.mark.since;
    if (since && birthDate) {
      const passport = monthsOn(birthDate, since);
      if (passport == null) return "есть";
      const corrected = view.sinceAge != null && Math.abs(view.sinceAge - passport) >= 0.5 ? ` (скорр. ${fmt(Math.max(0, Math.round(view.sinceAge * 2) / 2))})` : "";
      return `с ${fmt(passport)} мес${corrected}`;
    }
    const by = birthDate ? monthsOn(birthDate, entry.at) : null;
    return by != null ? `не позже ${fmt(by)} мес` : "есть";
  }
  if (view.state === "lost") return "утрачен";
  if (view.state === "no") return "ещё нет";
  if (view.state === "variant") return gendered(view.note, sex);
  return "нет отметки";
}

/** Вехи сферы по возрасту: сначала ранние. */
export function sphereMilestones(sphere: Sphere): MilestoneDef[] {
  return MILESTONES.filter((def) => def.sphere === sphere).sort((a, b) => typicalAge(a) - typicalAge(b));
}

/** Вехи, освоенные позже обычного: жёлтые и красные точки. */
export function lateMilestones(views: ReadonlyMap<string, MilestoneView>): MilestoneView[] {
  return [...views.values()].filter((view) => view.late).sort((a, b) => typicalAge(a.def) - typicalAge(b.def));
}

/** «Ходит сама — с 15 мес: позже, чем 90 % детей (окно ВОЗ — до 17,6 мес)». */
export function lateText(view: MilestoneView, birthDate: string | null, sex: Sex): string {
  const def = view.def;
  const head = `${milestoneLabel(def, sex, true)} — ${stateText(view, birthDate, sex)}`;
  if (def.kind === "who") {
    return view.level === "warn"
      ? `${head}: позже, чем 90 % детей (окно ВОЗ — до ${whoNumber(def.p99)} мес)`
      : `${head}: позже, чем 99 % детей (окно ВОЗ — до ${whoNumber(def.p99)} мес)`;
  }
  return `${head}: позже обычного (обычно ${rangeText(def.typical)})`;
}

// ── Речевые сроки на ленте (протокол МЗ КР) ──────────────────────────────────

export interface SpeechFlag {
  months: number;
  name: string;
  /** Освоено, ждём, срок прошёл, нет отметки. */
  state: "done" | "waiting" | "late" | "none";
  note: string;
}

const SPEECH_FLAGS: ReadonlyArray<{ months: number; name: string; short: string; codes: ReadonlyArray<string> }> = [
  { months: 12, name: "лепет и жесты", short: "лепет", codes: ["babbles", "gestures"] },
  { months: 16, name: "первые слова", short: "слова", codes: ["first_words"] },
  { months: 24, name: "фраза из 2 слов", short: "фраза", codes: ["phrase2"] },
];

/** Ромбы «Речь · тревожные сроки»: нет лепета и жестов к 12 мес, слов к 16, фразы к 24 — тревожно. */
export function speechFlags(views: ReadonlyMap<string, MilestoneView>, todayAge: number | null, birthDate: string | null, sex: Sex): SpeechFlag[] {
  return SPEECH_FLAGS.map(({ months, name, short, codes }) => {
    const list = codes.map((code) => views.get(code)).filter((view): view is MilestoneView => view != null);
    const base = { months, name };
    if (list.some((view) => view.state === "lost")) return { ...base, state: "late", note: "навык утрачен" };
    if (list.length && list.every((view) => view.state === "yes")) return { ...base, state: "done", note: `${short} ${stateText(list[0], birthDate, sex)}` };
    if (todayAge == null) return { ...base, state: "none", note: "нет оценки" };
    if (todayAge < months) return { ...base, state: "waiting", note: `ждём до ${months} мес` };
    if (list.some((view) => view.state === "no")) return { ...base, state: "late", note: "срок прошёл" };
    return { ...base, state: "none", note: "нет отметки" };
  });
}
