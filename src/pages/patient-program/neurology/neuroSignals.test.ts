import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import { emptyExamForm, readExam, type NeuroExam } from "./neuroData";
import { buildPicture, evaluateMilestones, type MarkSource, type MilestoneMark } from "./neuroMilestones";
import { sinceDate } from "./neuroNorms";
import {
  buildBanner,
  collectSignals,
  examFindings,
  examLevel,
  headInfo,
  mergeSignals,
  recommendationHints,
  redFlagSignals,
  signalText,
  signalTitle,
  summaryChips,
  toneText,
  type Signal,
} from "./neuroSignals";

let nextId = 1;
const exam = (occurredAt: string, data: Record<string, unknown>, status = "completed"): NeuroExam =>
  readExam({
    id: nextId++,
    title: "Осмотр невролога",
    occurredAt,
    createdAt: occurredAt,
    status,
    notes: "",
    data: { neuroKind: "exam", examType: "neurologist", ...data },
    createdByName: "Невролог",
  } as unknown as ProgramModuleRecord);

const yes = (birth: string, months: number): MilestoneMark => ({ state: "yes", since: sinceDate(birth, months), reported: true });
const no: MilestoneMark = { state: "no", since: null, reported: true };
const views = (birth: string, today: string, marks: Record<string, MilestoneMark>, at = "2026-07-01") => {
  const source: MarkSource = { recordId: 1, at, createdAt: at, marks };
  return evaluateMilestones(buildPicture([source]), { birthDate: birth, gestation: null }, today);
};

const make = (key: string, level: Signal["level"], group: Signal["group"], summary = key): Signal => ({
  key,
  level,
  group,
  summary,
  details: [],
  action: "",
  date: null,
  milestone: false,
});

describe("сигналы по вехам", () => {
  it("ВОЗ, пограничное: текст с числами, дата отметки и кнопка «Отметить вехи»", () => {
    const birth = "2025-07-04";
    const signals = collectSignals({
      views: views(birth, "2026-10-04", { walks_alone: no }),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2026-10-04",
      sex: "male",
      head: null,
    });
    expect(signals).toHaveLength(1);
    expect(signalTitle(signals[0])).toBe("Ещё не ходит сам в 1 год 3 мес — пограничное");
    expect(signalText(signals[0])).toBe(
      "Сами ходят 90 % детей к 14,4 мес и 99 % — к 17,6 мес. Повтор через месяц; если не пойдёт к 17,6 мес — к неврологу.",
    );
    expect(signals[0]).toMatchObject({ milestone: true, date: "2026-07-01", group: "who" });
  });

  it("речевой флаг протокола КР: нет ни одного слова к 16 мес — тревожно", () => {
    const birth = "2025-05-04";
    const [signal] = collectSignals({
      views: views(birth, "2026-10-04", { first_words: no }),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2026-10-04",
      sex: "female",
      head: null,
    });
    expect(signalTitle(signal)).toBe("Нет ни одного слова в 1 год 5 мес — тревожно");
    expect(signalText(signal)).toBe("По протоколу МЗ КР слова должны появиться к 16 мес. К неврологу, проверить слух.");
    expect(signal.group).toBe("speech");
  });

  it("CDC: просьбы без жеста к 18 мес — пограничное", () => {
    const birth = "2025-03-26";
    const [signal] = collectSignals({
      views: views(birth, "2026-10-04", { understands: no }),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2026-10-04",
      sex: "female",
      head: null,
    });
    expect(signalTitle(signal)).toBe("Ещё не выполняет простые просьбы без жеста в 1 год 6 мес — пограничное");
    expect(signalText(signal)).toBe("По CDC так делают 75 % детей к 18 мес. Повтор через месяц; если нет к 24 мес — к неврологу, проверить слух.");
  });

  it("утраченный навык — срочно", () => {
    const birth = "2025-03-26";
    const [signal] = collectSignals({
      views: views(birth, "2026-10-04", { first_words: { state: "lost", since: null, reported: false } }),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2026-10-04",
      sex: "female",
      head: null,
    });
    expect(signalTitle(signal)).toBe("Утрачен навык «первые слова» — срочно");
    expect(signal.level).toBe("urgent");
  });

  it("поздно освоенная веха — без сигнала; «встал раньше, чем сел» — пограничное до 18 мес", () => {
    const birth = "2025-03-26";
    const late = collectSignals({
      views: views(birth, "2026-10-04", { walks_alone: yes(birth, 15) }),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2026-10-04",
      sex: "female",
      head: null,
    });
    expect(late).toEqual([]);
    const stood = collectSignals({
      views: views(birth, "2025-12-01", { sits: yes(birth, 7.5), stands_support: yes(birth, 7) }, "2025-12-01"),
      exams: [],
      ages: { birthDate: birth, gestation: null },
      today: "2025-12-01",
      sex: "female",
      head: null,
    });
    expect(stood.map(signalTitle)).toEqual(["Встала с поддержкой раньше, чем села — пограничное"]);
  });
});

describe("сигналы по осмотрам", () => {
  const birth = "2025-03-26";
  const ages = { birthDate: birth, gestation: null };

  it("Моро держится в 7 мес — тревожно", () => {
    const signals = collectSignals({
      views: views(birth, "2025-10-30", {}),
      exams: [exam("2025-10-26T06:00:00Z", { reflexes: { moro: { state: "present" } } })],
      ages,
      today: "2025-10-30",
      sex: "female",
      head: null,
    });
    expect(signals.map((item) => `${signalTitle(item)}. ${signalText(item)}`)).toEqual([
      "Моро держится в 7 мес — тревожно. Угасает к 4 мес, не позже 6. К неврологу.",
    ]);
  });

  it("берётся последний осмотр, где блок заполнен; безусловные рефлексы после 18 мес сигналов не дают", () => {
    const old = exam("2025-10-26T06:00:00Z", { reflexes: { moro: { state: "present" } }, tone: { state: "dystonia" } });
    const fresh = exam("2026-04-12T06:00:00Z", { tone: { state: "normal", symmetry: "equal" } });
    const signals = collectSignals({ views: views(birth, "2026-10-04", {}), exams: [fresh, old], ages, today: "2026-10-04", sex: "female", head: null });
    expect(signals).toEqual([]);
  });

  it("одинаковые сигналы сливаются: асимметрия в тонусе и в тревожных признаках", () => {
    const latest = exam("2026-04-12T06:00:00Z", { tone: { state: "normal", symmetry: "d_gt_s" }, redFlags: ["asymmetry"] });
    const signals = collectSignals({ views: views(birth, "2026-10-04", {}), exams: [latest], ages, today: "2026-10-04", sex: "female", head: null });
    const asymmetry = signals.filter((item) => item.key === "asymmetry");
    expect(asymmetry).toHaveLength(1);
    expect(signalText(asymmetry[0])).toBe("Тонус D > S. К неврологу.");
  });

  it("родничок выбухает — срочно; тревожные признаки — только из последнего осмотра", () => {
    const older = exam("2025-06-26T06:00:00Z", { redFlags: ["seizure"] });
    const latest = exam("2025-09-26T06:00:00Z", { head: { fontanelle: { state: "bulging" } } });
    const signals = collectSignals({ views: views(birth, "2025-09-27", {}), exams: [latest, older], ages, today: "2025-09-27", sex: "female", head: null });
    expect(signals.map((item) => item.key)).toEqual(["fontanelle"]);
    expect(signals[0].level).toBe("urgent");
  });

  it("окружность головы: больше 3 SD — тревожно; пересечение двух линий центилей — тревожно", () => {
    const head = headInfo({ at: "2026-09-26", cm: 51, z: 3.4 }, { at: "2026-06-26", cm: 47, z: 0.2 });
    const signals = collectSignals({ views: views(birth, "2026-10-04", {}), exams: [], ages, today: "2026-10-04", sex: "female", head });
    expect(signals.map(signalTitle)).toEqual([
      "Окружность головы 51 см — больше нормы на 3 SD — тревожно",
      "Окружность головы пересекла 2 линии центилей — тревожно",
    ]);
  });
});

describe("баннер", () => {
  it("уровень — самый высокий; до трёх строк этого уровня, остальное — «ещё N»", () => {
    const banner = buildBanner([
      make("sleep", "warn", "sleep"),
      make("a", "bad", "tone"),
      make("b", "bad", "reflexes"),
      make("c", "bad", "who"),
      make("d", "bad", "asymmetry"),
    ]);
    expect(banner?.level).toBe("bad");
    expect(banner?.top.map((item) => item.key)).toEqual(["d", "c", "b"]);
    expect(banner?.rest.map((item) => item.key)).toEqual(["a", "sleep"]);
  });

  it("порядок внутри уровня: регресс, родничок, приступы, асимметрия, речь, вехи ВОЗ, остальные вехи, рефлексы, голова, тонус, сон", () => {
    const banner = buildBanner([
      make("seizure", "urgent", "seizures"),
      make("fontanelle", "urgent", "fontanelle"),
      make("regression", "urgent", "regression"),
    ]);
    expect(banner?.top.map((item) => item.key)).toEqual(["regression", "fontanelle", "seizure"]);
  });

  it("сигналов нет — баннера нет", () => {
    expect(buildBanner([])).toBeNull();
  });

  it("слияние: уровень — высший, пояснения — вместе", () => {
    const merged = mergeSignals([
      { ...make("regression", "urgent", "regression", "Утрачен навык «первые слова»"), milestone: true },
      make("regression", "urgent", "regression", "Утратила навык: речь, общение или движения"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].details).toEqual(["Утратила навык: речь, общение или движения."]);
    expect(merged[0].milestone).toBe(true);
  });

  it("тревожные признаки быстрого осмотра", () => {
    const signals = redFlagSignals(["regression", "handedness", "sunset"], "female", "2026-04-12");
    expect(signals.map((item) => [item.key, item.level])).toEqual([
      ["regression", "urgent"],
      ["handedness", "bad"],
      ["sunset", "bad"],
    ]);
  });
});

describe("метки и находки", () => {
  const birth = "2025-03-26";
  const ages = { birthDate: birth, gestation: null };
  const latest = exam("2026-04-12T06:00:00Z", {
    tone: { state: "normal", symmetry: "equal" },
    tendon: { level: "normal", symmetry: "equal" },
    head: { fontanelle: { a: 1, b: 1, state: "normal" } },
    sleep: { hours: 13 },
    speech: ["normal"],
  });

  it("метки «по последним данным» у девочки 1 г 6 мес — как в §9", () => {
    const head = headInfo({ at: "2026-09-26", cm: 46.3, z: 0.03 }, { at: "2026-06-26", cm: 45.8, z: 0.1 });
    const chips = summaryChips({ views: views(birth, "2026-10-04", {}), exams: [latest], ages, today: "2026-10-04", sex: "female", head });
    expect(chips.map((chip) => [chip.text, chip.level])).toEqual([
      ["Тонус: нормотонус, D = S", "ok"],
      ["Рефлексы живые, D = S", "ok"],
      ["Родничок 1,0 × 1,0 см, не напряжён", "ok"],
      ["Окружность головы 46,3 см — норма, из «Роста»", "ok"],
      ["Сон 13 ч в сутки", "ok"],
      ["Речь: соответствует возрасту", "ok"],
    ]);
  });

  it("находки осмотра в 1 мес: тонус жёлтый, остальное зелёное", () => {
    const first = exam("2025-05-05T08:00:00Z", {
      tone: { state: "dystonia", symmetry: "equal", score: 2 },
      reflexes: { moro: { state: "present" }, palmar_grasp: { state: "present" }, stepping: { state: "present" } },
      head: { fontanelle: { a: 2.5, b: 2.5, state: "normal" } },
      motor: { involuntary: ["tremor_cry"] },
      sleep: { hours: 16 },
    });
    const findings = examFindings(first, { age: 40 / 30.4375, date: first.record.occurredAt, sex: "female", ages });
    expect(findings.map((item) => [item.text, item.level])).toEqual([
      ["Тонус: дистония, D = S, 2 балла", "warn"],
      ["Рефлексы по возрасту", "ok"],
      ["Родничок 2,5 × 2,5 см, не напряжён", "ok"],
      ["Сон 16 ч в сутки", "ok"],
    ]);
    expect(examLevel(findings)).toBe("warn");
  });

  it("тонус словами", () => {
    expect(toneText({ state: "high", symmetry: "d_gt_s", parts: ["legs"], pattern: "adductor", score: 1 })).toBe(
      "повышен — приводящих («ножницы»), D > S, ноги, 1 балл",
    );
  });
});

describe("подсказки рекомендаций", () => {
  it("задержка речи — слух; приступы — ЭЭГ; срочное — стационар; закрытый родничок — без нейросонографии", () => {
    const form = { ...emptyExamForm(), speech: ["zrr"], seizures: { kinds: ["afebrile"], lastOn: null, frequency: "" }, redFlags: ["fontanelle"] };
    const hints = recommendationHints({ form, views: new Map(), headLevel: "ok", fontanelleClosed: true });
    expect([...hints.keys()]).toEqual(expect.arrayContaining(["hearing", "eeg", "hospital"]));
    expect(hints.has("nsg")).toBe(false);
    expect(hints.has("mri")).toBe(false);
  });

  it("сниженный тонус — КФК и ТТГ; подозрение на краниосиностоз — КТ и нейрохирург", () => {
    const form = {
      ...emptyExamForm(),
      tone: { state: "low" as const, symmetry: null, parts: [], pattern: null, score: null },
      head: { shape: "synostosis_suspected", fontanelle: null, smallFontanelle: null, sutures: null },
    };
    const hints = recommendationHints({ form, views: new Map(), headLevel: "ok", fontanelleClosed: false });
    expect([...hints.keys()]).toEqual(expect.arrayContaining(["ck_tsh", "ct", "neurosurgeon"]));
  });
});
