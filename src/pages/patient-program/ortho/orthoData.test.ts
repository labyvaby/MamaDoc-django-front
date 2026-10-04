import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import {
  blocksForAge,
  buildDiagnosisData,
  buildExamData,
  chronicSuggestions,
  classifyOrthoRecords,
  composeRecommendation,
  conductedByToday,
  emptyDiagnosisForm,
  emptyExamForm,
  emptyFoot,
  emptyHips,
  emptySpine,
  examHasContent,
  examToForm,
  feetText,
  filledBlocks,
  isFutureExam,
  isOrthoModule,
  postureText,
  readDiagnosis,
  readExam,
  toggleExclusive,
} from "./orthoData";

let nextId = 1;
const record = (data: Record<string, unknown>, extra: Partial<ProgramModuleRecord> = {}): ProgramModuleRecord =>
  ({
    id: nextId++,
    title: "Осмотр ортопеда",
    occurredAt: "2026-10-02T10:00:00Z",
    status: "completed",
    notes: "",
    data,
    ...extra,
  }) as unknown as ProgramModuleRecord;

describe("isOrthoModule", () => {
  it("узнаёт раздел по коду или типу", () => {
    expect(isOrthoModule({ code: "orthopedics", moduleType: "orthopedics" })).toBe(true);
    expect(isOrthoModule({ code: "orthopedics", moduleType: "bone_examinations" })).toBe(true);
    expect(isOrthoModule({ code: "vision", moduleType: "ophthalmology" })).toBe(false);
  });
});

describe("сборка и чтение осмотра", () => {
  it("пустые блоки не пишутся, прежние ключи — сводкой", () => {
    const form = emptyExamForm("orthopedist");
    form.foot = { ...emptyFoot(), arch: { left: "flattened", right: "flattened" }, mobility: "mobile", heel: { left: 6, right: 12 } };
    form.spine = { ...emptySpine(), posture: "stooped", adams: { result: "rib", side: "R", atr: 5 } };
    form.hips = emptyHips();
    form.recommendationCodes = ["exerciseTherapy", "swimming"];
    form.recommendationNote = "Повтор через 6 мес";
    const data = buildExamData(form);
    expect(data).toMatchObject({
      orthoKind: "exam",
      examType: "orthopedist",
      foot: { arch: { left: "flattened", right: "flattened" }, mobility: "mobile", heel: { left: 6, right: 12 } },
      spine: { posture: "stooped", adams: { result: "rib", side: "R", atr: 5 } },
      posture: "Сутулая, ротация 5° справа",
      feet: "Свод уплощён, мобильная, без жалоб",
      recommendation: "ЛФК ежедневно. Плавание. Повтор через 6 мес",
    });
    expect(data).not.toHaveProperty("hips");
    expect(data).not.toHaveProperty("legs");
  });

  it("форма → data → чтение → форма сохраняет показатели", () => {
    const form = emptyExamForm("screening");
    form.hips = { ...emptyHips(), risks: ["girl", "breech"], us: { left: { alpha: 63, beta: 50, type: "" }, right: { alpha: 54, beta: 60, type: "IIa" } } };
    form.legs = { axis: "varus", distance: 2, symmetric: true, lengthDiff: { side: "L", cm: 1 }, gait: ["inToeing"] };
    form.conclusions = ["hipImmature"];
    const exam = readExam(record(buildExamData(form), { title: form.title }));
    const again = examToForm(exam);
    expect(again.hips).toEqual(form.hips);
    expect(again.legs).toEqual(form.legs);
    expect(again.examType).toBe("screening");
    expect(again.conclusions).toEqual(["hipImmature"]);
  });

  it("у прямых ног расстояние и асимметрия не пишутся", () => {
    const form = emptyExamForm();
    form.legs = { axis: "neutral", distance: 4, symmetric: false, lengthDiff: null, gait: [] };
    expect(buildExamData(form).legs).toEqual({ axis: "neutral" });
  });

  it("старая запись конструктора читается текстом", () => {
    const exam = readExam(record({ posture: "Сколиотическая", feet: "Плоскостопие", recommendation: "ЛФК" }));
    expect(exam.legacyPosture).toBe("Сколиотическая");
    expect(exam.legacyFeet).toBe("Плоскостопие");
    expect(exam.foot).toBeNull();
    expect(examToForm(exam).recommendationNote).toBe("ЛФК");
  });

  it("сохранять нечего — пустая форма", () => {
    expect(examHasContent(emptyExamForm())).toBe(false);
    const form = emptyExamForm();
    form.conclusions = ["normal"];
    expect(examHasContent(form)).toBe(true);
  });
});

describe("тексты для прежних полей", () => {
  it("стопы с разным сводом и жалобами", () => {
    expect(feetText({ ...emptyFoot(), arch: { left: "flat", right: "normal" }, complaints: true })).toBe(
      "Свод: левая плоский, правая норма, есть жалобы",
    );
    expect(feetText(null)).toBe("");
  });

  it("осанка без ротации, но с горбом", () => {
    expect(postureText({ ...emptySpine(), posture: "round", adams: { result: "lumbar", side: "L", atr: null } })).toBe(
      "Круглая, поясничный валик",
    );
  });
});

describe("записи раздела", () => {
  it("делит на осмотры, диагнозы и запланированные", () => {
    const records = [
      record({ orthoKind: "exam" }, { occurredAt: "2026-04-01T10:00:00Z" }),
      record({ orthoKind: "exam" }, { occurredAt: "2026-10-02T10:00:00Z" }),
      record({ orthoKind: "diagnosis", diagnosis: "planovalgus", state: "resolved" }),
      record({ orthoKind: "diagnosis", diagnosis: "scoliosisJuvenile" }),
      record({ orthoKind: "exam", examType: "control" }, { status: "planned", occurredAt: "2027-04-02T10:00:00Z" }),
    ];
    const result = classifyOrthoRecords(records);
    expect(result.exams.map((item) => item.record.occurredAt)).toEqual(["2026-10-02T10:00:00Z", "2026-04-01T10:00:00Z"]);
    expect(result.diagnoses.map((item) => item.diagnosis)).toEqual(["scoliosisJuvenile", "planovalgus"]);
    expect(result.planned).toHaveLength(1);
  });
});

describe("диагнозы", () => {
  it("код МКБ из каталога, у «другого» — свой", () => {
    expect(buildDiagnosisData(emptyDiagnosisForm({ diagnosis: "hipDysplasia", side: "R" }))).toEqual({
      orthoKind: "diagnosis",
      diagnosis: "hipDysplasia",
      icd: "Q65.8",
      state: "observation",
      dispensary: false,
      side: "R",
    });
    const other = buildDiagnosisData(emptyDiagnosisForm({ diagnosis: "other", customLabel: "Синдактилия", icd: "Q70.9" }));
    expect(other.icd).toBe("Q70.9");
    expect(readDiagnosis(record({ orthoKind: "diagnosis", diagnosis: "clubfoot" }, { title: "" })).label).toBe("Косолапость");
  });

  it("в хронические предлагаются только болезни, которых ещё нет", () => {
    const known = [readDiagnosis(record({ orthoKind: "diagnosis", diagnosis: "planovalgus" }))];
    expect(chronicSuggestions(["normal", "hipImmature", "planovalgus", "genuValgum"], known)).toEqual(["genuValgum"]);
  });
});

describe("рекомендации и выбор", () => {
  it("шаблоны и своя фраза через точку", () => {
    expect(composeRecommendation(["wideSwaddling", "usAt3Months"], "")).toBe(
      "Широкое пеленание. УЗИ тазобедренных суставов в 3 месяца",
    );
  });

  it("«Норма» исключает остальные заключения", () => {
    expect(toggleExclusive(["genuValgum"], "normal", "normal")).toEqual(["normal"]);
    expect(toggleExclusive(["normal"], "genuValgum", "normal")).toEqual(["genuValgum"]);
  });
});

describe("блоки окна по возрасту", () => {
  it("до года — суставы, шея, стопы; 1–3 года — стопы и ноги; дальше — спина", () => {
    expect(blocksForAge(1)).toEqual(["hips", "neck", "foot"]);
    expect(blocksForAge(18)).toEqual(["foot", "legs"]);
    expect(blocksForAge(72)).toEqual(["spine", "foot", "legs"]);
    expect(blocksForAge(null)).toHaveLength(6);
  });

  it("заполненные блоки видны при правке", () => {
    const form = emptyExamForm();
    form.hips = { ...emptyHips(), folds: true };
    form.beighton = 4;
    expect(filledBlocks(form)).toEqual(["hips", "other"]);
  });
});

describe("conductedByToday", () => {
  const now = dayjs("2026-10-05T12:00:00+06:00");
  it("запись с датой в будущем не становится последним осмотром", () => {
    const future = readExam(record({ posture: "фыв", feet: "фыв1" }, { occurredAt: "2026-10-11T08:05:04Z" }));
    const past = readExam(record({ orthoKind: "exam" }, { occurredAt: "2026-10-02T10:00:00Z" }));
    expect(isFutureExam(future.record, now)).toBe(true);
    expect(isFutureExam(past.record, now)).toBe(false);
    expect(conductedByToday([future, past], now)).toEqual([past]);
  });

  it("осмотр сегодня — не в будущем", () => {
    const today = readExam(record({ orthoKind: "exam" }, { occurredAt: "2026-10-05T17:30:00+06:00" }));
    expect(conductedByToday([today], now)).toEqual([today]);
  });

  it("если все записи в будущем — показывает их, а не пустоту", () => {
    const future = readExam(record({ orthoKind: "exam" }, { occurredAt: "2026-11-01T10:00:00Z" }));
    expect(conductedByToday([future], now)).toEqual([future]);
  });
});
