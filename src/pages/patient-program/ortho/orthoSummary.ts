import {
  ADAMS,
  ASYMMETRIES,
  CHEST,
  FOOT_FINDINGS,
  GAIT,
  GRAF_TYPES,
  POSTURES,
  RED_FLAGS,
  TORTICOLLIS,
  optionLabel,
  sideShort,
} from "./orthoCatalog";
import type { FootData, HipUs, HipsData, LegsData, NeckData, OrthoExamBody, SpineData } from "./orthoData";
import {
  COBB_SURGICAL,
  aptaGrade,
  aptaStatus,
  atrStatus,
  beightonStatus,
  chestStatus,
  chizhinStatus,
  cobbStatus,
  flatfootPhysiological,
  flatfootStatus,
  fpiStatus,
  grafSuggest,
  grafTypeStatus,
  heelStatus,
  kyphosisStatus,
  legAxisStatus,
  lengthDiffStatus,
  postureCardStatus,
  postureTypeStatus,
  worst,
  type OrthoStatus,
} from "./orthoNorms";

/**
 * Сводка осмотра (ТЗ §3.7): чипы по блокам с цветом нормы и худший статус
 * каждого блока для панелей с рисунками. Возраст — на дату осмотра.
 */

export type SummaryBlock = "hips" | "neck" | "foot" | "heels" | "legs" | "spine" | "posture" | "other";

export interface SummaryItem {
  block: SummaryBlock;
  status: OrthoStatus;
  text: string;
}

export interface AgeOnExam {
  months: number | null;
  weeks: number | null;
}

const fmt = (value: number): string => String(value).replace(".", ",");

// ── Суставы ──────────────────────────────────────────────────────────────────

export interface HipSideView {
  side: "L" | "R";
  alpha: number | null;
  beta: number | null;
  /** Тип для подписи: врача или подсказка. */
  typeLabel: string;
  /** Тип поставил врач (подсказка — нет). */
  confirmed: boolean;
  status: OrthoStatus;
}

export function hipSide(side: "L" | "R", us: HipUs, weeks: number | null): HipSideView {
  if (us.type) {
    return {
      side,
      alpha: us.alpha,
      beta: us.beta,
      typeLabel: optionLabel(GRAF_TYPES, us.type) || us.type,
      confirmed: true,
      status: grafTypeStatus(us.type, weeks),
    };
  }
  const suggestion = grafSuggest(us.alpha, us.beta, weeks);
  return {
    side,
    alpha: us.alpha,
    beta: us.beta,
    typeLabel: suggestion?.label ?? "",
    confirmed: false,
    status: suggestion?.status ?? "unknown",
  };
}

const GRAF_MEANING: Record<OrthoStatus, string> = { ok: "зрелый", warn: "незрелый", bad: "дисплазия", unknown: "" };

function hipsItems(hips: HipsData, age: AgeOnExam): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (hips.us) {
    for (const view of [hipSide("L", hips.us.left, age.weeks), hipSide("R", hips.us.right, age.weeks)]) {
      if (view.alpha == null && !view.typeLabel) continue;
      const name = view.side === "L" ? "Левый сустав" : "Правый сустав";
      const meaning = GRAF_MEANING[view.status];
      items.push({ block: "hips", status: view.status, text: `${name} — ${view.typeLabel}${meaning && view.status !== "ok" ? `, ${meaning}` : ""}` });
    }
  }
  const signs: Array<[string, typeof hips.ortolani]> = [
    ["Соскальзывание (Ортолани)", hips.ortolani],
    ["Тест Барлоу положительный", hips.barlow],
    ["Укорочение бедра", hips.shortening],
    ["Отведение ограничено", hips.abductionLimited],
  ];
  for (const [label, side] of signs) {
    if (side) items.push({ block: "hips", status: "bad", text: `${label} ${sideShort(side)}` });
  }
  if (hips.folds) items.push({ block: "hips", status: "warn", text: "Складки асимметричны" });
  if (!items.length) items.push({ block: "hips", status: "ok", text: "Суставы — норма" });
  return items;
}

export function hipsStatus(hips: HipsData | null, age: AgeOnExam): OrthoStatus {
  return hips ? worst(...hipsItems(hips, age).map((item) => item.status)) : "unknown";
}

// ── Шея ──────────────────────────────────────────────────────────────────────

function neckItems(neck: NeckData, age: AgeOnExam): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (neck.torticollis && neck.torticollis !== "none") {
    const grade = aptaGrade(age.months, neck.rotationDiff, neck.mass);
    const kind = optionLabel(TORTICOLLIS, neck.torticollis).toLowerCase();
    const side = neck.side ? ` ${sideShort(neck.side)}` : "";
    items.push({
      block: "neck",
      status: aptaStatus(grade),
      text: `Кривошея ${kind}${side}${grade != null ? `, степень ${grade}` : ""}`,
    });
  } else if (neck.torticollis === "none") {
    items.push({ block: "neck", status: "ok", text: "Кривошеи нет" });
  }
  if (neck.plagiocephaly) items.push({ block: "neck", status: "warn", text: "Плагиоцефалия" });
  return items;
}

// ── Стопы и пятки ────────────────────────────────────────────────────────────

export function footArchStatus(foot: FootData, age: AgeOnExam): OrthoStatus {
  const arch = [foot.arch.left, foot.arch.right];
  return worst(
    flatfootStatus(arch, foot.mobility, foot.complaints, age.months),
    fpiStatus(foot.fpi.left),
    fpiStatus(foot.fpi.right),
    chizhinStatus(foot.chizhin.left, age.months),
    chizhinStatus(foot.chizhin.right, age.months),
    ...foot.findings.map(() => "bad" as const),
  );
}

function footItems(foot: FootData, age: AgeOnExam): SummaryItem[] {
  const items: SummaryItem[] = [];
  const arch = [foot.arch.left, foot.arch.right];
  const known = arch.some((value) => value != null);
  if (known || foot.mobility || foot.complaints) {
    const status = worst(
      flatfootStatus(arch, foot.mobility, foot.complaints, age.months),
      fpiStatus(foot.fpi.left),
      fpiStatus(foot.fpi.right),
    );
    let text = "Стопы — норма";
    if (foot.mobility === "rigid") text = "Ригидная стопа";
    else if (flatfootPhysiological(arch, foot.mobility, foot.complaints, age.months)) text = "Стопы — норма для возраста";
    else if (arch.some((value) => value === "flat" || value === "flattened")) {
      text = foot.complaints ? "Плоскостопие с жалобами" : "Плоскостопие";
    } else if (arch.some((value) => value === "high")) text = "Высокий свод";
    else if (foot.complaints) text = "Жалобы на стопы";
    items.push({ block: "foot", status, text });
  }
  for (const finding of foot.findings) {
    items.push({
      block: "foot",
      status: "bad",
      text: `${optionLabel(FOOT_FINDINGS, finding.code)} ${sideShort(finding.side)}`.trim(),
    });
  }
  return items;
}

export function heelsStatus(foot: FootData | null, age: AgeOnExam): OrthoStatus {
  if (!foot) return "unknown";
  return worst(heelStatus(foot.heel.left, age.months), heelStatus(foot.heel.right, age.months));
}

function heelText(deg: number): string {
  return deg < 0 ? `варус ${Math.abs(deg)}°` : `вальгус ${deg}°`;
}

function heelItems(foot: FootData, age: AgeOnExam): SummaryItem[] {
  const { left, right } = foot.heel;
  if (left == null && right == null) return [];
  const leftStatus = heelStatus(left, age.months);
  const rightStatus = heelStatus(right, age.months);
  const status = worst(leftStatus, rightStatus);
  if (status === "ok" || status === "unknown") {
    const values = [left, right].filter((value): value is number => value != null).map((value) => `${value}°`);
    return [{ block: "heels", status, text: `Пятки — норма (${values.join(" и ")})` }];
  }
  const items: SummaryItem[] = [];
  if (leftStatus !== "ok" && leftStatus !== "unknown" && left != null) {
    items.push({ block: "heels", status: leftStatus, text: `Пятка слева: ${heelText(left)}` });
  }
  if (rightStatus !== "ok" && rightStatus !== "unknown" && right != null) {
    items.push({ block: "heels", status: rightStatus, text: `Пятка справа: ${heelText(right)}` });
  }
  return items;
}

// ── Ноги ─────────────────────────────────────────────────────────────────────

export function legsAxisStatus(legs: LegsData | null, age: AgeOnExam): OrthoStatus {
  if (!legs) return "unknown";
  return worst(
    legAxisStatus(legs.axis, legs.distance, legs.symmetric, age.months),
    lengthDiffStatus(legs.lengthDiff?.cm ?? null),
  );
}

function legsItems(legs: LegsData, age: AgeOnExam): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (legs.axis) {
    const status = legAxisStatus(legs.axis, legs.distance, legs.symmetric, age.months);
    let text = "Ноги прямые";
    if (legs.axis !== "neutral") {
      const shape = legs.axis === "varus" ? "О-образные ноги" : "Х-образные ноги";
      text =
        status === "ok"
          ? "Ноги — норма для возраста"
          : `${shape}${legs.distance != null ? `, ${fmt(legs.distance)} см` : ""}${legs.symmetric ? "" : ", несимметрично"}`;
    }
    items.push({ block: "legs", status, text });
  }
  if (legs.lengthDiff && legs.lengthDiff.cm > 0) {
    const leg = legs.lengthDiff.side === "L" ? "Левая" : "Правая";
    items.push({
      block: "legs",
      status: lengthDiffStatus(legs.lengthDiff.cm),
      text: `${leg} нога короче на ${fmt(legs.lengthDiff.cm)} см`,
    });
  }
  const gait = legs.gait.filter((code) => code !== "normal");
  if (gait.length) {
    items.push({
      block: "legs",
      status: gait.includes("limp") ? "bad" : "warn",
      text: `Походка: ${gait.map((code) => optionLabel(GAIT, code).toLowerCase()).join(", ")}`,
    });
  }
  return items;
}

// ── Спина и осанка ───────────────────────────────────────────────────────────

export function spineStatus(spine: SpineData | null): OrthoStatus {
  if (!spine) return "unknown";
  const adams = spine.adams;
  const adamsStatus =
    adams?.atr != null ? atrStatus(adams.atr) : adams?.result && adams.result !== "negative" ? "warn" : adams?.result ? "ok" : "unknown";
  return worst(
    adamsStatus,
    cobbStatus(spine.cobb),
    kyphosisStatus(spine.kyphosis),
    spine.asymmetries.length ? "warn" : "unknown",
  );
}

function spineItems(spine: SpineData): SummaryItem[] {
  const items: SummaryItem[] = [];
  const adams = spine.adams;
  if (adams?.atr != null) {
    const side = adams.side ? (adams.side === "L" ? ", горб слева" : ", горб справа") : "";
    items.push({ block: "spine", status: atrStatus(adams.atr), text: `Спина: ротация ${adams.atr}°${side}` });
  } else if (adams?.result) {
    items.push({
      block: "spine",
      status: adams.result === "negative" ? "ok" : "warn",
      text:
        adams.result === "negative"
          ? "Тест Адамса отрицательный"
          : `${optionLabel(ADAMS, adams.result)}${adams.side ? ` ${adams.side === "L" ? "слева" : "справа"}` : ""}`,
    });
  }
  if (spine.cobb != null) {
    items.push({
      block: "spine",
      status: cobbStatus(spine.cobb),
      text: `Угол Кобба ${spine.cobb}°${spine.cobb >= COBB_SURGICAL ? " — нужен хирург" : ""}`,
    });
  }
  if (spine.kyphosis != null) {
    items.push({ block: "spine", status: kyphosisStatus(spine.kyphosis), text: `Грудной кифоз ${spine.kyphosis}°` });
  }
  for (const item of spine.asymmetries) {
    items.push({ block: "spine", status: "warn", text: `${optionLabel(ASYMMETRIES, item.code)} ${sideShort(item.side)}`.trim() });
  }
  return items;
}

export function postureStatus(spine: SpineData | null): OrthoStatus {
  if (!spine) return "unknown";
  return worst(postureTypeStatus(spine.posture), postureCardStatus(spine.card));
}

function postureItems(spine: SpineData): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (spine.posture) {
    const status = postureTypeStatus(spine.posture);
    items.push({
      block: "posture",
      status,
      text: status === "ok" ? "Осанка нормальная" : `Осанка: ${optionLabel(POSTURES, spine.posture).toLowerCase()}`,
    });
  }
  if (spine.card != null) {
    const status = postureCardStatus(spine.card);
    items.push({
      block: "posture",
      status,
      text: spine.card.length ? `Карта осанки: «да» на ${spine.card.join(", ")}` : "Карта осанки — все ответы «нет»",
    });
  }
  return items;
}

// ── Прочее ───────────────────────────────────────────────────────────────────

function otherItems(exam: Pick<OrthoExamBody, "beighton" | "chest" | "redFlags">, age: AgeOnExam): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const flag of exam.redFlags) {
    items.push({ block: "other", status: "bad", text: optionLabel(RED_FLAGS, flag) });
  }
  if (exam.beighton != null) {
    const status = beightonStatus(exam.beighton, age.months);
    items.push({ block: "other", status, text: status === "ok" ? `Бейтон ${exam.beighton}/9 — норма` : `Гипермобильность ${exam.beighton}/9` });
  }
  if (exam.chest && exam.chest !== "normal") {
    items.push({ block: "other", status: chestStatus(exam.chest), text: `${optionLabel(CHEST, exam.chest)} грудная клетка` });
  }
  return items;
}

/** Все чипы сводки осмотра — в порядке блоков экрана. */
export function examSummary(exam: OrthoExamBody, age: AgeOnExam): SummaryItem[] {
  return [
    ...otherItems(exam, age).filter((item) => item.status === "bad"),
    ...(exam.hips ? hipsItems(exam.hips, age) : []),
    ...(exam.neck ? neckItems(exam.neck, age) : []),
    ...(exam.foot ? footItems(exam.foot, age) : []),
    ...(exam.foot ? heelItems(exam.foot, age) : []),
    ...(exam.legs ? legsItems(exam.legs, age) : []),
    ...(exam.spine ? spineItems(exam.spine) : []),
    ...(exam.spine ? postureItems(exam.spine) : []),
    ...otherItems(exam, age).filter((item) => item.status !== "bad"),
  ];
}

/** Худший статус осмотра: красный признак делает красным весь осмотр. */
export function examStatus(exam: OrthoExamBody, age: AgeOnExam): OrthoStatus {
  return worst(...examSummary(exam, age).map((item) => item.status));
}
