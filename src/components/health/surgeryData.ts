import dayjs, { type Dayjs } from "dayjs";

import type {
  Anesthesia,
  AnesthesiaTolerance,
  AttachmentKind,
  BodySide,
  DatePrecision,
  HealthAttachment,
  InjuryTreatment,
  InjuryType,
  Surgery,
  SurgeryKind,
  SurgeryOutcome,
  SurgeryPayload,
  SurgeryStatus,
  TransfusionProduct,
} from "../../api/health";
import { pluralRu } from "../../utility/amountInWords";
import type { HealthTone, Option } from "./healthMeta";
import {
  attachmentsCaption,
  countableDay,
  formatPrecisionDate,
  inLastYear,
  latestPossibleDay,
  normalizePrecisionDate,
  precisionDateError,
  stayPeriod,
} from "./illnessData";

/**
 * «Операции и травмы» без интерфейса (ТЗ 2026-10-04 §3.8–§3.10, §4.2, §5):
 * справочники кнопок, название травмы и переливания, очистка полей чужого
 * вида, тело запроса, подсказки о наркозе, травмах и переливании.
 */

export const SURGERY_KINDS: Option<SurgeryKind>[] = [
  { value: "operation", label: "Операция" },
  { value: "injury", label: "Травма" },
  { value: "procedure", label: "Процедура" },
  { value: "transfusion", label: "Переливание" },
];

/** Метка вида в списке. */
export const SURGERY_KIND_TAGS: Record<SurgeryKind, string> = {
  operation: "операция",
  injury: "травма",
  procedure: "процедура",
  transfusion: "переливание",
};

export const INJURY_TYPES: Option<InjuryType>[] = [
  { value: "fracture", label: "Перелом" },
  { value: "dislocation", label: "Вывих" },
  { value: "bruise", label: "Ушиб" },
  { value: "sprain", label: "Растяжение" },
  { value: "burn", label: "Ожог" },
  { value: "wound", label: "Рана" },
  { value: "concussion", label: "Сотрясение" },
  { value: "other", label: "Другое" },
];

export const BODY_PARTS = [
  "Голова",
  "Лицо",
  "Шея",
  "Грудь",
  "Живот",
  "Спина",
  "Плечо",
  "Предплечье",
  "Кисть",
  "Бедро",
  "Голень",
  "Стопа",
];

export const BODY_SIDES: Option<BodySide>[] = [
  { value: "left", label: "Слева" },
  { value: "right", label: "Справа" },
  { value: "both", label: "С двух сторон" },
];

export const TREATMENTS: Option<InjuryTreatment>[] = [
  { value: "cast", label: "Гипс" },
  { value: "splint", label: "Шина или лонгета" },
  { value: "sutures", label: "Швы" },
  { value: "surgery", label: "Операция" },
  { value: "bandage", label: "Повязка" },
];

export const TRANSFUSION_PRODUCTS: Option<TransfusionProduct>[] = [
  { value: "red_cells", label: "Эритроцитная масса" },
  { value: "plasma", label: "Плазма" },
  { value: "platelets", label: "Тромбоциты" },
  { value: "exchange", label: "Заменное переливание" },
  { value: "immunoglobulin", label: "Иммуноглобулин" },
  { value: "other", label: "Другое" },
];

export const ANESTHESIA_OPTIONS: Option<Anesthesia>[] = [
  { value: "general", label: "Общий наркоз" },
  { value: "sedation", label: "Седация" },
  { value: "local", label: "Местное обезболивание" },
  { value: "none", label: "Без обезболивания" },
];

export const TOLERANCE_OPTIONS: Option<AnesthesiaTolerance>[] = [
  { value: "good", label: "Без осложнений" },
  { value: "complications", label: "Были осложнения" },
];

export const OUTCOME_OPTIONS: Option<SurgeryOutcome>[] = [
  { value: "recovered", label: "Выздоровление" },
  { value: "consequences", label: "С последствиями" },
  { value: "ongoing", label: "Лечение продолжается" },
];

export const SURGERY_STATUSES: Option<SurgeryStatus>[] = [
  { value: "recorded", label: "Внесена" },
  { value: "refuted", label: "Ошибочно внесена" },
];

export const ATTACHMENT_KINDS: Option<AttachmentKind>[] = [
  { value: "discharge", label: "Выписка" },
  { value: "image", label: "Снимок" },
  { value: "other", label: "Другое" },
];

/** Быстрые кнопки «Что» (§3.10). */
export const OPERATION_PRESETS = ["Аденотомия", "Тонзиллэктомия", "Аппендэктомия", "Грыжесечение", "Циркумцизия", "Орхипексия"];
export const PROCEDURE_PRESETS = [
  "Вправление вывиха",
  "Первичная хирургическая обработка раны",
  "Вскрытие гнойника",
  "Удаление инородного тела",
];
export const FACILITY_PRESETS = ["Травмпункт", "Городская детская больница", "Наша клиника", "Другая клиника"];

/** Обезболивание, после которого спрашиваем «как перенёс». */
export function hasPainRelief(anesthesia: Anesthesia | ""): boolean {
  return anesthesia === "general" || anesthesia === "sedation" || anesthesia === "local";
}

// ── Форма ────────────────────────────────────────────────────────────────────

export interface SurgeryForm {
  kind: SurgeryKind;
  status: SurgeryStatus;
  performedOn: string | null;
  datePrecision: DatePrecision;
  title: string;
  injuryType: InjuryType | "";
  bodyPart: string;
  side: BodySide | "";
  treatments: InjuryTreatment[];
  transfusionProduct: TransfusionProduct | "";
  reason: string;
  facility: string;
  surgeon: string;
  anesthesia: Anesthesia | "";
  anesthesiaTolerance: AnesthesiaTolerance | "";
  anesthesiaNotes: string;
  complications: string;
  outcome: SurgeryOutcome | "";
  hospitalizationId: number | null;
  attachments: HealthAttachment[];
  notes: string;
}

export function emptySurgeryForm(kind: SurgeryKind): SurgeryForm {
  return {
    kind,
    status: "recorded",
    performedOn: null,
    datePrecision: "day",
    title: "",
    injuryType: "",
    bodyPart: "",
    side: "",
    treatments: [],
    transfusionProduct: "",
    reason: "",
    facility: "",
    surgeon: "",
    anesthesia: "",
    anesthesiaTolerance: "",
    anesthesiaNotes: "",
    complications: "",
    outcome: "",
    hospitalizationId: null,
    attachments: [],
    notes: "",
  };
}

export function surgeryToForm(surgery: Surgery): SurgeryForm {
  return {
    kind: surgery.kind,
    status: surgery.status,
    performedOn: surgery.performedOn,
    datePrecision: surgery.datePrecision ?? "day",
    title: surgery.title,
    injuryType: surgery.injuryType ?? "",
    bodyPart: surgery.bodyPart ?? "",
    side: surgery.side ?? "",
    treatments: surgery.treatments ?? [],
    transfusionProduct: surgery.transfusionProduct ?? "",
    reason: surgery.reason ?? "",
    facility: surgery.facility ?? "",
    surgeon: surgery.surgeon ?? "",
    anesthesia: surgery.anesthesia ?? "",
    anesthesiaTolerance: surgery.anesthesiaTolerance ?? "",
    anesthesiaNotes: surgery.anesthesiaNotes ?? "",
    complications: surgery.complications ?? "",
    outcome: surgery.outcome ?? "",
    hospitalizationId: surgery.hospitalizationId ?? null,
    attachments: surgery.attachments ?? [],
    notes: surgery.notes ?? "",
  };
}

const SIDE_WORDS: Record<BodySide, string> = { left: "слева", right: "справа", both: "с двух сторон" };

/** «Перелом — предплечье, слева» из вида, части тела и стороны (§3.8). */
export function injuryTitle(type: InjuryType | "", bodyPart: string, side: BodySide | ""): string {
  const head = INJURY_TYPES.find((option) => option.value === type)?.label ?? "Травма";
  const tail = [bodyPart.trim().toLowerCase(), side ? SIDE_WORDS[side] : ""].filter(Boolean).join(", ");
  return tail ? `${head} — ${tail}` : head;
}

const TRANSFUSION_TITLES: Record<TransfusionProduct, string> = {
  red_cells: "Переливание эритроцитной массы",
  plasma: "Переливание плазмы",
  platelets: "Переливание тромбоцитов",
  exchange: "Заменное переливание крови",
  immunoglobulin: "Введение иммуноглобулина",
  other: "Переливание крови",
};

/** «Переливание эритроцитной массы» — из того, что переливали. */
export function transfusionTitle(product: TransfusionProduct | ""): string {
  return product ? TRANSFUSION_TITLES[product] : "Переливание крови";
}

/** Название, которое окно составляет само: у травмы и переливания; у операции — вводит врач. */
export function autoTitle(form: Pick<SurgeryForm, "kind" | "injuryType" | "bodyPart" | "side" | "transfusionProduct">): string {
  if (form.kind === "injury") return form.injuryType ? injuryTitle(form.injuryType, form.bodyPart, form.side) : "";
  if (form.kind === "transfusion") return form.transfusionProduct ? transfusionTitle(form.transfusionProduct) : "";
  return "";
}

/**
 * Поля чужого вида при сохранении очищаются (§3.8): лечение и вид травмы —
 * только у травмы, «что переливали» — только у переливания, обезболивания у
 * переливания нет; «как перенёс» — только при обезболивании, описание — при осложнениях.
 */
export function cleanSurgeryForm(form: SurgeryForm): SurgeryForm {
  const next = { ...form };
  if (next.kind !== "injury") {
    next.injuryType = "";
    next.treatments = [];
  }
  if (next.kind !== "transfusion") next.transfusionProduct = "";
  if (next.kind === "transfusion") next.anesthesia = "";
  if (!hasPainRelief(next.anesthesia)) next.anesthesiaTolerance = "";
  if (next.anesthesiaTolerance !== "complications") next.anesthesiaNotes = "";
  return next;
}

/** Почему сохранить нельзя; null — можно (§5). */
export function surgeryFormProblem(
  draft: SurgeryForm,
  birthDate: string | null | undefined,
  today: Dayjs = dayjs(),
): string | null {
  // Проверяем то, что уйдёт на сервер: скрытые поля чужого вида не мешают.
  const form = cleanSurgeryForm(draft);
  if (form.kind === "injury" && !form.injuryType) return "Укажите вид травмы";
  if (form.kind === "transfusion" && !form.transfusionProduct) return "Укажите, что переливали";
  if ((form.kind === "operation" || form.kind === "procedure") && !form.title.trim()) return "Укажите, что сделали";
  if (!form.performedOn) return "Укажите дату";
  const dateError = precisionDateError(form.performedOn, form.datePrecision, birthDate, today);
  if (dateError) return dateError;
  if (hasPainRelief(form.anesthesia) && form.anesthesiaTolerance === "complications" && !form.anesthesiaNotes.trim()) {
    return "Опишите осложнение наркоза";
  }
  return null;
}

const ENUM_FIELDS = ["injuryType", "side", "transfusionProduct", "anesthesia", "anesthesiaTolerance", "outcome"] as const;
const TEXT_FIELDS = ["bodyPart", "reason", "facility", "surgeon", "anesthesiaNotes", "complications", "notes"] as const;

/**
 * Тело запроса. Создание — только заполненное (остальное сервер ставит пустым);
 * правка — все поля, пустой выбор — `null` (§2.5: «null очищает поле»), поля
 * чужого вида очищаются. Название без правки врача составляется само.
 */
export function buildSurgeryPayload(form: SurgeryForm, mode: "create" | "update"): SurgeryPayload {
  const clean = cleanSurgeryForm(form);
  const title = clean.title.trim() || autoTitle(clean);
  const payload: SurgeryPayload = {
    kind: clean.kind,
    performedOn: normalizePrecisionDate(clean.performedOn, clean.datePrecision),
    datePrecision: clean.datePrecision,
    title,
  };
  if (mode === "update") payload.status = clean.status;
  for (const key of ENUM_FIELDS) {
    if (clean[key]) payload[key] = clean[key];
    else if (mode === "update") payload[key] = null;
  }
  for (const key of TEXT_FIELDS) {
    const value = clean[key].trim();
    if (value || mode === "update") payload[key] = value;
  }
  if (clean.treatments.length || mode === "update") payload.treatments = clean.treatments;
  if (clean.attachments.length || mode === "update") payload.attachments = clean.attachments;
  if (clean.hospitalizationId != null || mode === "update") payload.hospitalizationId = clean.hospitalizationId;
  return payload;
}

// ── Подсказки (§3.9) ─────────────────────────────────────────────────────────

const recorded = (rows: ReadonlyArray<Surgery>) => rows.filter((row) => row.status !== "refuted");
const times = (count: number) => `${count} ${pluralRu(count, ["раз", "раза", "раз"])}`;

export interface AnesthesiaSummary {
  text: string;
  /** «были осложнения» — красным. */
  danger: boolean;
}

/**
 * «Наркоз: общий — 1 раз, без осложнений» по записям с общим наркозом или
 * седацией (местное — не наркоз), кроме ошибочно внесённых. Осложнения —
 * красным, с датой и описанием последнего; записей нет — null.
 */
export function anesthesiaSummary(rows: ReadonlyArray<Surgery>): AnesthesiaSummary | null {
  const narcosis = recorded(rows).filter((row) => row.anesthesia === "general" || row.anesthesia === "sedation");
  if (!narcosis.length) return null;
  const complicated = narcosis
    .filter((row) => row.anesthesiaTolerance === "complications")
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn));
  if (complicated.length) {
    const last = complicated[0];
    const when = formatPrecisionDate(last.performedOn, last.datePrecision);
    const notes = last.anesthesiaNotes.trim();
    return { text: `Наркоз: были осложнения (${when})${notes ? ` — ${notes}` : ""}`, danger: true };
  }
  const general = narcosis.filter((row) => row.anesthesia === "general").length;
  const sedation = narcosis.filter((row) => row.anesthesia === "sedation").length;
  const parts = [general ? `общий — ${times(general)}` : "", sedation ? `седация — ${times(sedation)}` : ""].filter(Boolean);
  const tolerance = narcosis.some((row) => !row.anesthesiaTolerance) ? "как перенёс — не указано" : "без осложнений";
  return { text: `Наркоз: ${parts.join(", ")}, ${tolerance}`, danger: false };
}

/** Травмы за 12 месяцев: даты с точностью до дня или месяца (месяц — по 1-му числу). */
export function injuriesInLastYear(rows: ReadonlyArray<Surgery>, today: Dayjs = dayjs()): number {
  return recorded(rows).filter((row) => row.kind === "injury" && inLastYear(countableDay(row.performedOn, row.datePrecision), today))
    .length;
}

/** Порог подсказки о безопасности (§3.9). */
export const INJURY_HINT_THRESHOLD = 3;

/** «3 травмы за 12 месяцев — поговорите с родителями о безопасности дома и на прогулке». */
export function injuriesHint(rows: ReadonlyArray<Surgery>, today: Dayjs = dayjs()): string | null {
  const count = injuriesInLastYear(rows, today);
  if (count < INJURY_HINT_THRESHOLD) return null;
  return `${count} ${pluralRu(count, ["травма", "травмы", "травм"])} за 12 месяцев — поговорите с родителями о безопасности дома и на прогулке`;
}

export const TRANSFUSION_VACCINE_HINT =
  "После переливания крови или иммуноглобулина живые прививки (корь, краснуха, паротит, ветряная оспа) откладывают, обычно на 3–11 месяцев — срок зависит от препарата и дозы. Решает врач.";

/**
 * Последнее переливание или иммуноглобулин за 11 месяцев. Дата «месяц» или
 * «год» берётся по последнему возможному дню: подсказка о живых прививках
 * лучше лишний раз, чем ни разу.
 */
export function recentTransfusion(rows: ReadonlyArray<Surgery>, today: Dayjs = dayjs()): Surgery | null {
  const from = today.subtract(11, "month").startOf("day");
  const recent = recorded(rows)
    .filter((row) => row.kind === "transfusion" && !latestPossibleDay(row.performedOn, row.datePrecision, today).isBefore(from, "day"))
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn));
  return recent[0] ?? null;
}

/** «Переливание эритроцитной массы 12.05.2026» — к подсказке о прививках. */
export function transfusionLead(row: Surgery): string {
  return `${row.title || transfusionTitle(row.transfusionProduct)} ${formatPrecisionDate(row.performedOn, row.datePrecision)}`.trim();
}

// ── Строка подробностей ──────────────────────────────────────────────────────

/** «общий наркоз, без осложнений»; тон — для чипа. */
export function anesthesiaLabel(row: Pick<Surgery, "anesthesia" | "anesthesiaTolerance">): { label: string; tone: HealthTone } | null {
  if (!row.anesthesia) return null;
  const base = ANESTHESIA_OPTIONS.find((option) => option.value === row.anesthesia)?.label.toLowerCase() ?? "";
  if (row.anesthesiaTolerance === "complications") return { label: `${base}, были осложнения`, tone: "error" };
  if (row.anesthesiaTolerance === "good") return { label: `${base}, без осложнений`, tone: "success" };
  return { label: base, tone: "default" };
}

export function outcomeLabel(outcome: SurgeryOutcome | ""): { label: string; tone: HealthTone } | null {
  if (!outcome) return null;
  const label = OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label.toLowerCase() ?? "";
  return { label, tone: outcome === "recovered" ? "success" : outcome === "consequences" ? "warning" : "info" };
}

/** «стационар 14–15.11.2025». */
export function stayLabel(row: Pick<Surgery, "hospitalization">): string {
  return row.hospitalization ? `стационар ${stayPeriod(row.hospitalization)}` : "";
}

/** «гипс, швы» — у травмы. */
export function treatmentsLabel(treatments: ReadonlyArray<InjuryTreatment>): string {
  return treatments
    .map((value) => TREATMENTS.find((option) => option.value === value)?.label.toLowerCase() ?? "")
    .filter(Boolean)
    .join(", ");
}

/**
 * Строка подробностей (§4.2): где · обезболивание и как перенёс · осложнения ·
 * исход · «стационар 14–15.11.2025» · «выписка, снимки (2)».
 */
export function surgeryDetailsLine(row: Surgery): string {
  const complications = row.complications.trim();
  return [
    row.facility.trim(),
    row.kind === "injury" ? treatmentsLabel(row.treatments) : "",
    anesthesiaLabel(row)?.label ?? "",
    complications ? `${row.kind === "transfusion" ? "реакция" : "осложнения"}: ${complications}` : "",
    outcomeLabel(row.outcome)?.label ?? "",
    stayLabel(row),
    attachmentsCaption(row.attachments),
  ]
    .filter(Boolean)
    .join(" · ");
}
