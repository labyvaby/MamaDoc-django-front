import dayjs from "dayjs";

import type { EffectiveProgramModule, ProgramModuleRecord } from "../../../api/programs";
import {
  ALIGNMENTS,
  CORRECTIONS,
  DEGREES,
  DIAGNOSIS_STATES,
  EXAM_TYPES,
  EYE_COLORS,
  EYES,
  RECOMMENDATIONS,
  diagnosisDef,
  optionLabel,
  type AlignmentKind,
  type Correction,
  type DiagnosisState,
  type Eye,
  type ExamType,
  type EyeColor,
} from "./visionCatalog";
import { parseAcuity } from "./visionNorms";

/**
 * Записи раздела «Зрение» (ТЗ «Зрение» §2): осмотры, хронические диагнозы и
 * запланированные осмотры — общие записи модуля; различаются по
 * `data.visionKind` и статусу. Здесь чтение, формы и сборка `data`.
 */

export function isVisionModule(module: Pick<EffectiveProgramModule, "code" | "moduleType">): boolean {
  const key = `${module.code} ${module.moduleType}`.toLowerCase();
  return ["vision", "ophthalm", "eye"].some((part) => key.includes(part));
}

export interface RefractionEye {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
}

export interface Refraction {
  cycloplegia: boolean;
  right: RefractionEye;
  left: RefractionEye;
}

export interface VisionExam {
  record: ProgramModuleRecord;
  examType: ExamType | null;
  complaints: string[];
  acuityRight: string;
  acuityLeft: string;
  acuityRightCorrected: string;
  acuityLeftCorrected: string;
  correction: Correction | null;
  refraction: Refraction | null;
  alignment: { kind: AlignmentKind | null; angle: number | null; nystagmus: boolean } | null;
  binocular: string | null;
  colorVision: string | null;
  anteriorSegment: string;
  fundus: string;
  iop: { normal: boolean; right: number | null; left: number | null } | null;
  axialLength: { right: number | null; left: number | null } | null;
  conclusions: string[];
  recommendationCodes: string[];
  recommendationNote: string;
  recommendation: string;
  nextCheckMonths: number | null;
  eyeColor: EyeColor | null;
}

export interface VisionDiagnosis {
  record: ProgramModuleRecord;
  diagnosis: string;
  label: string;
  icd: string;
  eye: Eye | null;
  degree: string | null;
  subtype: string | null;
  cylinder: number | null;
  axis: number | null;
  dispensary: boolean;
  state: DiagnosisState;
  resolvedOn: string | null;
}

export interface VisionRecords {
  /** Проведённые и пропущенные осмотры, от новых к старым. */
  exams: VisionExam[];
  /** Действующие диагнозы, потом снятые; внутри — от новых к старым. */
  diagnoses: VisionDiagnosis[];
  /** Запланированные осмотры, ближайший первым. */
  planned: ProgramModuleRecord[];
}

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function pick<T extends string>(options: ReadonlyArray<{ value: T }>, value: unknown): T | null {
  return options.find((option) => option.value === value)?.value ?? null;
}

function readRefractionEye(value: unknown): RefractionEye {
  const eye = asObject(value) ?? {};
  return { sph: asNumber(eye.sph), cyl: asNumber(eye.cyl), axis: asNumber(eye.axis) };
}

export function readExam(record: ProgramModuleRecord): VisionExam {
  const data = record.data;
  const refraction = asObject(data.refraction);
  const alignment = asObject(data.alignment);
  const iop = asObject(data.iop);
  const axial = asObject(data.axialLength);
  return {
    record,
    examType: pick(EXAM_TYPES, data.examType),
    complaints: asList(data.complaints),
    acuityRight: asText(data.visualAcuityRight),
    acuityLeft: asText(data.visualAcuityLeft),
    acuityRightCorrected: asText(data.acuityRightCorrected),
    acuityLeftCorrected: asText(data.acuityLeftCorrected),
    correction: pick(CORRECTIONS, data.correction),
    refraction: refraction
      ? {
          cycloplegia: refraction.cycloplegia === true,
          right: readRefractionEye(refraction.right),
          left: readRefractionEye(refraction.left),
        }
      : null,
    alignment: alignment
      ? {
          kind: pick(ALIGNMENTS, alignment.kind),
          angle: asNumber(alignment.angle),
          nystagmus: alignment.nystagmus === true,
        }
      : null,
    binocular: asText(data.binocular) || null,
    colorVision: asText(data.colorVision) || null,
    anteriorSegment: asText(data.anteriorSegment),
    fundus: asText(data.fundus),
    iop: iop ? { normal: iop.normal === true, right: asNumber(iop.right), left: asNumber(iop.left) } : null,
    axialLength: axial ? { right: asNumber(axial.right), left: asNumber(axial.left) } : null,
    conclusions: asList(data.conclusions),
    recommendationCodes: asList(data.recommendationCodes),
    recommendationNote: asText(data.recommendationNote),
    recommendation: asText(data.recommendation),
    nextCheckMonths: asNumber(data.nextCheckMonths),
    eyeColor: pick(EYE_COLORS, data.eyeColor),
  };
}

export function readDiagnosis(record: ProgramModuleRecord): VisionDiagnosis {
  const data = record.data;
  const code = asText(data.diagnosis) || "other";
  const def = diagnosisDef(code);
  return {
    record,
    diagnosis: code,
    label: record.title || def?.label || "Диагноз",
    icd: asText(data.icd) || def?.icd || "",
    eye: pick(EYES, data.eye),
    degree: asText(data.degree) || null,
    subtype: asText(data.subtype) || null,
    cylinder: asNumber(data.cylinder),
    axis: asNumber(data.axis),
    dispensary: data.dispensary === true,
    state: pick(DIAGNOSIS_STATES, data.state) ?? "observation",
    resolvedOn: asText(data.resolvedOn) || null,
  };
}

const time = (record: ProgramModuleRecord): number => dayjs(record.occurredAt).valueOf();

export function classifyVisionRecords(records: ReadonlyArray<ProgramModuleRecord>): VisionRecords {
  const exams: VisionExam[] = [];
  const diagnoses: VisionDiagnosis[] = [];
  const planned: ProgramModuleRecord[] = [];
  for (const record of records) {
    if (record.data.visionKind === "diagnosis") diagnoses.push(readDiagnosis(record));
    else if (record.status === "planned") planned.push(record);
    else exams.push(readExam(record));
  }
  exams.sort((a, b) => time(b.record) - time(a.record));
  diagnoses.sort(
    (a, b) =>
      Number(a.state === "resolved") - Number(b.state === "resolved") || time(b.record) - time(a.record),
  );
  planned.sort((a, b) => time(a) - time(b));
  return { exams, diagnoses, planned };
}

/** Выбор, исключающий остальные: «Норма» в заключении, «Нет жалоб» в жалобах. */
export function toggleExclusive(list: ReadonlyArray<string>, value: string, exclusive: string): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (value === exclusive) return [exclusive];
  return [...list.filter((item) => item !== exclusive), value];
}

/** Число из поля: «−1,25», «-1.25», «+0,5» → число; пусто и мусор → null. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace("−", "-").replace(",", ".").replace(/^\+/, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** −1.25 → «−1,25», 0.5 → «+0,50». */
export function formatDiopter(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2).replace(".", ",")}`;
}

/** «sph −1,50 · cyl −0,75 × 180°»; без сферы и цилиндра — пусто. */
export function refractionLine(eye: RefractionEye | null): string {
  if (!eye) return "";
  const parts: string[] = [];
  if (eye.sph != null) parts.push(`sph ${formatDiopter(eye.sph)}`);
  if (eye.cyl != null && eye.cyl !== 0) {
    parts.push(`cyl ${formatDiopter(eye.cyl)}${eye.axis != null ? ` × ${eye.axis}°` : ""}`);
  }
  return parts.join(" · ");
}

export interface RefractionInput {
  sph: string;
  cyl: string;
  axis: string;
}

export interface ExamForm {
  examType: ExamType;
  title: string;
  acuityRight: string;
  acuityLeft: string;
  acuityRightCorrected: string;
  acuityLeftCorrected: string;
  correction: Correction | "";
  conclusions: string[];
  recommendationCodes: string[];
  recommendationNote: string;
  nextCheckMonths: number | null;
  eyeColor: EyeColor | "";
  complaints: string[];
  cycloplegia: boolean;
  refractionRight: RefractionInput;
  refractionLeft: RefractionInput;
  alignmentKind: AlignmentKind | "";
  alignmentAngle: number | null;
  nystagmus: boolean;
  binocular: string;
  colorVision: string;
  anteriorNormal: boolean;
  anteriorText: string;
  fundusNormal: boolean;
  fundusText: string;
  iopNormal: boolean;
  iopRight: string;
  iopLeft: string;
  axialRight: string;
  axialLeft: string;
  notes: string;
}

export function examTitle(type: ExamType): string {
  return EXAM_TYPES.find((item) => item.value === type)?.title ?? "Осмотр зрения";
}

export function emptyExamForm(examType: ExamType = "preventive"): ExamForm {
  return {
    examType,
    title: examTitle(examType),
    acuityRight: "",
    acuityLeft: "",
    acuityRightCorrected: "",
    acuityLeftCorrected: "",
    correction: "",
    conclusions: [],
    recommendationCodes: [],
    recommendationNote: "",
    nextCheckMonths: null,
    eyeColor: "",
    complaints: [],
    cycloplegia: false,
    refractionRight: { sph: "", cyl: "", axis: "" },
    refractionLeft: { sph: "", cyl: "", axis: "" },
    alignmentKind: "",
    alignmentAngle: null,
    nystagmus: false,
    binocular: "",
    colorVision: "",
    anteriorNormal: false,
    anteriorText: "",
    fundusNormal: false,
    fundusText: "",
    iopNormal: false,
    iopRight: "",
    iopLeft: "",
    axialRight: "",
    axialLeft: "",
    notes: "",
  };
}

const numText = (value: number | null | undefined): string => (value == null ? "" : String(value));

function eyeInput(eye: RefractionEye | undefined): RefractionInput {
  return { sph: numText(eye?.sph), cyl: numText(eye?.cyl), axis: numText(eye?.axis) };
}

export function examToForm(exam: VisionExam): ExamForm {
  // Старые записи общей формы: рекомендация — просто текст.
  const note =
    exam.recommendationCodes.length || exam.recommendationNote ? exam.recommendationNote : exam.recommendation;
  return {
    examType: exam.examType ?? "preventive",
    title: exam.record.title,
    acuityRight: exam.acuityRight,
    acuityLeft: exam.acuityLeft,
    acuityRightCorrected: exam.acuityRightCorrected,
    acuityLeftCorrected: exam.acuityLeftCorrected,
    correction: exam.correction ?? "",
    conclusions: exam.conclusions,
    recommendationCodes: exam.recommendationCodes,
    recommendationNote: note,
    nextCheckMonths: exam.nextCheckMonths,
    eyeColor: exam.eyeColor ?? "",
    complaints: exam.complaints,
    cycloplegia: exam.refraction?.cycloplegia ?? false,
    refractionRight: eyeInput(exam.refraction?.right),
    refractionLeft: eyeInput(exam.refraction?.left),
    alignmentKind: exam.alignment?.kind ?? "",
    alignmentAngle: exam.alignment?.angle ?? null,
    nystagmus: exam.alignment?.nystagmus ?? false,
    binocular: exam.binocular ?? "",
    colorVision: exam.colorVision ?? "",
    anteriorNormal: exam.anteriorSegment === "normal",
    anteriorText: exam.anteriorSegment === "normal" ? "" : exam.anteriorSegment,
    fundusNormal: exam.fundus === "normal",
    fundusText: exam.fundus === "normal" ? "" : exam.fundus,
    iopNormal: exam.iop?.normal ?? false,
    iopRight: numText(exam.iop?.right),
    iopLeft: numText(exam.iop?.left),
    axialRight: numText(exam.axialLength?.right),
    axialLeft: numText(exam.axialLength?.left),
    notes: exam.record.notes,
  };
}

function refractionEye(input: RefractionInput): RefractionEye {
  const axis = parseNumber(input.axis);
  return {
    sph: parseNumber(input.sph),
    cyl: parseNumber(input.cyl),
    axis: axis == null ? null : Math.round(Math.min(180, Math.max(0, axis))),
  };
}

const hasRefraction = (eye: RefractionEye): boolean => eye.sph != null || eye.cyl != null || eye.axis != null;

/** Фразы выбранных шаблонов и своя рекомендация — через точку. */
export function composeRecommendation(codes: ReadonlyArray<string>, note: string): string {
  const texts = RECOMMENDATIONS.filter((item) => codes.includes(item.value)).map((item) => item.text);
  return [...texts, note.trim()].filter(Boolean).join(". ");
}

/** `data` осмотра: пустое не пишется, прежние ключи конструктора сохраняются. */
export function buildExamData(form: ExamForm): Record<string, unknown> {
  const data: Record<string, unknown> = { visionKind: "exam", examType: form.examType };
  const put = (key: string, value: unknown) => {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return;
    data[key] = value;
  };
  put("visualAcuityRight", form.acuityRight.trim());
  put("visualAcuityLeft", form.acuityLeft.trim());
  put("acuityRightCorrected", form.acuityRightCorrected.trim());
  put("acuityLeftCorrected", form.acuityLeftCorrected.trim());
  put("correction", form.correction);
  put("complaints", form.complaints);
  put("eyeColor", form.eyeColor);
  const right = refractionEye(form.refractionRight);
  const left = refractionEye(form.refractionLeft);
  if (hasRefraction(right) || hasRefraction(left)) data.refraction = { cycloplegia: form.cycloplegia, right, left };
  if (form.alignmentKind || form.nystagmus) {
    data.alignment = {
      kind: form.alignmentKind || null,
      angle: form.alignmentKind && form.alignmentKind !== "ortho" ? form.alignmentAngle : null,
      nystagmus: form.nystagmus,
    };
  }
  put("binocular", form.binocular);
  put("colorVision", form.colorVision);
  put("anteriorSegment", form.anteriorNormal ? "normal" : form.anteriorText.trim());
  put("fundus", form.fundusNormal ? "normal" : form.fundusText.trim());
  const iopRight = parseNumber(form.iopRight);
  const iopLeft = parseNumber(form.iopLeft);
  if (form.iopNormal || iopRight != null || iopLeft != null) {
    data.iop = { normal: form.iopNormal, right: iopRight, left: iopLeft };
  }
  const axialRight = parseNumber(form.axialRight);
  const axialLeft = parseNumber(form.axialLeft);
  if (axialRight != null || axialLeft != null) data.axialLength = { right: axialRight, left: axialLeft };
  put("conclusions", form.conclusions);
  put("recommendationCodes", form.recommendationCodes);
  put("recommendationNote", form.recommendationNote.trim());
  put("recommendation", composeRecommendation(form.recommendationCodes, form.recommendationNote));
  put("nextCheckMonths", form.nextCheckMonths);
  return data;
}

const SERVICE_KEYS = new Set(["visionKind", "examType", "nextCheckMonths"]);
const FULL_EXAM_KEYS = [
  "complaints",
  "acuityRightCorrected",
  "acuityLeftCorrected",
  "refraction",
  "alignment",
  "binocular",
  "colorVision",
  "anteriorSegment",
  "fundus",
  "iop",
  "axialLength",
];

/** Есть что сохранить: острота, заключение, рекомендация или поле полного осмотра. */
export function examHasContent(form: ExamForm): boolean {
  return Object.keys(buildExamData(form)).some((key) => !SERVICE_KEYS.has(key));
}

/** Полный осмотр заполнен — при правке раскрыть его сразу. */
export function hasFullExam(form: ExamForm): boolean {
  const data = buildExamData(form);
  return FULL_EXAM_KEYS.some((key) => key in data);
}

export interface ChronicSuggestion {
  diagnosis: string;
  eye: Eye;
  cylinder: number | null;
  axis: number | null;
}

/** На какой глаз заключение — по рефракции и остроте осмотра, иначе оба. */
function guessEye(code: string, form: ExamForm): Eye {
  const right = refractionEye(form.refractionRight);
  const left = refractionEye(form.refractionLeft);
  const choose = (r: boolean, l: boolean): Eye => (r === l ? "OU" : r ? "OD" : "OS");
  if (code === "astigmatism") return choose(Boolean(right.cyl), Boolean(left.cyl));
  if (code === "myopia") return choose((right.sph ?? 0) < 0, (left.sph ?? 0) < 0);
  if (code === "hyperopia") return choose((right.sph ?? 0) > 0, (left.sph ?? 0) > 0);
  if (code === "amblyopia") {
    const r = parseAcuity(form.acuityRight);
    const l = parseAcuity(form.acuityLeft);
    if (r != null && l != null && r !== l) return r < l ? "OD" : "OS";
  }
  return "OU";
}

/** Заключения осмотра, которых нет среди действующих хронических диагнозов. */
export function chronicSuggestions(form: ExamForm, diagnoses: ReadonlyArray<VisionDiagnosis>): ChronicSuggestion[] {
  const known = new Set(diagnoses.filter((item) => item.state !== "resolved").map((item) => item.diagnosis));
  return form.conclusions
    .filter((code) => !known.has(code) && diagnosisDef(code) && !diagnosisDef(code)?.conclusionOnly)
    .map((code) => {
      const eye = guessEye(code, form);
      const astigmatic = code === "astigmatism" && eye !== "OU";
      const source = refractionEye(eye === "OS" ? form.refractionLeft : form.refractionRight);
      return {
        diagnosis: code,
        eye,
        cylinder: astigmatic ? source.cyl : null,
        axis: astigmatic ? source.axis : null,
      };
    });
}

export interface DiagnosisForm {
  diagnosis: string;
  customLabel: string;
  icd: string;
  eye: Eye | "";
  degree: string;
  subtype: string;
  cylinder: string;
  axis: string;
  dispensary: boolean;
  state: DiagnosisState;
  /** YYYY-MM-DD. */
  resolvedOn: string;
  notes: string;
}

export function emptyDiagnosisForm(preset: Partial<DiagnosisForm> = {}): DiagnosisForm {
  return {
    diagnosis: "",
    customLabel: "",
    icd: "",
    eye: "",
    degree: "",
    subtype: "",
    cylinder: "",
    axis: "",
    dispensary: false,
    state: "observation",
    resolvedOn: "",
    notes: "",
    ...preset,
  };
}

export function diagnosisToForm(item: VisionDiagnosis): DiagnosisForm {
  return emptyDiagnosisForm({
    diagnosis: item.diagnosis,
    customLabel: item.diagnosis === "other" ? item.label : "",
    icd: item.icd,
    eye: item.eye ?? "",
    degree: item.degree ?? "",
    subtype: item.subtype ?? "",
    cylinder: numText(item.cylinder),
    axis: numText(item.axis),
    dispensary: item.dispensary,
    state: item.state,
    resolvedOn: item.resolvedOn ?? "",
    notes: item.record.notes,
  });
}

/** «Амблиопия рефракционная слабой степени», «Астигматизм миопический простой». */
export function diagnosisTitle(form: Pick<DiagnosisForm, "diagnosis" | "customLabel" | "degree" | "subtype">): string {
  const def = diagnosisDef(form.diagnosis);
  const base = form.diagnosis === "other" ? form.customLabel.trim() : def?.label ?? "";
  const subtype = def?.subtypes?.find((item) => item.value === form.subtype)?.label ?? "";
  const degree = def?.degrees ? optionLabel(DEGREES, form.degree) : "";
  return [base, subtype, degree].filter(Boolean).join(" ");
}

export function buildDiagnosisData(form: DiagnosisForm): Record<string, unknown> {
  const def = diagnosisDef(form.diagnosis);
  const data: Record<string, unknown> = {
    visionKind: "diagnosis",
    diagnosis: form.diagnosis,
    icd: (form.diagnosis === "other" ? form.icd : def?.icd ?? form.icd).trim(),
    state: form.state,
    dispensary: form.dispensary,
  };
  if (form.eye) data.eye = form.eye;
  if (def?.degrees && form.degree) data.degree = form.degree;
  if (def?.subtypes && form.subtype) data.subtype = form.subtype;
  if (form.diagnosis === "astigmatism") {
    const cylinder = parseNumber(form.cylinder);
    const axis = parseNumber(form.axis);
    if (cylinder != null) data.cylinder = cylinder;
    if (axis != null) data.axis = Math.round(Math.min(180, Math.max(0, axis)));
  }
  if (form.state === "resolved" && form.resolvedOn) data.resolvedOn = form.resolvedOn;
  return data;
}

export function diagnosisFromSuggestion(suggestion: ChronicSuggestion): DiagnosisForm {
  return emptyDiagnosisForm({
    diagnosis: suggestion.diagnosis,
    eye: suggestion.eye,
    cylinder: numText(suggestion.cylinder),
    axis: numText(suggestion.axis),
  });
}

export function diagnosisValid(form: DiagnosisForm): boolean {
  if (!form.diagnosis) return false;
  return form.diagnosis !== "other" || form.customLabel.trim() !== "";
}
