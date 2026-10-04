import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import {
  blocksForAge,
  allowedBlocks,
  buildDiagnosisData,
  buildExamData,
  buildMilestonesData,
  changedMarks,
  classifyNeuroRecords,
  composeConclusion,
  composeRecommendation,
  diagnosisSuggestions,
  diagnosisTitle,
  diagnosisValid,
  emptyDiagnosisForm,
  emptyExamForm,
  emptyTone,
  examHasContent,
  examToForm,
  filledBlocks,
  hasFullExam,
  isNeurologyModule,
  markSources,
  plannedCheckAt,
  readDiagnosis,
  readExam,
  toggleSpeech,
} from "./neuroData";

let nextId = 1;
const record = (data: Record<string, unknown>, extra: Partial<ProgramModuleRecord> = {}): ProgramModuleRecord =>
  ({
    id: nextId++,
    title: "Осмотр невролога",
    occurredAt: "2026-04-12T05:00:00Z",
    createdAt: "2026-04-12T05:10:00Z",
    status: "completed",
    notes: "",
    data,
    ...extra,
  }) as unknown as ProgramModuleRecord;

describe("isNeurologyModule", () => {
  it("узнаёт раздел по коду или типу", () => {
    expect(isNeurologyModule({ code: "neurology", moduleType: "neurology" })).toBe(true);
    expect(isNeurologyModule({ code: "neuro_dev", moduleType: "custom" })).toBe(true);
    expect(isNeurologyModule({ code: "orthopedics", moduleType: "orthopedics" })).toBe(false);
  });
});

describe("сборка data осмотра", () => {
  it("пустое не пишется", () => {
    const form = emptyExamForm("neurologist");
    form.tone = emptyTone();
    form.head = { shape: null, fontanelle: { a: null, b: null, state: null, closedOn: null }, smallFontanelle: null, sutures: null };
    expect(buildExamData(form, "female")).toEqual({ neuroKind: "exam", examType: "neurologist" });
    expect(examHasContent(form)).toBe(false);
  });

  it("поля конструктора «Заключение» и «Рекомендации» заполняются", () => {
    const form = emptyExamForm("neurologist");
    form.tone = { ...emptyTone(), state: "dystonia", symmetry: "equal", score: 2 };
    form.conclusions = ["dystonia_syndrome"];
    form.recommendationCodes = ["tummy", "massage"];
    form.recommendationNote = "контроль через 2 мес ";
    const data = buildExamData(form, "female");
    expect(data.tone).toEqual({ state: "dystonia", symmetry: "equal", score: 2 });
    expect(data.conclusion).toBe("Синдром мышечной дистонии (P94.8)");
    expect(data.recommendation).toBe("Выкладывание на живот несколько раз в день. Массаж, курс. контроль через 2 мес");
    expect(data.recommendationNote).toBe("контроль через 2 мес");
    expect(examHasContent(form)).toBe(true);
  });

  it("заключение по полу и со своим текстом", () => {
    expect(composeConclusion(["healthy"], "", "female")).toBe("Неврологически здорова (Z00.1)");
    expect(composeConclusion(["healthy"], "", "male")).toBe("Неврологически здоров (Z00.1)");
    expect(composeConclusion(["speech_delay"], " ОНР II уровня", null)).toBe("Задержка речевого развития (ЗРР) (F80.1); ОНР II уровня");
  });

  it("рекомендации — в порядке каталога", () => {
    expect(composeRecommendation(["screens", "dev_care"], "")).toBe(
      "Уход в целях развития: читать, разговаривать, играть каждый день. Без экранов до 2 лет, в 2–4 года — не больше 1 ч в день",
    );
  });

  it("вехи, рефлексы и вложенные блоки: только заполненное", () => {
    const form = emptyExamForm("neurologist");
    form.milestones = { walks_alone: { state: "no", since: null, reported: true } };
    form.reflexes = { moro: { state: "present", side: "D" }, galant: { state: "asym", side: "S" } };
    form.motor = { paresis: "none", paresisSide: "D", involuntary: [], gait: null, coordination: { fingerNose: null, romberg: null, clumsy: false }, torticollis: false, posture: null };
    form.cranial = { eyes: "equal", strabismus: null, nystagmus: null, sunset: false, face: null, hearing: null, sucking: null, cry: null, tongue: null };
    form.meningeal = false;
    form.enuresis = false;
    form.studies = [
      { kind: "nsg", on: "2025-04-26", result: "normal", note: "" },
      { kind: "eeg", on: null, result: null, note: " " },
    ];
    const data = buildExamData(form, null);
    expect(data.milestones).toEqual({ walks_alone: { state: "no", reported: true } });
    expect(data.reflexes).toEqual({ moro: { state: "present" }, galant: { state: "asym", side: "S" } });
    expect(data.motor).toEqual({ paresis: "none" });
    expect(data.cranial).toEqual({ eyes: "equal" });
    expect(data.meningeal).toBe(false);
    expect(data.enuresis).toBe(false);
    expect(data.studies).toEqual([{ kind: "nsg", on: "2025-04-26", result: "normal" }]);
  });

  it("чужие ключи прежней записи сохраняются при правке, свои пустые — убираются", () => {
    const old = { neuroKind: "exam", examType: "neurologist", clinicField: "из конструктора", sleep: { hours: 13 }, extra: { nested: true } };
    const form = examToForm(readExam(record(old)));
    form.sleep = null;
    form.screens = "none";
    const data = buildExamData(form, null, old);
    expect(data).toEqual({ neuroKind: "exam", examType: "neurologist", clinicField: "из конструктора", extra: { nested: true }, screens: "none" });
  });

  it("чтение и сборка сходятся", () => {
    const data = {
      neuroKind: "exam",
      examType: "neurologist",
      complaints: ["sleep", "startle"],
      milestones: { fixes_gaze: { state: "yes", since: "2025-04-26", reported: true } },
      tone: { state: "dystonia", symmetry: "equal", score: 2 },
      reflexes: { moro: { state: "present" } },
      head: { fontanelle: { a: 2.5, b: 2.5, state: "normal" } },
      motor: { involuntary: ["tremor_cry"] },
      sleep: { hours: 16 },
      conclusions: ["dystonia_syndrome"],
      conclusion: "Синдром мышечной дистонии (P94.8)",
      recommendationCodes: ["massage"],
      recommendation: "Массаж, курс",
      nextCheckMonths: 2,
    };
    const form = examToForm(readExam(record(data)));
    expect(buildExamData(form, "female", data)).toEqual(data);
  });

  it("старая запись общей формы: текст заключения и рекомендации — своими", () => {
    const exam = readExam(record({ conclusion: "Перинатальное поражение ЦНС", recommendation: "Массаж" }));
    expect(exam.structured).toBe(false);
    expect(exam.conclusionNote).toBe("Перинатальное поражение ЦНС");
    expect(exam.recommendationNote).toBe("Массаж");
    const data = buildExamData(examToForm(exam), null, exam.record.data);
    expect(data.conclusion).toBe("Перинатальное поражение ЦНС");
    expect(data.recommendation).toBe("Массаж");
  });
});

describe("речь и заключения", () => {
  it("пункт с кодом сразу добавляется в заключения, снятый — убирает своё", () => {
    const added = toggleSpeech({ speech: [], conclusions: ["healthy"] }, "zrr");
    expect(added).toEqual({ speech: ["zrr"], conclusions: ["speech_delay"] });
    expect(toggleSpeech(added, "zrr")).toEqual({ speech: [], conclusions: [] });
    expect(toggleSpeech({ speech: ["zrr"], conclusions: ["speech_delay"] }, "normal")).toEqual({ speech: ["normal"], conclusions: [] });
    expect(toggleSpeech({ speech: ["zrr", "alalia_motor"], conclusions: ["speech_delay", "alalia_motor"] }, "zrr")).toEqual({
      speech: ["alalia_motor"],
      conclusions: ["alalia_motor"],
    });
  });

  it("в диагнозы предлагаются заключения, которых нет среди действующих, кроме Z00.1 и Z03.3", () => {
    const active = readDiagnosis(record({ neuroKind: "diagnosis", diagnosis: "speech_delay", state: "observation" }));
    const resolved = readDiagnosis(record({ neuroKind: "diagnosis", diagnosis: "dystonia_syndrome", state: "resolved" }));
    expect(diagnosisSuggestions(["healthy", "suspected", "speech_delay", "dystonia_syndrome", "dyslalia"], [active, resolved])).toEqual([
      "dystonia_syndrome",
      "dyslalia",
    ]);
  });
});

describe("следующий осмотр", () => {
  const at = dayjs("2026-10-04T11:30:00");

  it("через N месяцев, в 10:00", () => {
    const form = { ...emptyExamForm(), nextCheckMonths: 6 };
    expect(plannedCheckAt(form, at, "2025-03-26")?.format("YYYY-MM-DD HH:mm")).toBe("2027-04-04 10:00");
  });

  it("к сроку по 211н: дата рождения + ближайший возраст осмотра невролога, в 10:00", () => {
    const form = { ...emptyExamForm(), nextCheckByOrder: true };
    expect(plannedCheckAt(form, at, "2025-03-26")?.format("YYYY-MM-DD HH:mm")).toBe("2028-03-26 10:00");
    expect(plannedCheckAt({ ...form, questionnaire: "positive" }, dayjs("2026-04-12T11:00:00"), "2025-03-26")?.format("YYYY-MM-DD")).toBe("2026-09-26");
    expect(plannedCheckAt(form, at, null)).toBeNull();
  });

  it("«к сроку по 211н» пишется флагом, без месяцев", () => {
    const data = buildExamData({ ...emptyExamForm(), nextCheckByOrder: true, nextCheckMonths: 6, complaints: ["none"] }, null);
    expect(data.nextCheckByOrder).toBe(true);
    expect(data.nextCheckMonths).toBeUndefined();
  });
});

describe("разбор записей раздела", () => {
  it("делит по виду и статусу; плановые — любые", () => {
    const records = [
      record({ neuroKind: "exam", examType: "neurologist" }, { occurredAt: "2025-05-05T08:00:00Z" }),
      record({ neuroKind: "exam" }, { status: "planned", occurredAt: "2026-10-12T04:00:00Z" }),
      record({ neuroKind: "milestones", milestones: { walks_alone: { state: "yes", since: "2026-06-26" } } }, { occurredAt: "2026-07-01T04:00:00Z" }),
      record({ neuroKind: "diagnosis", diagnosis: "dystonia_syndrome", icd: "P94.8", state: "resolved", resolvedOn: "2025-06-26" }),
      record({ conclusion: "старая запись" }, { occurredAt: "2024-12-01T04:00:00Z" }),
      record({ neuroKind: "exam" }, { status: "missed", occurredAt: "2026-01-01T04:00:00Z" }),
    ];
    const sorted = classifyNeuroRecords(records);
    expect(sorted.exams.map((item) => item.record.occurredAt)).toEqual(["2026-01-01T04:00:00Z", "2025-05-05T08:00:00Z", "2024-12-01T04:00:00Z"]);
    expect(sorted.planned).toHaveLength(1);
    expect(sorted.milestoneRecords).toHaveLength(1);
    expect(sorted.diagnoses[0]).toMatchObject({ diagnosis: "dystonia_syndrome", icd: "P94.8", state: "resolved", resolvedOn: "2025-06-26" });
  });

  it("в картину вех идут только выполненные записи; запись, которую правят, — не идёт", () => {
    const done = record({ neuroKind: "milestones", milestones: { sits: { state: "yes", since: null } } });
    const planned = record({ neuroKind: "exam", milestones: { sits: { state: "no" } } }, { status: "planned" });
    const missed = record({ neuroKind: "exam", milestones: { sits: { state: "no" } } }, { status: "missed" });
    const sorted = classifyNeuroRecords([done, planned, missed]);
    expect(markSources(sorted).map((item) => item.recordId)).toEqual([done.id]);
    expect(markSources(sorted, done.id)).toEqual([]);
  });
});

describe("блоки полного осмотра", () => {
  it("по возрасту: рефлексы до года, речь с года, энурез и головная боль с 3 лет", () => {
    expect(blocksForAge(1)).toEqual(expect.arrayContaining(["reflexes", "head", "npr"]));
    expect(blocksForAge(1)).not.toContain("speech");
    expect(blocksForAge(18)).toEqual(expect.arrayContaining(["speech", "head"]));
    expect(blocksForAge(18)).not.toContain("reflexes");
    expect(blocksForAge(30, true)).not.toContain("head");
    expect(blocksForAge(30, false)).toContain("head");
    expect(blocksForAge(40)).toContain("enuresis");
    expect(blocksForAge(40)).not.toContain("npr");
    expect(blocksForAge(60)).toContain("npr");
    expect(allowedBlocks(15)).toContain("reflexes");
    expect(allowedBlocks(19)).not.toContain("reflexes");
  });

  it("быстрый тонус и родничок не раскрывают полный осмотр", () => {
    const form = emptyExamForm();
    form.tone = { ...emptyTone(), state: "normal", symmetry: "asym" };
    form.head = { shape: null, fontanelle: { a: 1, b: 1, state: "normal", closedOn: null }, smallFontanelle: null, sutures: null };
    expect(hasFullExam(form)).toBe(false);
    form.tone = { ...emptyTone(), state: "dystonia" };
    expect(filledBlocks(form)).toEqual(["tone"]);
    expect(hasFullExam(form)).toBe(true);
  });
});

describe("диагноз", () => {
  it("код — по варианту; сторона и дата снятия — когда есть", () => {
    const form = emptyDiagnosisForm({ diagnosis: "ivh", variant: "deg2", side: "", state: "resolved", resolvedOn: "2025-08-01" });
    expect(buildDiagnosisData(form)).toEqual({
      neuroKind: "diagnosis",
      diagnosis: "ivh",
      icd: "P52.1",
      variant: "deg2",
      state: "resolved",
      dispensary: false,
      resolvedOn: "2025-08-01",
    });
    expect(diagnosisTitle(form, null)).toBe("Внутрижелудочковое кровоизлияние, степень 2");
  });

  it("«Другой» — название и код вручную", () => {
    const form = emptyDiagnosisForm({ diagnosis: "other", customLabel: "Умственная отсталость лёгкая", icd: "f70.0" });
    expect(diagnosisValid(form)).toBe(true);
    expect(buildDiagnosisData(form)).toMatchObject({ diagnosis: "other", icd: "F70.0" });
    expect(diagnosisTitle(form, null)).toBe("Умственная отсталость лёгкая");
    expect(diagnosisValid({ ...form, customLabel: " " })).toBe(false);
  });

  it("эпилепсия: G40.9 по умолчанию, врач уточняет код", () => {
    const form = emptyDiagnosisForm({ diagnosis: "epilepsy" });
    expect(form.icd).toBe("G40.9");
    expect(buildDiagnosisData({ ...form, icd: "g40.3" })).toMatchObject({ icd: "G40.3" });
  });

  it("чужие ключи диагноза сохраняются", () => {
    const old = { neuroKind: "diagnosis", diagnosis: "tremor", icd: "R25.1", state: "observation", clinicNote: "x" };
    expect(buildDiagnosisData(emptyDiagnosisForm({ diagnosis: "tremor" }), old)).toMatchObject({ clinicNote: "x", icd: "R25.1" });
  });
});

describe("отметка вех", () => {
  it("в запись — только изменённые вехи", () => {
    const initial = { sits: { state: "yes" as const, since: "2025-09-26", reported: true } };
    const marks = {
      sits: { state: "yes" as const, since: "2025-09-26", reported: true },
      walks_alone: { state: "no" as const, since: null, reported: true },
    };
    expect(changedMarks(marks, initial)).toEqual({ walks_alone: marks.walks_alone });
    expect(buildMilestonesData(changedMarks(marks, initial), { neuroKind: "milestones", foreign: 1 })).toEqual({
      foreign: 1,
      neuroKind: "milestones",
      milestones: { walks_alone: { state: "no", reported: true } },
    });
  });

  it("«не помню» хранится как since: null", () => {
    const form = emptyExamForm();
    form.milestones = { sits: { state: "yes", since: null, reported: false } };
    expect(buildExamData(form, null).milestones).toEqual({ sits: { state: "yes", since: null, reported: false } });
  });
});
