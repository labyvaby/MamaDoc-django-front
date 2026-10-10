import dayjs from "dayjs";

import type { EffectiveProgramModule, ProgramModuleRecord } from "../../../api/programs";
import {
  ADAMS,
  ARCHES,
  CHEST,
  CONCLUSIONS,
  DIAGNOSIS_STATES,
  EXAM_TYPES,
  LEG_AXES,
  MOBILITY,
  POSTURES,
  RECOMMENDATIONS,
  SIDES,
  SPLINTS,
  TORTICOLLIS,
  diagnosisDef,
  optionLabel,
  type AdamsResult,
  type ArchType,
  type ChestShape,
  type DiagnosisState,
  type ExamType,
  type FootMobility,
  type LegAxis,
  type OrthoBlock,
  type PostureType,
  type Side,
  type SplintKind,
  type TorticollisKind,
} from "./orthoCatalog";

/**
 * Записи раздела «Опорно-двигательная система» (ТЗ §2): осмотры, хронические
 * диагнозы и запланированные осмотры — общие записи модуля; различаются по
 * `data.orthoKind` и статусу. Здесь чтение, форма и сборка `data`.
 */

export function isOrthoModule(module: Pick<EffectiveProgramModule, "code" | "moduleType">): boolean {
  return `${module.code} ${module.moduleType}`.toLowerCase().includes("ortho");
}

export type BodySide = "L" | "R";

export interface HipUs {
  alpha: number | null;
  beta: number | null;
  /** Тип, который поставил врач; пусто — берётся подсказка по углам. */
  type: string;
}

export interface HipsData {
  risks: string[];
  abductionLimited: Side | null;
  ortolani: Side | null;
  barlow: Side | null;
  folds: boolean;
  shortening: Side | null;
  us: { left: HipUs; right: HipUs } | null;
  splint: { kind: SplintKind; since: string } | null;
}

export interface NeckData {
  torticollis: TorticollisKind | null;
  side: Side | null;
  rotationDiff: number | null;
  mass: boolean;
  plagiocephaly: boolean;
}

export interface Pair<T> {
  left: T;
  right: T;
}

export interface Finding {
  code: string;
  side: Side;
}

export interface FootData {
  arch: Pair<ArchType | null>;
  mobility: FootMobility | null;
  complaints: boolean;
  /** Угол пятки: плюс — вальгус, минус — варус. */
  heel: Pair<number | null>;
  findings: Finding[];
  chizhin: Pair<number | null>;
  fpi: Pair<number | null>;
}

export interface LegsData {
  axis: LegAxis | null;
  /** См: межмыщелковое при варусе, межлодыжечное при вальгусе. */
  distance: number | null;
  symmetric: boolean;
  lengthDiff: { side: BodySide; cm: number } | null;
  gait: string[];
}

export interface AdamsData {
  result: AdamsResult | null;
  side: BodySide | null;
  atr: number | null;
}

export interface SpineData {
  posture: PostureType | null;
  asymmetries: Finding[];
  /** Вопросы карты осанки с ответом «да»; null — карту не заполняли. */
  card: number[] | null;
  adams: AdamsData | null;
  cobb: number | null;
  risser: number | null;
  kyphosis: number | null;
}

export interface OrthoExamBody {
  examType: ExamType;
  hips: HipsData | null;
  neck: NeckData | null;
  foot: FootData | null;
  legs: LegsData | null;
  spine: SpineData | null;
  beighton: number | null;
  chest: ChestShape | null;
  redFlags: string[];
  conclusions: string[];
  recommendationCodes: string[];
  recommendationNote: string;
  nextCheckMonths: number | null;
}

export interface OrthoExam extends OrthoExamBody {
  record: ProgramModuleRecord;
  recommendation: string;
  /** Текст старых записей конструктора («Осанка», «Стопы»), если нового нет. */
  legacyPosture: string;
  legacyFeet: string;
}

export interface OrthoDiagnosis {
  record: ProgramModuleRecord;
  diagnosis: string;
  label: string;
  icd: string;
  side: Side | null;
  dispensary: boolean;
  state: DiagnosisState;
  resolvedOn: string | null;
}

export interface OrthoRecords {
  exams: OrthoExam[];
  diagnoses: OrthoDiagnosis[];
  planned: ProgramModuleRecord[];
}

// ── Чтение ───────────────────────────────────────────────────────────────────

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const asNumbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function pick<T extends string | number>(options: ReadonlyArray<{ value: T }>, value: unknown): T | null {
  return options.find((option) => option.value === value)?.value ?? null;
}

const pickSide = (value: unknown): Side | null => pick(SIDES, value);
const pickBodySide = (value: unknown): BodySide | null => (value === "L" || value === "R" ? value : null);

function readPair<T>(value: unknown, read: (item: unknown) => T): Pair<T> {
  const pair = asObject(value) ?? {};
  return { left: read(pair.left), right: read(pair.right) };
}

function readFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map((item) => ({ code: asText(item.code), side: pickSide(item.side) ?? "both" }))
    .filter((item) => item.code !== "");
}

function readHipUs(value: unknown): HipUs {
  const side = asObject(value) ?? {};
  return { alpha: asNumber(side.alpha), beta: asNumber(side.beta), type: asText(side.type) };
}

function readHips(value: unknown): HipsData | null {
  const hips = asObject(value);
  if (!hips) return null;
  const us = asObject(hips.us);
  const splint = asObject(hips.splint);
  const splintKind = splint ? pick(SPLINTS, splint.kind) : null;
  return {
    risks: asList(hips.risks),
    abductionLimited: pickSide(hips.abductionLimited),
    ortolani: pickSide(hips.ortolani),
    barlow: pickSide(hips.barlow),
    folds: hips.folds === true,
    shortening: pickSide(hips.shortening),
    us: us ? { left: readHipUs(us.left), right: readHipUs(us.right) } : null,
    splint: splint && splintKind ? { kind: splintKind, since: asText(splint.since) } : null,
  };
}

function readNeck(value: unknown): NeckData | null {
  const neck = asObject(value);
  if (!neck) return null;
  return {
    torticollis: pick(TORTICOLLIS, neck.torticollis),
    side: pickSide(neck.side),
    rotationDiff: asNumber(neck.rotationDiff),
    mass: neck.mass === true,
    plagiocephaly: neck.plagiocephaly === true,
  };
}

function readFoot(value: unknown): FootData | null {
  const foot = asObject(value);
  if (!foot) return null;
  return {
    arch: readPair(foot.arch, (item) => pick(ARCHES, item)),
    mobility: pick(MOBILITY, foot.mobility),
    complaints: foot.complaints === true,
    heel: readPair(foot.heel, asNumber),
    findings: readFindings(foot.findings),
    chizhin: readPair(foot.chizhin, asNumber),
    fpi: readPair(foot.fpi, asNumber),
  };
}

function readLegs(value: unknown): LegsData | null {
  const legs = asObject(value);
  if (!legs) return null;
  const diff = asObject(legs.lengthDiff);
  const diffSide = diff ? pickBodySide(diff.side) : null;
  const diffCm = diff ? asNumber(diff.cm) : null;
  return {
    axis: pick(LEG_AXES, legs.axis),
    distance: asNumber(legs.distance),
    symmetric: legs.symmetric !== false,
    lengthDiff: diffSide && diffCm != null ? { side: diffSide, cm: diffCm } : null,
    gait: asList(legs.gait),
  };
}

function readSpine(value: unknown): SpineData | null {
  const spine = asObject(value);
  if (!spine) return null;
  const adams = asObject(spine.adams);
  return {
    posture: pick(POSTURES, spine.posture),
    asymmetries: readFindings(spine.asymmetries),
    card: Array.isArray(spine.card) ? asNumbers(spine.card) : null,
    adams: adams
      ? { result: pick(ADAMS, adams.result), side: pickBodySide(adams.side), atr: asNumber(adams.atr) }
      : null,
    cobb: asNumber(spine.cobb),
    risser: asNumber(spine.risser),
    kyphosis: asNumber(spine.kyphosis),
  };
}

export function readExam(record: ProgramModuleRecord): OrthoExam {
  const data = record.data;
  // Старые записи конструктора: «Стопы» лежали строкой в `feet`, новые — объектом в `foot`.
  const structured = data.orthoKind === "exam";
  return {
    record,
    examType: pick(EXAM_TYPES, data.examType) ?? "orthopedist",
    hips: readHips(data.hips),
    neck: readNeck(data.neck),
    foot: readFoot(data.foot),
    legs: readLegs(data.legs),
    spine: readSpine(data.spine),
    beighton: asNumber(data.beighton),
    chest: pick(CHEST, data.chest),
    redFlags: asList(data.redFlags),
    conclusions: asList(data.conclusions),
    recommendationCodes: asList(data.recommendationCodes),
    recommendationNote: asText(data.recommendationNote),
    recommendation: asText(data.recommendation),
    nextCheckMonths: asNumber(data.nextCheckMonths),
    legacyPosture: structured ? "" : asText(data.posture),
    legacyFeet: structured ? "" : asText(data.feet),
  };
}

export function readDiagnosis(record: ProgramModuleRecord): OrthoDiagnosis {
  const data = record.data;
  const code = asText(data.diagnosis) || "other";
  const def = diagnosisDef(code);
  return {
    record,
    diagnosis: code,
    label: record.title || def?.label || "Диагноз",
    icd: asText(data.icd) || def?.icd || "",
    side: pickSide(data.side),
    dispensary: data.dispensary === true,
    state: pick(DIAGNOSIS_STATES, data.state) ?? "observation",
    resolvedOn: asText(data.resolvedOn) || null,
  };
}

const time = (record: ProgramModuleRecord): number => dayjs(record.occurredAt).valueOf();

/** Дата проведённого осмотра позже сегодняшнего дня — ошибка ввода. */
export const isFutureExam = (record: ProgramModuleRecord, now = dayjs()): boolean => time(record) > now.endOf("day").valueOf();

/**
 * Проведённые осмотры по сегодняшний день: запись с датой в будущем не
 * становится «последним осмотром» и не закрывает сроки. Если других нет —
 * показываем, что есть.
 */
export function conductedByToday(exams: ReadonlyArray<OrthoExam>, now = dayjs()): OrthoExam[] {
  const past = exams.filter((exam) => !isFutureExam(exam.record, now));
  return past.length ? past : [...exams];
}

export function classifyOrthoRecords(records: ReadonlyArray<ProgramModuleRecord>): OrthoRecords {
  const exams: OrthoExam[] = [];
  const diagnoses: OrthoDiagnosis[] = [];
  const planned: ProgramModuleRecord[] = [];
  for (const record of records) {
    if (record.data.orthoKind === "diagnosis") diagnoses.push(readDiagnosis(record));
    else if (record.status === "planned") planned.push(record);
    else exams.push(readExam(record));
  }
  exams.sort((a, b) => time(b.record) - time(a.record));
  diagnoses.sort(
    (a, b) => Number(a.state === "resolved") - Number(b.state === "resolved") || time(b.record) - time(a.record),
  );
  planned.sort((a, b) => time(a) - time(b));
  return { exams, diagnoses, planned };
}

// ── Пустые блоки ─────────────────────────────────────────────────────────────

export const emptyHips = (): HipsData => ({
  risks: [],
  abductionLimited: null,
  ortolani: null,
  barlow: null,
  folds: false,
  shortening: null,
  us: null,
  splint: null,
});

export const emptyNeck = (): NeckData => ({ torticollis: null, side: null, rotationDiff: null, mass: false, plagiocephaly: false });

export const emptyFoot = (): FootData => ({
  arch: { left: null, right: null },
  mobility: null,
  complaints: false,
  heel: { left: null, right: null },
  findings: [],
  chizhin: { left: null, right: null },
  fpi: { left: null, right: null },
});

export const emptyLegs = (): LegsData => ({ axis: null, distance: null, symmetric: true, lengthDiff: null, gait: [] });

export const emptySpine = (): SpineData => ({
  posture: null,
  asymmetries: [],
  card: null,
  adams: null,
  cobb: null,
  risser: null,
  kyphosis: null,
});

const pairEmpty = <T>(pair: Pair<T | null>): boolean => pair.left == null && pair.right == null;
const usEmpty = (us: HipsData["us"]): boolean =>
  !us || [us.left, us.right].every((side) => side.alpha == null && side.beta == null && !side.type);

export function hipsEmpty(hips: HipsData | null): boolean {
  return (
    !hips ||
    (!hips.risks.length &&
      !hips.abductionLimited &&
      !hips.ortolani &&
      !hips.barlow &&
      !hips.folds &&
      !hips.shortening &&
      usEmpty(hips.us) &&
      !hips.splint)
  );
}

export function neckEmpty(neck: NeckData | null): boolean {
  return !neck || (!neck.torticollis && !neck.side && neck.rotationDiff == null && !neck.mass && !neck.plagiocephaly);
}

export function footEmpty(foot: FootData | null): boolean {
  return (
    !foot ||
    (pairEmpty(foot.arch) &&
      !foot.mobility &&
      !foot.complaints &&
      pairEmpty(foot.heel) &&
      !foot.findings.length &&
      pairEmpty(foot.chizhin) &&
      pairEmpty(foot.fpi))
  );
}

export function legsEmpty(legs: LegsData | null): boolean {
  return !legs || (!legs.axis && legs.distance == null && !legs.lengthDiff && !legs.gait.length);
}

export function spineEmpty(spine: SpineData | null): boolean {
  const adams = spine?.adams;
  const adamsEmpty = !adams || (!adams.result && !adams.side && adams.atr == null);
  return (
    !spine ||
    (!spine.posture &&
      !spine.asymmetries.length &&
      spine.card == null &&
      adamsEmpty &&
      spine.cobb == null &&
      spine.risser == null &&
      spine.kyphosis == null)
  );
}

// ── Форма и сборка data ──────────────────────────────────────────────────────

export interface OrthoExamForm extends OrthoExamBody {
  title: string;
  notes: string;
}

export function examTitle(type: ExamType): string {
  return EXAM_TYPES.find((item) => item.value === type)?.title ?? "Осмотр ортопеда";
}

export function emptyExamForm(examType: ExamType = "orthopedist"): OrthoExamForm {
  return {
    examType,
    title: examTitle(examType),
    hips: null,
    neck: null,
    foot: null,
    legs: null,
    spine: null,
    beighton: null,
    chest: null,
    redFlags: [],
    conclusions: [],
    recommendationCodes: [],
    recommendationNote: "",
    nextCheckMonths: null,
    notes: "",
  };
}

export function examToForm(exam: OrthoExam): OrthoExamForm {
  // Старая запись: рекомендация — просто текст.
  const note =
    exam.recommendationCodes.length || exam.recommendationNote ? exam.recommendationNote : exam.recommendation;
  return {
    examType: exam.examType,
    title: exam.record.title,
    hips: exam.hips,
    neck: exam.neck,
    foot: exam.foot,
    legs: exam.legs,
    spine: exam.spine,
    beighton: exam.beighton,
    chest: exam.chest,
    redFlags: exam.redFlags,
    conclusions: exam.conclusions,
    recommendationCodes: exam.recommendationCodes,
    recommendationNote: note,
    nextCheckMonths: exam.nextCheckMonths,
    notes: exam.record.notes,
  };
}

/** Фразы выбранных шаблонов и своя рекомендация — через точку. */
export function composeRecommendation(codes: ReadonlyArray<string>, note: string): string {
  const texts = RECOMMENDATIONS.filter((item) => codes.includes(item.value)).map((item) => item.text);
  return [...texts, note.trim()].filter(Boolean).join(". ");
}

const SIDE_WORD: Record<BodySide, string> = { L: "слева", R: "справа" };

/** «Сутулая, ротация 5° справа» — осанка словами для прежнего поля «Осанка». */
export function postureText(spine: SpineData | null): string {
  if (!spine) return "";
  const parts: string[] = [];
  if (spine.posture) parts.push(optionLabel(POSTURES, spine.posture));
  const adams = spine.adams;
  if (adams?.atr != null) parts.push(`ротация ${adams.atr}°${adams.side ? ` ${SIDE_WORD[adams.side]}` : ""}`);
  else if (adams?.result && adams.result !== "negative") parts.push(optionLabel(ADAMS, adams.result).toLowerCase());
  if (spine.cobb != null) parts.push(`угол Кобба ${spine.cobb}°`);
  return parts.join(", ");
}

/** «Свод уплощён, мобильная, без жалоб» — стопы словами для прежнего поля «Стопы». */
export function feetText(foot: FootData | null): string {
  if (!foot) return "";
  const parts: string[] = [];
  const { left, right } = foot.arch;
  if (left || right) {
    const same = left === right;
    const word = (value: ArchType | null) => (value ? optionLabel(ARCHES, value).toLowerCase() : "—");
    parts.push(same ? `свод ${word(left)}` : `свод: левая ${word(left)}, правая ${word(right)}`);
  }
  if (foot.mobility) parts.push(foot.mobility === "mobile" ? "мобильная" : "ригидная");
  if (foot.complaints) parts.push("есть жалобы");
  else if (left || right) parts.push("без жалоб");
  const text = parts.join(", ");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function cleanPair<T>(pair: Pair<T | null>): Pair<T | null> | undefined {
  return pairEmpty(pair) ? undefined : pair;
}

function cleanHips(hips: HipsData | null): Record<string, unknown> | undefined {
  if (!hips || hipsEmpty(hips)) return undefined;
  const out: Record<string, unknown> = {};
  if (hips.risks.length) out.risks = hips.risks;
  if (hips.abductionLimited) out.abductionLimited = hips.abductionLimited;
  if (hips.ortolani) out.ortolani = hips.ortolani;
  if (hips.barlow) out.barlow = hips.barlow;
  if (hips.folds) out.folds = true;
  if (hips.shortening) out.shortening = hips.shortening;
  if (!usEmpty(hips.us) && hips.us) out.us = hips.us;
  if (hips.splint) out.splint = hips.splint;
  return out;
}

function cleanNeck(neck: NeckData | null): Record<string, unknown> | undefined {
  if (!neck || neckEmpty(neck)) return undefined;
  const out: Record<string, unknown> = {};
  if (neck.torticollis) out.torticollis = neck.torticollis;
  if (neck.side && neck.torticollis && neck.torticollis !== "none") out.side = neck.side;
  if (neck.rotationDiff != null && neck.torticollis && neck.torticollis !== "none") out.rotationDiff = neck.rotationDiff;
  if (neck.mass) out.mass = true;
  if (neck.plagiocephaly) out.plagiocephaly = true;
  return out;
}

function cleanFoot(foot: FootData | null): Record<string, unknown> | undefined {
  if (!foot || footEmpty(foot)) return undefined;
  const out: Record<string, unknown> = {};
  const arch = cleanPair(foot.arch);
  if (arch) out.arch = arch;
  if (foot.mobility) out.mobility = foot.mobility;
  if (foot.complaints) out.complaints = true;
  const heel = cleanPair(foot.heel);
  if (heel) out.heel = heel;
  if (foot.findings.length) out.findings = foot.findings;
  const chizhin = cleanPair(foot.chizhin);
  if (chizhin) out.chizhin = chizhin;
  const fpi = cleanPair(foot.fpi);
  if (fpi) out.fpi = fpi;
  return out;
}

function cleanLegs(legs: LegsData | null): Record<string, unknown> | undefined {
  if (!legs || legsEmpty(legs)) return undefined;
  const out: Record<string, unknown> = {};
  if (legs.axis) out.axis = legs.axis;
  if (legs.distance != null && legs.axis && legs.axis !== "neutral") out.distance = legs.distance;
  if (!legs.symmetric && legs.axis && legs.axis !== "neutral") out.symmetric = false;
  if (legs.lengthDiff) out.lengthDiff = legs.lengthDiff;
  if (legs.gait.length) out.gait = legs.gait;
  return out;
}

function cleanSpine(spine: SpineData | null): Record<string, unknown> | undefined {
  if (!spine || spineEmpty(spine)) return undefined;
  const out: Record<string, unknown> = {};
  if (spine.posture) out.posture = spine.posture;
  if (spine.asymmetries.length) out.asymmetries = spine.asymmetries;
  if (spine.card != null) out.card = [...spine.card].sort((a, b) => a - b);
  const adams = spine.adams;
  if (adams && (adams.result || adams.side || adams.atr != null)) out.adams = adams;
  if (spine.cobb != null) out.cobb = spine.cobb;
  if (spine.risser != null) out.risser = spine.risser;
  if (spine.kyphosis != null) out.kyphosis = spine.kyphosis;
  return out;
}

/** `data` осмотра: пустые блоки не пишутся, прежние ключи конструктора — сводкой. */
export function buildExamData(form: OrthoExamForm): Record<string, unknown> {
  const data: Record<string, unknown> = { orthoKind: "exam", examType: form.examType };
  const put = (key: string, value: unknown) => {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return;
    data[key] = value;
  };
  put("hips", cleanHips(form.hips));
  put("neck", cleanNeck(form.neck));
  put("foot", cleanFoot(form.foot));
  put("legs", cleanLegs(form.legs));
  put("spine", cleanSpine(form.spine));
  put("beighton", form.beighton);
  put("chest", form.chest);
  put("redFlags", form.redFlags);
  put("conclusions", form.conclusions);
  put("recommendationCodes", form.recommendationCodes);
  put("recommendationNote", form.recommendationNote.trim());
  put("recommendation", composeRecommendation(form.recommendationCodes, form.recommendationNote));
  put("posture", postureText(form.spine));
  put("feet", feetText(form.foot));
  put("nextCheckMonths", form.nextCheckMonths);
  return data;
}

const SERVICE_KEYS = new Set(["orthoKind", "examType", "nextCheckMonths"]);

/** Есть что сохранить: любой показатель, заключение или рекомендация. */
export function examHasContent(form: OrthoExamForm): boolean {
  return Object.keys(buildExamData(form)).some((key) => !SERVICE_KEYS.has(key));
}

/** Выбор, исключающий остальные: «Норма» в заключении. */
export function toggleExclusive(list: ReadonlyArray<string>, value: string, exclusive: string): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (value === exclusive) return [exclusive];
  return [...list.filter((item) => item !== exclusive), value];
}

// ── Блоки окна осмотра ───────────────────────────────────────────────────────

/** Блок окна осмотра. */
export type EditorBlock = OrthoBlock;

/** Какие блоки открыты сразу (ТЗ §1): до года — суставы, шея, стопы; 1–3 года — ноги и стопы; дальше — спина, стопы, ноги. */
export function blocksForAge(months: number | null): EditorBlock[] {
  if (months == null) return ["hips", "neck", "foot", "legs", "spine", "other"];
  if (months < 12) return ["hips", "neck", "foot"];
  if (months < 36) return ["foot", "legs"];
  return ["spine", "foot", "legs"];
}

export const ALL_BLOCKS: ReadonlyArray<EditorBlock> = ["hips", "neck", "foot", "legs", "spine", "other"];

/** Заполненные блоки — при правке их видно, даже если по возрасту они скрыты. */
export function filledBlocks(form: OrthoExamForm): EditorBlock[] {
  const filled: EditorBlock[] = [];
  if (!hipsEmpty(form.hips)) filled.push("hips");
  if (!neckEmpty(form.neck)) filled.push("neck");
  if (!footEmpty(form.foot)) filled.push("foot");
  if (!legsEmpty(form.legs)) filled.push("legs");
  if (!spineEmpty(form.spine)) filled.push("spine");
  if (form.beighton != null || form.chest) filled.push("other");
  return filled;
}

// ── Хронические диагнозы ─────────────────────────────────────────────────────

/** Заключения осмотра, которых нет среди действующих хронических (без нормы и её вариантов). */
export function chronicSuggestions(conclusions: ReadonlyArray<string>, diagnoses: ReadonlyArray<OrthoDiagnosis>): string[] {
  const known = new Set(diagnoses.filter((item) => item.state !== "resolved").map((item) => item.diagnosis));
  return conclusions.filter((code) => {
    const def = diagnosisDef(code);
    return def != null && !def.normal && !def.variant && !known.has(code);
  });
}

export interface DiagnosisForm {
  diagnosis: string;
  customLabel: string;
  icd: string;
  side: Side | "";
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
    side: "",
    dispensary: false,
    state: "observation",
    resolvedOn: "",
    notes: "",
    ...preset,
  };
}

export function diagnosisToForm(item: OrthoDiagnosis): DiagnosisForm {
  return emptyDiagnosisForm({
    diagnosis: item.diagnosis,
    customLabel: item.diagnosis === "other" ? item.label : "",
    icd: item.icd,
    side: item.side ?? "",
    dispensary: item.dispensary,
    state: item.state,
    resolvedOn: item.resolvedOn ?? "",
    notes: item.record.notes,
  });
}

export function diagnosisTitle(form: Pick<DiagnosisForm, "diagnosis" | "customLabel">): string {
  if (form.diagnosis === "other") return form.customLabel.trim();
  return diagnosisDef(form.diagnosis)?.label ?? "";
}

export function buildDiagnosisData(form: DiagnosisForm): Record<string, unknown> {
  const def = diagnosisDef(form.diagnosis);
  const data: Record<string, unknown> = {
    orthoKind: "diagnosis",
    diagnosis: form.diagnosis,
    icd: (form.diagnosis === "other" ? form.icd : def?.icd ?? form.icd).trim(),
    state: form.state,
    dispensary: form.dispensary,
  };
  if (form.side) data.side = form.side;
  if (form.state === "resolved" && form.resolvedOn) data.resolvedOn = form.resolvedOn;
  return data;
}

export function diagnosisValid(form: DiagnosisForm): boolean {
  if (!form.diagnosis) return false;
  return form.diagnosis !== "other" || form.customLabel.trim() !== "";
}

/** Заключения осмотра по-человечески: «Дисплазия ТБС (Q65.8)». */
export function conclusionLabels(codes: ReadonlyArray<string>): string[] {
  return codes
    .map((code) => {
      const def = CONCLUSIONS.find((item) => item.value === code);
      if (!def) return "";
      return def.icd ? `${def.label} (${def.icd})` : def.label;
    })
    .filter(Boolean);
}
