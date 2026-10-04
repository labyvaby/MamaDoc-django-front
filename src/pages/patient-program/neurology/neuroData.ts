import dayjs, { type Dayjs } from "dayjs";

import type { EffectiveProgramModule, ProgramModuleRecord } from "../../../api/programs";
import { toggleExclusive } from "../vision/visionData";
import {
  CLONUS,
  DIAGNOSES,
  DIAGNOSIS_STATES,
  EXAM_TYPES,
  FONTANELLE_STATES,
  HEALTHY,
  PARESIS,
  QUESTIONNAIRE,
  RECOMMENDATIONS,
  SCREENS,
  SPEECH,
  SYMMETRY_WORDS,
  TENDON_LEVELS,
  TONE_PATTERNS,
  TONE_STATES,
  diagnosisDef,
  diagnosisIcd,
  gendered,
  type BodySide,
  type Clonus,
  type DiagnosisState,
  type ExamType,
  type FontanelleState,
  type Paresis,
  type Questionnaire,
  type Screens,
  type Sex,
  type StudyResult,
  type Symmetry,
  type TendonLevel,
  type TonePart,
  type TonePattern,
  type ToneState,
} from "./neuroCatalog";
import { cleanMarks, readMarks, type MarkSource, type MilestoneMark } from "./neuroMilestones";
import { nextOrderCheck } from "./neuroNorms";

/**
 * Записи раздела «Неврология и развитие» (ТЗ §2): осмотры, отметки вех,
 * диагнозы и плановые осмотры — общие записи модуля, различаются по
 * `data.neuroKind` и статусу. Здесь разбор записей, формы окон и сборка `data`.
 */

export function isNeurologyModule(module: Pick<EffectiveProgramModule, "code" | "moduleType">): boolean {
  return `${module.code} ${module.moduleType}`.toLowerCase().includes("neuro");
}

// ── Данные осмотра ───────────────────────────────────────────────────────────

export interface ToneData {
  state: ToneState | null;
  symmetry: Symmetry | null;
  parts: TonePart[];
  pattern: TonePattern | null;
  score: number | null;
}

export type ReflexState = "present" | "absent" | "asym" | "obligatory";

export interface ReflexMark {
  state: ReflexState;
  /** Где слабее — у асимметрии. */
  side: BodySide | null;
}

export interface TendonData {
  level: TendonLevel | null;
  symmetry: Symmetry | null;
}

export interface CranialData {
  eyes: string | null;
  strabismus: string | null;
  nystagmus: string | null;
  sunset: boolean;
  face: string | null;
  hearing: string | null;
  sucking: string | null;
  cry: string | null;
  tongue: string | null;
}

export interface FontanelleData {
  a: number | null;
  b: number | null;
  state: FontanelleState | null;
  /** ГГГГ-ММ-ДД — когда закрылся. */
  closedOn: string | null;
}

export interface HeadData {
  shape: string | null;
  fontanelle: FontanelleData | null;
  smallFontanelle: string | null;
  sutures: string | null;
}

export interface CoordinationData {
  fingerNose: string | null;
  romberg: string | null;
  clumsy: boolean;
}

export interface MotorData {
  paresis: Paresis | null;
  paresisSide: BodySide | null;
  involuntary: string[];
  gait: string | null;
  coordination: CoordinationData | null;
  torticollis: boolean;
  posture: string | null;
}

export interface DevAge {
  cognitive: number | null;
  motor: number | null;
  speech: number | null;
}

export interface PsycheData {
  babble: string | null;
  understanding: string | null;
  activeSpeech: string | null;
  /** Нарушения есть (true), нет (false), не оценивали (null). */
  communication: boolean | null;
  emotional: boolean | null;
  cognitive: boolean | null;
  sensory: string | null;
  devAge: DevAge | null;
  contact: string | null;
  mood: string | null;
  intellect: string | null;
  cognitiveDisorders: boolean | null;
  learningDisorders: boolean | null;
  behavior: string[];
}

export interface NprData {
  zhurba: number | null;
  group: number | null;
  spheres: Partial<Record<string, "norm" | "deviation">> | null;
}

export interface SleepData {
  hours: number | null;
  problems: string[];
}

export interface SeizuresData {
  kinds: string[];
  lastOn: string | null;
  frequency: string;
}

export interface HeadacheData {
  kind: string | null;
  frequency: string | null;
}

export interface StudyData {
  kind: string;
  on: string | null;
  result: StudyResult | null;
  note: string;
}

export interface NeuroExamBody {
  examType: ExamType;
  complaints: string[];
  milestones: Record<string, MilestoneMark>;
  tone: ToneData | null;
  reflexes: Record<string, ReflexMark>;
  tendon: TendonData | null;
  clonus: Clonus | null;
  babinski: { right: boolean; left: boolean } | null;
  meningeal: boolean | null;
  cranial: CranialData | null;
  head: HeadData | null;
  motor: MotorData | null;
  psyche: PsycheData | null;
  questionnaire: Questionnaire | null;
  speech: string[];
  onrLevel: number | null;
  npr: NprData | null;
  sleep: SleepData | null;
  screens: Screens | null;
  seizures: SeizuresData | null;
  enuresis: boolean | null;
  headache: HeadacheData | null;
  studies: StudyData[];
  redFlags: string[];
  conclusions: string[];
  /** Своё заключение словами; у старых записей — их текст «Заключение». */
  conclusionNote: string;
  recommendationCodes: string[];
  recommendationNote: string;
  nextCheckMonths: number | null;
  nextCheckByOrder: boolean;
}

export interface NeuroExam extends NeuroExamBody {
  record: ProgramModuleRecord;
  /** Поля конструктора — итоговый текст заключения и рекомендаций. */
  conclusion: string;
  recommendation: string;
  /** Запись создана окном раздела (иначе — общей формой конструктора). */
  structured: boolean;
}

export interface MilestoneRecord {
  record: ProgramModuleRecord;
  marks: Record<string, MilestoneMark>;
}

export interface NeuroDiagnosis {
  record: ProgramModuleRecord;
  diagnosis: string;
  label: string;
  icd: string;
  variant: string | null;
  side: "D" | "S" | "both" | null;
  dispensary: boolean;
  state: DiagnosisState;
  resolvedOn: string | null;
}

export interface NeuroRecords {
  /** Осмотры, от новых к старым (в том числе пропущенные). */
  exams: NeuroExam[];
  /** Записи «Отметка вех развития», от новых к старым. */
  milestoneRecords: MilestoneRecord[];
  /** Диагнозы: действующие сверху. */
  diagnoses: NeuroDiagnosis[];
  /** Плановые записи, ближайшая первой. */
  planned: ProgramModuleRecord[];
}

// ── Чтение ───────────────────────────────────────────────────────────────────

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asBool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const asList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const asDate = (value: unknown): string | null => (typeof value === "string" && dayjs(value).isValid() ? value : null);
const asCode = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function pick<T extends string | number>(options: ReadonlyArray<{ value: T }>, value: unknown): T | null {
  return options.find((option) => option.value === value)?.value ?? null;
}

const SYMMETRIES: ReadonlyArray<{ value: Symmetry }> = (Object.keys(SYMMETRY_WORDS) as Symmetry[]).map((value) => ({ value }));
const SIDE_VALUES: ReadonlyArray<{ value: BodySide }> = [{ value: "D" }, { value: "S" }];
const REFLEX_VALUES: ReadonlyArray<{ value: ReflexState }> = [{ value: "present" }, { value: "absent" }, { value: "asym" }, { value: "obligatory" }];
const PARTS: ReadonlyArray<{ value: TonePart }> = [{ value: "arms" }, { value: "legs" }, { value: "trunk" }, { value: "neck" }];
const RESULTS: ReadonlyArray<{ value: StudyResult }> = [{ value: "normal" }, { value: "abnormal" }, { value: "above3x" }];

function readTone(value: unknown): ToneData | null {
  const tone = asObject(value);
  if (!tone) return null;
  return {
    state: pick(TONE_STATES, tone.state),
    symmetry: pick(SYMMETRIES, tone.symmetry),
    parts: asList(tone.parts).filter((part): part is TonePart => PARTS.some((item) => item.value === part)),
    pattern: pick(TONE_PATTERNS, tone.pattern),
    score: asNumber(tone.score),
  };
}

function readReflexes(value: unknown): Record<string, ReflexMark> {
  const out: Record<string, ReflexMark> = {};
  for (const [code, raw] of Object.entries(asObject(value) ?? {})) {
    const mark = asObject(raw);
    const state = mark ? pick(REFLEX_VALUES, mark.state) : null;
    if (mark && state) out[code] = { state, side: pick(SIDE_VALUES, mark.side) };
  }
  return out;
}

function readCranial(value: unknown): CranialData | null {
  const cranial = asObject(value);
  if (!cranial) return null;
  return {
    eyes: asCode(cranial.eyes),
    strabismus: asCode(cranial.strabismus),
    nystagmus: asCode(cranial.nystagmus),
    sunset: cranial.sunset === true,
    face: asCode(cranial.face),
    hearing: asCode(cranial.hearing),
    sucking: asCode(cranial.sucking),
    cry: asCode(cranial.cry),
    tongue: asCode(cranial.tongue),
  };
}

function readHead(value: unknown): HeadData | null {
  const head = asObject(value);
  if (!head) return null;
  const f = asObject(head.fontanelle);
  return {
    shape: asCode(head.shape),
    fontanelle: f ? { a: asNumber(f.a), b: asNumber(f.b), state: pick(FONTANELLE_STATES, f.state), closedOn: asDate(f.closedOn) } : null,
    smallFontanelle: asCode(head.smallFontanelle),
    sutures: asCode(head.sutures),
  };
}

function readMotor(value: unknown): MotorData | null {
  const motor = asObject(value);
  if (!motor) return null;
  const coordination = asObject(motor.coordination);
  return {
    paresis: pick(PARESIS, motor.paresis),
    paresisSide: pick(SIDE_VALUES, motor.paresisSide),
    involuntary: asList(motor.involuntary),
    gait: asCode(motor.gait),
    coordination: coordination
      ? { fingerNose: asCode(coordination.fingerNose), romberg: asCode(coordination.romberg), clumsy: coordination.clumsy === true }
      : null,
    torticollis: motor.torticollis === true,
    posture: asCode(motor.posture),
  };
}

function readPsyche(value: unknown): PsycheData | null {
  const psyche = asObject(value);
  if (!psyche) return null;
  const dev = asObject(psyche.devAge);
  return {
    babble: asCode(psyche.babble),
    understanding: asCode(psyche.understanding),
    activeSpeech: asCode(psyche.activeSpeech),
    communication: asBool(psyche.communication),
    emotional: asBool(psyche.emotional),
    cognitive: asBool(psyche.cognitive),
    sensory: asCode(psyche.sensory),
    devAge: dev ? { cognitive: asNumber(dev.cognitive), motor: asNumber(dev.motor), speech: asNumber(dev.speech) } : null,
    contact: asCode(psyche.contact),
    mood: asCode(psyche.mood),
    intellect: asCode(psyche.intellect),
    cognitiveDisorders: asBool(psyche.cognitiveDisorders),
    learningDisorders: asBool(psyche.learningDisorders),
    behavior: asList(psyche.behavior),
  };
}

function readNpr(value: unknown): NprData | null {
  const npr = asObject(value);
  if (!npr) return null;
  const spheres = asObject(npr.spheres);
  const grades: Partial<Record<string, "norm" | "deviation">> = {};
  for (const [key, grade] of Object.entries(spheres ?? {})) {
    if (grade === "norm" || grade === "deviation") grades[key] = grade;
  }
  return { zhurba: asNumber(npr.zhurba), group: asNumber(npr.group), spheres: spheres ? grades : null };
}

function readStudies(value: unknown): StudyData[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => item != null && asText(item.kind) !== "")
    .map((item) => ({ kind: asText(item.kind), on: asDate(item.on), result: pick(RESULTS, item.result), note: asText(item.note) }));
}

export function readExam(record: ProgramModuleRecord): NeuroExam {
  const data = record.data;
  const sleep = asObject(data.sleep);
  const seizures = asObject(data.seizures);
  const headache = asObject(data.headache);
  const babinski = asObject(data.babinski);
  const tendon = asObject(data.tendon);
  const structured = data.neuroKind === "exam";
  const conclusions = asList(data.conclusions);
  const recommendationCodes = asList(data.recommendationCodes);
  const conclusion = asText(data.conclusion);
  const recommendation = asText(data.recommendation);
  return {
    record,
    structured,
    conclusion,
    recommendation,
    examType: pick(EXAM_TYPES, data.examType) ?? "neurologist",
    complaints: asList(data.complaints),
    milestones: readMarks(data.milestones),
    tone: readTone(data.tone),
    reflexes: readReflexes(data.reflexes),
    tendon: tendon ? { level: pick(TENDON_LEVELS, tendon.level), symmetry: pick(SYMMETRIES, tendon.symmetry) } : null,
    clonus: pick(CLONUS, data.clonus),
    babinski: babinski ? { right: babinski.right === true, left: babinski.left === true } : null,
    meningeal: asBool(data.meningeal),
    cranial: readCranial(data.cranial),
    head: readHead(data.head),
    motor: readMotor(data.motor),
    psyche: readPsyche(data.psyche),
    questionnaire: pick(QUESTIONNAIRE, data.questionnaire),
    speech: asList(data.speech),
    onrLevel: asNumber(data.onrLevel),
    npr: readNpr(data.npr),
    sleep: sleep ? { hours: asNumber(sleep.hours), problems: asList(sleep.problems) } : null,
    screens: pick(SCREENS, data.screens),
    seizures: seizures ? { kinds: asList(seizures.kinds), lastOn: asDate(seizures.lastOn), frequency: asText(seizures.frequency) } : null,
    enuresis: asBool(data.enuresis),
    headache: headache ? { kind: asCode(headache.kind), frequency: asCode(headache.frequency) } : null,
    studies: readStudies(data.studies),
    redFlags: asList(data.redFlags),
    conclusions,
    // Старые записи общей формы: текст заключения — своим заключением.
    conclusionNote: asText(data.conclusionNote) || (!conclusions.length && !structured ? conclusion : ""),
    recommendationCodes,
    recommendationNote: asText(data.recommendationNote) || (!recommendationCodes.length && !structured ? recommendation : ""),
    nextCheckMonths: asNumber(data.nextCheckMonths),
    nextCheckByOrder: data.nextCheckByOrder === true,
  };
}

export function readDiagnosis(record: ProgramModuleRecord): NeuroDiagnosis {
  const data = record.data;
  const code = asText(data.diagnosis) || "other";
  const def = diagnosisDef(code);
  const variant = asCode(data.variant);
  const side = data.side === "D" || data.side === "S" || data.side === "both" ? data.side : null;
  return {
    record,
    diagnosis: code,
    label: record.title || def?.label || "Диагноз",
    icd: asText(data.icd) || (def ? diagnosisIcd(code, variant) : ""),
    variant,
    side,
    dispensary: data.dispensary === true,
    state: pick(DIAGNOSIS_STATES, data.state) ?? "observation",
    resolvedOn: asDate(data.resolvedOn),
  };
}

const time = (value: string): number => dayjs(value).valueOf();

export function classifyNeuroRecords(records: ReadonlyArray<ProgramModuleRecord>): NeuroRecords {
  const exams: NeuroExam[] = [];
  const milestoneRecords: MilestoneRecord[] = [];
  const diagnoses: NeuroDiagnosis[] = [];
  const planned: ProgramModuleRecord[] = [];
  for (const record of records) {
    if (record.status === "planned") planned.push(record);
    else if (record.data.neuroKind === "diagnosis") diagnoses.push(readDiagnosis(record));
    else if (record.data.neuroKind === "milestones") milestoneRecords.push({ record, marks: readMarks(record.data.milestones) });
    else exams.push(readExam(record));
  }
  const newest = (a: { record: ProgramModuleRecord }, b: { record: ProgramModuleRecord }) =>
    time(b.record.occurredAt) - time(a.record.occurredAt) || time(b.record.createdAt) - time(a.record.createdAt);
  exams.sort(newest);
  milestoneRecords.sort(newest);
  diagnoses.sort((a, b) => Number(a.state === "resolved") - Number(b.state === "resolved") || time(b.record.occurredAt) - time(a.record.occurredAt));
  planned.sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
  return { exams, milestoneRecords, diagnoses, planned };
}

/** Осмотры с отметками рефлексов — для вкладки «Рефлексы». */
export function reflexExams(exams: ReadonlyArray<NeuroExam>): NeuroExam[] {
  return exams.filter((exam) => Object.keys(exam.reflexes).length > 0);
}

/** Проведённый осмотр: плановые и пропущенные в оценках не участвуют. */
export const isDone = (record: ProgramModuleRecord): boolean => record.status === "completed";

/** Источники картины вех: осмотры и отметки вех со статусом «выполнено»; `exceptId` — запись, которую сейчас правят. */
export function markSources(records: NeuroRecords, exceptId: number | null = null): MarkSource[] {
  const sources: MarkSource[] = [];
  const add = (record: ProgramModuleRecord, marks: Record<string, MilestoneMark>) => {
    if (record.id === exceptId || !isDone(record) || !Object.keys(marks).length) return;
    sources.push({ recordId: record.id, at: record.occurredAt, createdAt: record.createdAt, marks });
  };
  for (const exam of records.exams) add(exam.record, exam.milestones);
  for (const item of records.milestoneRecords) add(item.record, item.marks);
  return sources;
}

// ── Форма осмотра ────────────────────────────────────────────────────────────

export interface NeuroExamForm extends NeuroExamBody {
  title: string;
  notes: string;
}

export function examTitle(type: ExamType): string {
  return EXAM_TYPES.find((item) => item.value === type)?.title ?? "Осмотр невролога";
}

export function emptyExamForm(examType: ExamType = "neurologist"): NeuroExamForm {
  return {
    examType,
    title: examTitle(examType),
    complaints: [],
    milestones: {},
    tone: null,
    reflexes: {},
    tendon: null,
    clonus: null,
    babinski: null,
    meningeal: null,
    cranial: null,
    head: null,
    motor: null,
    psyche: null,
    questionnaire: null,
    speech: [],
    onrLevel: null,
    npr: null,
    sleep: null,
    screens: null,
    seizures: null,
    enuresis: null,
    headache: null,
    studies: [],
    redFlags: [],
    conclusions: [],
    conclusionNote: "",
    recommendationCodes: [],
    recommendationNote: "",
    nextCheckMonths: null,
    nextCheckByOrder: false,
    notes: "",
  };
}

export function examToForm(exam: NeuroExam): NeuroExamForm {
  const form = emptyExamForm(exam.examType) as unknown as Record<string, unknown>;
  for (const key of Object.keys(form)) {
    if (key in exam) form[key] = exam[key as keyof NeuroExamBody];
  }
  return { ...(form as unknown as NeuroExamForm), title: exam.record.title, notes: exam.record.notes };
}

export const emptyTone = (): ToneData => ({ state: null, symmetry: null, parts: [], pattern: null, score: null });
export const emptyFontanelle = (): FontanelleData => ({ a: null, b: null, state: null, closedOn: null });
export const emptyHead = (): HeadData => ({ shape: null, fontanelle: null, smallFontanelle: null, sutures: null });
export const emptyCranial = (): CranialData => ({
  eyes: null,
  strabismus: null,
  nystagmus: null,
  sunset: false,
  face: null,
  hearing: null,
  sucking: null,
  cry: null,
  tongue: null,
});
export const emptyMotor = (): MotorData => ({
  paresis: null,
  paresisSide: null,
  involuntary: [],
  gait: null,
  coordination: null,
  torticollis: false,
  posture: null,
});
export const emptyPsyche = (): PsycheData => ({
  babble: null,
  understanding: null,
  activeSpeech: null,
  communication: null,
  emotional: null,
  cognitive: null,
  sensory: null,
  devAge: null,
  contact: null,
  mood: null,
  intellect: null,
  cognitiveDisorders: null,
  learningDisorders: null,
  behavior: [],
});
export const emptyNpr = (): NprData => ({ zhurba: null, group: null, spheres: null });
export const emptySleep = (): SleepData => ({ hours: null, problems: [] });
export const emptySeizures = (): SeizuresData => ({ kinds: [], lastOn: null, frequency: "" });

// ── Сборка data ──────────────────────────────────────────────────────────────

type Plain = Record<string, unknown>;

/** Убирает пустое: null, "", [], {} — на любой глубине. */
function compact(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object") {
    const out: Plain = {};
    for (const [key, item] of Object.entries(value as Plain)) {
      const clean = compact(item);
      if (clean !== undefined) out[key] = clean;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function cleanTone(tone: ToneData | null): unknown {
  if (!tone) return undefined;
  return compact({ ...tone, pattern: tone.state === "high" ? tone.pattern : null });
}

function cleanReflexes(reflexes: Readonly<Record<string, ReflexMark>>): unknown {
  const out: Plain = {};
  for (const [code, mark] of Object.entries(reflexes)) {
    out[code] = mark.state === "asym" && mark.side ? { state: mark.state, side: mark.side } : { state: mark.state };
  }
  return compact(out);
}

function cleanHead(head: HeadData | null): unknown {
  if (!head) return undefined;
  const f = head.fontanelle;
  return compact({ ...head, fontanelle: f ? { ...f, closedOn: f.state === "closed" ? f.closedOn : null } : null });
}

function cleanCranial(cranial: CranialData | null): unknown {
  if (!cranial) return undefined;
  return compact({ ...cranial, sunset: cranial.sunset || null });
}

function cleanMotor(motor: MotorData | null): unknown {
  if (!motor) return undefined;
  const coordination = motor.coordination ? { ...motor.coordination, clumsy: motor.coordination.clumsy || null } : null;
  return compact({
    ...motor,
    paresisSide: motor.paresis === "mono" || motor.paresis === "hemi" ? motor.paresisSide : null,
    coordination,
    torticollis: motor.torticollis || null,
  });
}

function cleanStudies(studies: ReadonlyArray<StudyData>): unknown {
  return compact(studies.filter((item) => item.on || item.result || item.note.trim()).map((item) => ({ ...item, note: item.note.trim() })));
}

/** «Синдром мышечной дистонии (P94.8)»; «Неврологически здорова (Z00.1)». */
export function conclusionLabel(code: string, sex: Sex): string {
  const def = diagnosisDef(code);
  if (!def) return "";
  return `${gendered(def.label, sex)} (${def.icd})`;
}

/** Заключение словами — поле конструктора «Заключение»: пункты с кодами и своё заключение. */
export function composeConclusion(codes: ReadonlyArray<string>, note: string, sex: Sex): string {
  return [...codes.map((code) => conclusionLabel(code, sex)), note.trim()].filter(Boolean).join("; ");
}

/** Фразы выбранных шаблонов и своя рекомендация — через точку. */
export function composeRecommendation(codes: ReadonlyArray<string>, note: string): string {
  const texts = RECOMMENDATIONS.filter((item) => codes.includes(item.value)).map((item) => item.text);
  return [...texts, note.trim()].filter(Boolean).join(". ");
}

/** Ключи `data`, которые раздел пишет сам; остальные (поля клиники) при правке сохраняются как были. */
const EXAM_KEYS = new Set([
  "neuroKind",
  "examType",
  "complaints",
  "milestones",
  "tone",
  "reflexes",
  "tendon",
  "clonus",
  "babinski",
  "meningeal",
  "cranial",
  "head",
  "motor",
  "psyche",
  "questionnaire",
  "speech",
  "onrLevel",
  "npr",
  "sleep",
  "screens",
  "seizures",
  "enuresis",
  "headache",
  "studies",
  "redFlags",
  "conclusions",
  "conclusion",
  "conclusionNote",
  "recommendationCodes",
  "recommendationNote",
  "recommendation",
  "nextCheckMonths",
  "nextCheckByOrder",
]);

/** Чужие ключи прежней `data` — их раздел не трогает. */
export function foreignKeys(previous: Plain | null | undefined, known: ReadonlySet<string>): Plain {
  const out: Plain = {};
  for (const [key, value] of Object.entries(previous ?? {})) {
    if (!known.has(key)) out[key] = value;
  }
  return out;
}

/** `data` осмотра: пустое не пишется, поля конструктора заполняются, чужие ключи прежней записи сохраняются. */
export function buildExamData(form: NeuroExamBody, sex: Sex, previous?: Plain | null): Plain {
  const data: Plain = { ...foreignKeys(previous, EXAM_KEYS), neuroKind: "exam", examType: form.examType };
  const put = (key: string, value: unknown) => {
    const clean = compact(value);
    if (clean !== undefined) data[key] = clean;
  };
  put("complaints", form.complaints);
  // Отметки — без чистки пустого: `since: null` у «есть» значит «не помню».
  if (Object.keys(form.milestones).length) data.milestones = cleanMarks(form.milestones);
  put("tone", cleanTone(form.tone));
  put("reflexes", cleanReflexes(form.reflexes));
  put("tendon", form.tendon);
  put("clonus", form.clonus);
  put("babinski", form.babinski && (form.babinski.right || form.babinski.left) ? form.babinski : null);
  if (form.meningeal != null) data.meningeal = form.meningeal;
  put("cranial", cleanCranial(form.cranial));
  put("head", cleanHead(form.head));
  put("motor", cleanMotor(form.motor));
  put("psyche", form.psyche);
  put("questionnaire", form.questionnaire);
  put("speech", form.speech);
  put("onrLevel", form.speech.includes("onr") ? form.onrLevel : null);
  put("npr", form.npr);
  put("sleep", form.sleep);
  put("screens", form.screens);
  put("seizures", form.seizures ? { ...form.seizures, frequency: form.seizures.frequency.trim() } : null);
  if (form.enuresis != null) data.enuresis = form.enuresis;
  put("headache", form.headache);
  put("studies", cleanStudies(form.studies));
  put("redFlags", form.redFlags);
  put("conclusions", form.conclusions);
  put("conclusionNote", form.conclusionNote.trim());
  put("conclusion", composeConclusion(form.conclusions, form.conclusionNote, sex));
  put("recommendationCodes", form.recommendationCodes);
  put("recommendationNote", form.recommendationNote.trim());
  put("recommendation", composeRecommendation(form.recommendationCodes, form.recommendationNote));
  put("nextCheckMonths", form.nextCheckByOrder ? null : form.nextCheckMonths);
  if (form.nextCheckByOrder) data.nextCheckByOrder = true;
  return data;
}

const SERVICE_KEYS = new Set(["neuroKind", "examType", "nextCheckMonths", "nextCheckByOrder"]);

/** Сохранить можно, если заполнено хоть что-то, кроме даты и вида. */
export function examHasContent(form: NeuroExamBody): boolean {
  return Object.keys(buildExamData(form, null)).some((key) => !SERVICE_KEYS.has(key));
}

/**
 * Дата планового осмотра (ТЗ §2.5): через N месяцев от осмотра или к
 * ближайшему сроку по 211н (паспортный возраст), в 10:00. Осмотр за две недели
 * до срока считается этим сроком: следующий — уже за ним.
 */
export function plannedCheckAt(form: NeuroExamBody, examAt: Dayjs, birthDate: string | null): Dayjs | null {
  const at10 = (value: Dayjs) => value.hour(10).minute(0).second(0).millisecond(0);
  if (form.nextCheckByOrder) {
    const next = nextOrderCheck(birthDate, examAt.format("YYYY-MM-DD"), {
      questionnairePositive: form.questionnaire === "positive",
      gapDays: 14,
    });
    return next ? at10(dayjs(next.date)) : null;
  }
  return form.nextCheckMonths ? at10(examAt.add(form.nextCheckMonths, "month")) : null;
}

export const PLANNED_DATA = { neuroKind: "exam", examType: "neurologist" } as const;

/** Выбор, исключающий остальные: «здоров(а)» в заключении, «нет жалоб» в жалобах. */
export { toggleExclusive };

/**
 * Заключение по речи: пункт с кодом МКБ-10 сразу добавляется в заключения
 * осмотра (его можно убрать), снятый пункт убирает и своё заключение.
 */
export function toggleSpeech(form: Pick<NeuroExamBody, "speech" | "conclusions">, code: string): Pick<NeuroExamBody, "speech" | "conclusions"> {
  const diagnosisOf = (item: string): string | undefined => SPEECH.find((entry) => entry.value === item)?.diagnosis;
  const adding = !form.speech.includes(code);
  // «Соответствует возрасту» исключает остальные пункты.
  const speech = adding ? toggleExclusive(form.speech, code, "normal") : form.speech.filter((item) => item !== code);
  const kept = new Set(speech.map(diagnosisOf));
  const dropped = form.speech
    .filter((item) => !speech.includes(item))
    .map(diagnosisOf)
    .filter((item): item is string => item != null && !kept.has(item));
  let conclusions = form.conclusions.filter((item) => !dropped.includes(item));
  const added = adding ? diagnosisOf(code) : undefined;
  if (added && !conclusions.includes(added)) conclusions = toggleExclusive(conclusions, added, HEALTHY);
  return { speech, conclusions };
}

// ── Блоки полного осмотра ────────────────────────────────────────────────────

export type FullBlock =
  | "complaints"
  | "tone"
  | "reflexes"
  | "tendon"
  | "cranial"
  | "head"
  | "motor"
  | "psyche"
  | "speech"
  | "npr"
  | "sleep"
  | "seizures"
  | "enuresis"
  | "studies";

export const ALL_BLOCKS: ReadonlyArray<FullBlock> = [
  "complaints",
  "tone",
  "reflexes",
  "tendon",
  "cranial",
  "head",
  "motor",
  "psyche",
  "speech",
  "npr",
  "sleep",
  "seizures",
  "enuresis",
  "studies",
];

/**
 * Блоки по возрасту на дату осмотра (ТЗ §5): рефлексы — до года, голова — до
 * 2 лет или пока родничок открыт, речь — с года, оценка НПР — до 3 лет и в
 * 4–6 лет, энурез и головная боль — с 3 лет. Без даты рождения — все.
 */
export function blocksForAge(age: number | null, fontanelleClosed = false): FullBlock[] {
  if (age == null) return [...ALL_BLOCKS];
  return ALL_BLOCKS.filter((block) => {
    if (block === "reflexes") return age < 12;
    if (block === "head") return age < 24 || !fontanelleClosed;
    if (block === "speech") return age >= 12;
    if (block === "npr") return age < 36 || (age >= 48 && age < 84);
    if (block === "enuresis") return age >= 36;
    return true;
  });
}

/** Что откроет «Все блоки»: безусловные рефлексы — только до 18 мес. */
export function allowedBlocks(age: number | null): FullBlock[] {
  return ALL_BLOCKS.filter((block) => block !== "reflexes" || age == null || age < 18);
}

/** Тонус, который записывается кнопками быстрого осмотра: норма, снижен, повышен, асимметрия. */
export function isQuickTone(tone: ToneData | null): boolean {
  if (!tone) return true;
  const quickState = tone.state == null || tone.state === "normal" || tone.state === "low" || tone.state === "high";
  const quickSymmetry = tone.symmetry == null || tone.symmetry === "equal" || tone.symmetry === "asym";
  return quickState && quickSymmetry && !tone.parts.length && !tone.pattern && tone.score == null;
}

/** Заполненные блоки полного осмотра (быстрые тонус и родничок не в счёт) — при правке они видны. */
export function filledBlocks(form: NeuroExamBody): FullBlock[] {
  const filled: FullBlock[] = [];
  if (form.complaints.length) filled.push("complaints");
  if (!isQuickTone(form.tone)) filled.push("tone");
  if (Object.keys(form.reflexes).length) filled.push("reflexes");
  if (compact(form.tendon) !== undefined || form.clonus || form.babinski?.left || form.babinski?.right || form.meningeal != null) {
    filled.push("tendon");
  }
  if (compact(cleanCranial(form.cranial)) !== undefined) filled.push("cranial");
  const head = form.head;
  if (head && (head.shape || head.smallFontanelle || head.sutures || head.fontanelle?.closedOn)) filled.push("head");
  if (compact(cleanMotor(form.motor)) !== undefined) filled.push("motor");
  if (compact(form.psyche) !== undefined || form.questionnaire) filled.push("psyche");
  if (form.speech.length) filled.push("speech");
  if (compact(form.npr) !== undefined) filled.push("npr");
  if (compact(form.sleep) !== undefined || form.screens) filled.push("sleep");
  if (compact(form.seizures) !== undefined) filled.push("seizures");
  if (form.enuresis != null || compact(form.headache) !== undefined) filled.push("enuresis");
  if (compact(cleanStudies(form.studies)) !== undefined) filled.push("studies");
  return filled;
}

/** В полном осмотре что-то заполнено — при правке он раскрыт. */
export function hasFullExam(form: NeuroExamBody): boolean {
  return filledBlocks(form).length > 0;
}

// ── Диагнозы ─────────────────────────────────────────────────────────────────

/** Заключения осмотра, которых нет среди действующих диагнозов (без Z00.1 и Z03.3). */
export function diagnosisSuggestions(conclusions: ReadonlyArray<string>, diagnoses: ReadonlyArray<NeuroDiagnosis>): string[] {
  const known = new Set(diagnoses.filter((item) => item.state !== "resolved").map((item) => item.diagnosis));
  return conclusions.filter((code) => {
    const def = diagnosisDef(code);
    return def != null && !def.conclusionOnly && !known.has(code);
  });
}

export interface DiagnosisForm {
  diagnosis: string;
  customLabel: string;
  icd: string;
  variant: string;
  side: "D" | "S" | "both" | "";
  dispensary: boolean;
  state: DiagnosisState;
  /** ГГГГ-ММ-ДД. */
  resolvedOn: string;
  notes: string;
}

export function emptyDiagnosisForm(preset: Partial<DiagnosisForm> = {}): DiagnosisForm {
  const def = diagnosisDef(preset.diagnosis);
  return {
    diagnosis: "",
    customLabel: "",
    icd: def?.icd ?? "",
    variant: def?.variants?.[0]?.value ?? "",
    side: "",
    dispensary: false,
    state: "observation",
    resolvedOn: "",
    notes: "",
    ...preset,
  };
}

export function diagnosisToForm(item: NeuroDiagnosis): DiagnosisForm {
  return emptyDiagnosisForm({
    diagnosis: item.diagnosis,
    customLabel: item.diagnosis === "other" ? item.label : "",
    icd: item.icd,
    variant: item.variant ?? diagnosisDef(item.diagnosis)?.variants?.[0]?.value ?? "",
    side: item.side ?? "",
    dispensary: item.dispensary,
    state: item.state,
    resolvedOn: item.resolvedOn ?? "",
    notes: item.record.notes,
  });
}

/** Код диагноза из формы: «Другой» и уточняемые (G40) — как ввёл врач, с вариантами — по варианту. */
export function formIcd(form: DiagnosisForm): string {
  const def = diagnosisDef(form.diagnosis);
  if (!def || def.refine) return form.icd.trim().toUpperCase();
  return diagnosisIcd(form.diagnosis, form.variant);
}

/** Название записи: «Внутрижелудочковое кровоизлияние, степень 2»; у «Другого» — как ввёл врач. */
export function diagnosisTitle(form: Pick<DiagnosisForm, "diagnosis" | "customLabel" | "variant">, sex: Sex): string {
  if (form.diagnosis === "other") return form.customLabel.trim();
  const def = diagnosisDef(form.diagnosis);
  if (!def) return "";
  const variant = def.variants?.find((item) => item.value === form.variant);
  const label = gendered(def.label, sex);
  return variant && variant.value !== "unspecified" ? `${label}, ${variant.label}` : label;
}

const DIAGNOSIS_KEYS = new Set(["neuroKind", "diagnosis", "icd", "variant", "side", "dispensary", "state", "resolvedOn"]);

export function buildDiagnosisData(form: DiagnosisForm, previous?: Plain | null): Plain {
  const def = diagnosisDef(form.diagnosis);
  const data: Plain = {
    ...foreignKeys(previous, DIAGNOSIS_KEYS),
    neuroKind: "diagnosis",
    diagnosis: form.diagnosis,
    icd: formIcd(form),
    state: form.state,
    dispensary: form.dispensary,
  };
  if (def?.variants && form.variant) data.variant = form.variant;
  if (form.side) data.side = form.side;
  if (form.state === "resolved" && form.resolvedOn) data.resolvedOn = form.resolvedOn;
  return data;
}

export function diagnosisValid(form: DiagnosisForm): boolean {
  if (!form.diagnosis) return false;
  if (form.diagnosis === "other") return form.customLabel.trim() !== "";
  return !diagnosisDef(form.diagnosis)?.refine || form.icd.trim() !== "";
}

/** Пункты каталога, которые можно поставить диагнозом (без «только заключение осмотра»). */
export const DIAGNOSIS_CHOICES = DIAGNOSES.filter((item) => !item.conclusionOnly);

// ── Отметка вех ──────────────────────────────────────────────────────────────

const MILESTONE_KEYS = new Set(["neuroKind", "milestones"]);

export function buildMilestonesData(marks: Readonly<Record<string, MilestoneMark>>, previous?: Plain | null): Plain {
  return { ...foreignKeys(previous, MILESTONE_KEYS), neuroKind: "milestones", milestones: cleanMarks(marks) };
}

/** Отметки, которые отличаются от исходных: в новую запись попадают только изменённые вехи. */
export function changedMarks(
  marks: Readonly<Record<string, MilestoneMark>>,
  initial: Readonly<Record<string, MilestoneMark>>,
): Record<string, MilestoneMark> {
  const out: Record<string, MilestoneMark> = {};
  for (const [code, mark] of Object.entries(marks)) {
    const before = initial[code];
    if (!before || before.state !== mark.state || before.since !== mark.since || before.reported !== mark.reported) out[code] = mark;
  }
  return out;
}
