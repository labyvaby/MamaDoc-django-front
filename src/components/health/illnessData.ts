import dayjs, { type Dayjs } from "dayjs";

import type {
  AgeBand,
  ChildhoodInfectionCode,
  ChildhoodInfectionInput,
  ChronicStat,
  Condition,
  DatePrecision,
  EpisodeMedication,
  EpisodeSource,
  HealthAttachment,
  Hospitalization,
  IllnessCounter,
  IllnessDiagnosis,
  IllnessEpisode,
  IllnessHistory,
  IllnessSummary,
  InfectionEvidence,
  InfectionStatus,
  InfectionSummary,
} from "../../api/health";
import type { PatientGender } from "../../api/patients";
import { pluralRu } from "../../utility/amountInWords";
import { ageLabel, formatDate, type Option } from "./healthMeta";

/**
 * «История болезней» без интерфейса (ТЗ 2026-10-04 §3–§4): даты с точностью,
 * лента по годам, вкладки, счётчики и подсказки. Сам сбор случаев — на
 * сервере (`GET illness-history/`), здесь только показ.
 */

// ── Даты с точностью ─────────────────────────────────────────────────────────

export const DATE_PRECISIONS: Option<DatePrecision>[] = [
  { value: "day", label: "Дата" },
  { value: "month", label: "Месяц и год" },
  { value: "year", label: "Только год" },
];

/** «12.03.2025», «03.2025», «2025»; пусто — пустая строка. */
export function formatPrecisionDate(value: string | null | undefined, precision: DatePrecision | null | undefined): string {
  if (!value) return "";
  const date = dayjs(value);
  if (!date.isValid()) return "";
  if (precision === "year") return date.format("YYYY");
  if (precision === "month") return date.format("MM.YYYY");
  return date.format("DD.MM.YYYY");
}

/** Дата для сервера: при «месяце» — 1-е число, при «годе» — 1 января (§2.2). */
export function normalizePrecisionDate(value: string | null | undefined, precision: DatePrecision): string | null {
  if (!value) return null;
  const date = dayjs(value);
  if (!date.isValid()) return null;
  if (precision === "year") return date.startOf("year").format("YYYY-MM-DD");
  if (precision === "month") return date.startOf("month").format("YYYY-MM-DD");
  return date.format("YYYY-MM-DD");
}

/** Какие дни покрывает дата с точностью: «03.2025» — с 1 по 31 марта. */
export function precisionRange(value: string, precision: DatePrecision): { from: Dayjs; to: Dayjs } {
  const date = dayjs(value);
  const unit = precision === "year" ? "year" : precision === "month" ? "month" : "day";
  return { from: date.startOf(unit), to: date.endOf(unit).startOf("day") };
}

/**
 * Проверка «не раньше рождения и не в будущем» с точностью даты: «03.2025»
 * у ребёнка, родившегося 26.03.2025, — не раньше рождения.
 */
export function precisionDateError(
  value: string | null | undefined,
  precision: DatePrecision,
  birthDate: string | null | undefined,
  today: Dayjs = dayjs(),
): string | null {
  if (!value) return null;
  const unit = precision === "year" ? "year" : precision === "month" ? "month" : "day";
  const date = dayjs(value);
  if (birthDate && date.isBefore(dayjs(birthDate), unit)) return "Дата раньше рождения";
  if (date.isAfter(today, unit)) return "Дата ещё не наступила";
  return null;
}

/** Последний день, который может означать дата с точностью, но не позже сегодня. */
export function latestPossibleDay(value: string, precision: DatePrecision, today: Dayjs = dayjs()): Dayjs {
  const { to } = precisionRange(value, precision);
  return to.isAfter(today, "day") ? today.startOf("day") : to;
}

/** День для счётчиков за 12 месяцев: «месяц» — по 1-му числу, «только год» не считается (§3.3). */
export function countableDay(value: string | null | undefined, precision: DatePrecision): Dayjs | null {
  if (!value || precision === "year") return null;
  const date = dayjs(value);
  return precision === "month" ? date.startOf("month") : date.startOf("day");
}

/** Окно «за 12 месяцев»: с той же даты год назад по сегодня включительно. */
export function inLastYear(day: Dayjs | null, today: Dayjs): boolean {
  if (!day) return false;
  const from = today.subtract(1, "year").startOf("day");
  return !day.isBefore(from, "day") && !day.isAfter(today, "day");
}

// ── Слова ────────────────────────────────────────────────────────────────────

/** «Острый бронхит» → «острый бронхит», «В роддоме» → «в роддоме», а «ОРВИ», «ЛОР» и «ЦСМ» не трогаем. */
export function lowerFirst(text: string): string {
  const value = text.trim();
  const word = value.match(/^[\p{L}]+/u)?.[0] ?? "";
  // Аббревиатура — слово из двух и больше заглавных букв.
  if (word.length >= 2 && word === word.toUpperCase()) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** «болела» / «болел» / «болел(а)» — по полу ребёнка. */
export function byGender(gender: PatientGender | null | undefined, female: string, male: string, unknown: string): string {
  if (gender === "female") return female;
  if (gender === "male") return male;
  return unknown;
}

const hadWord = (gender: PatientGender | null | undefined) => byGender(gender, "болела", "болел", "болел(а)");
const notHadWord = (gender: PatientGender | null | undefined) => byGender(gender, "не болела", "не болел", "не болел(а)");

/** «из 1 приёма», «из 4 приёмов»: после «из» — родительный падеж. */
function genitive(count: number, forms: [string, string]): string {
  return count % 10 === 1 && count % 100 !== 11 ? forms[0] : forms[1];
}

// ── Заголовок раздела ────────────────────────────────────────────────────────

/** «Из 4 приёмов и 3 записей вручную»; с архивом — «Из 4 приёмов, 2 архивных заключений и 3 записей вручную». */
export function sourcesLine(sources: IllnessSummary["sources"]): string {
  const parts = [
    sources.visits ? `${sources.visits} ${genitive(sources.visits, ["приёма", "приёмов"])}` : "",
    sources.archive ? `${sources.archive} ${genitive(sources.archive, ["архивного заключения", "архивных заключений"])}` : "",
    sources.manual ? `${sources.manual} ${genitive(sources.manual, ["записи", "записей"])} вручную` : "",
  ].filter(Boolean);
  if (!parts.length) return "Болезни собираются сами из заключений приёмов";
  const head = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}` : parts[0];
  return `Из ${head}`;
}

// ── Вкладки ──────────────────────────────────────────────────────────────────

export type IllnessTab = "all" | "chronic" | "past" | "hospitalizations" | "infections";

/** Хронические сейчас: действующие и в ремиссии. */
export function isCurrentCondition(condition: Pick<Condition, "status">): boolean {
  return condition.status === "active" || condition.status === "remission";
}

/** Числа вкладок: хронические (действующие и в ремиссии), все случаи, госпитализации, «болела». */
export function illnessTabCounts(history: Pick<IllnessHistory, "chronic" | "episodes" | "hospitalizations" | "infections">): Record<
  Exclude<IllnessTab, "all">,
  number
> {
  return {
    chronic: history.chronic.filter(isCurrentCondition).length,
    past: history.episodes.length,
    hospitalizations: history.hospitalizations.length,
    infections: history.infections.filter((info) => info.status === "had").length,
  };
}

// ── За 12 месяцев и «часто болеющий» ─────────────────────────────────────────

/** Для заголовка: «возраст 1–3 года». */
export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  "0": "до 1 года",
  "1-3": "1–3 года",
  "4-5": "4–5 лет",
  "6+": "6 лет и старше",
};

/** Для подсказки: «порог для 1–3 лет — 6». */
const AGE_BAND_THRESHOLD_LABELS: Record<AgeBand, string> = {
  "0": "детей до 1 года",
  "1-3": "1–3 лет",
  "4-5": "4–5 лет",
  "6+": "6 лет и старше",
};

export function summaryTitle(summary: Pick<IllnessSummary, "ageBand">): string {
  return summary.ageBand ? `За 12 месяцев · возраст ${AGE_BAND_LABELS[summary.ageBand]}` : "За 12 месяцев";
}

/** «ОРЗ 1 из 6» — у детей с порогом; без порога — «ОРЗ 1». */
export function ariCounterText(summary: Pick<IllnessSummary, "counts" | "frequentIll">): string {
  const count = summary.counts.ari;
  return summary.frequentIll ? `ОРЗ ${count} из ${summary.frequentIll.threshold}` : `ОРЗ ${count}`;
}

/** Порог достигнут — жёлтая подсказка; ниже порога и без порога — null (§3.4). */
export function frequentIllText(summary: Pick<IllnessSummary, "counts" | "frequentIll" | "ageBand">): string | null {
  if (!summary.frequentIll || !summary.ageBand) return null;
  if (!summary.frequentIll.isFrequent && summary.counts.ari < summary.frequentIll.threshold) return null;
  return `Похоже на часто болеющего ребёнка: ${summary.counts.ari} ОРЗ за 12 месяцев, порог для ${
    AGE_BAND_THRESHOLD_LABELS[summary.ageBand]
  } — ${summary.frequentIll.threshold}. Решает врач.`;
}

export type CounterGroup = IllnessCounter | "other";

export interface MonthBucket {
  key: string;
  /** «окт» */
  label: string;
  /** «октябрь 2026: 2 случая» */
  title: string;
  counts: Record<CounterGroup, number>;
  total: number;
}

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Случаи по месяцам начала за 12 месяцев, по группам; «только год» не считается. */
export function episodesByMonth(episodes: ReadonlyArray<IllnessEpisode>, today: Dayjs = dayjs()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const month = today.subtract(back, "month");
    const counts: Record<CounterGroup, number> = { ari: 0, otitis: 0, intestinal: 0, other: 0 };
    for (const episode of episodes) {
      const day = countableDay(episode.startedOn, episode.datePrecision);
      if (day && day.isSame(month, "month")) counts[episode.counter ?? "other"] += 1;
    }
    const total = counts.ari + counts.otitis + counts.intestinal + counts.other;
    buckets.push({
      key: month.format("YYYY-MM"),
      label: MONTH_SHORT[month.month()],
      title: `${month.format("MMMM YYYY")}: ${total ? `${total} ${pluralRu(total, ["случай", "случая", "случаев"])}` : "без болезней"}`,
      counts,
      total,
    });
  }
  return buckets;
}

// ── Случай болезни ───────────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<EpisodeSource, string> = {
  visit: "из приёма",
  archive: "из архива",
  manual: "вручную",
};

/** Подпись даты в ленте: «12.09», «04.02–09.02», «03.2025», «2025». С годом — для строк вне ленты. */
export function episodeWhen(
  episode: Pick<IllnessEpisode, "startedOn" | "endedOn" | "datePrecision">,
  withYear = false,
): string {
  if (episode.datePrecision !== "day") return formatPrecisionDate(episode.startedOn, episode.datePrecision);
  const start = dayjs(episode.startedOn);
  const end = dayjs(episode.endedOn || episode.startedOn);
  if (!end.isAfter(start, "day")) return start.format(withYear ? "DD.MM.YYYY" : "DD.MM");
  if (!start.isSame(end, "year")) return `${start.format("DD.MM.YYYY")}–${end.format("DD.MM.YYYY")}`;
  return `${start.format("DD.MM")}–${end.format(withYear ? "DD.MM.YYYY" : "DD.MM")}`;
}

/**
 * Возраст на дату с точностью: при «только годе» не угадываем; при «месяце» —
 * по 1-му числу, но не в первый месяц жизни: «04.2025» у родившейся 26.03 —
 * это и 6 дней, и 5 недель.
 */
export function precisionAge(value: string | null | undefined, precision: DatePrecision, birthDate: string | null | undefined): string {
  if (!value || !birthDate || precision === "year") return "";
  if (precision === "month" && dayjs(value).diff(dayjs(birthDate), "month") < 1) return "";
  return ageLabel(birthDate, value);
}

/** Возраст ребёнка в начале случая. */
export function episodeAge(episode: Pick<IllnessEpisode, "startedOn" | "datePrecision">, birthDate: string | null | undefined): string {
  return precisionAge(episode.startedOn, episode.datePrecision, birthDate);
}

/** Диагнозы случая: первый как записан, остальные со строчной («ОРВИ → острый бронхит»). */
export function episodeTitleParts(episode: Pick<IllnessEpisode, "diagnoses">): IllnessDiagnosis[] {
  return episode.diagnoses.map((diagnosis, index) => ({
    code: diagnosis.code,
    title: index === 0 ? diagnosis.title : lowerFirst(diagnosis.title),
  }));
}

/** «ОРВИ J06.9 → острый бронхит J20.9». */
export function episodeTitleText(episode: Pick<IllnessEpisode, "diagnoses">): string {
  return episodeTitleParts(episode)
    .map((diagnosis) => [diagnosis.title, diagnosis.code].filter(Boolean).join(" "))
    .join(" → ");
}

/** Специализации без повторов: «Педиатр, Неонатолог» → «педиатр, неонатолог». */
function specialtiesOf(episode: Pick<IllnessEpisode, "visits">): string[] {
  const seen: string[] = [];
  for (const visit of episode.visits) {
    for (const raw of visit.specialty.split(",")) {
      const name = lowerFirst(raw);
      if (name && !seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/** «2 приёма · педиатр»; без специальности — врач; у внесённой вручную — пусто. */
export function visitsCaption(episode: Pick<IllnessEpisode, "source" | "visitsCount" | "visits">): string {
  if (episode.source === "manual") return "";
  const count = episode.visitsCount || episode.visits.length;
  const word =
    episode.source === "archive"
      ? `${count} ${pluralRu(count, ["запись архива", "записи архива", "записей архива"])}`
      : `${count} ${pluralRu(count, ["приём", "приёма", "приёмов"])}`;
  const specialties = specialtiesOf(episode);
  const doctors = specialties.length
    ? specialties
    : [...new Set(episode.visits.map((visit) => visit.doctor?.fullName || visit.doctorName).filter(Boolean))];
  return [word, doctors.join(", ")].filter(Boolean).join(" · ");
}

/** «амоксициллин 7 дн.»; без даты отмены — только препарат. */
export function medicationCaption(course: Pick<EpisodeMedication, "drug" | "days">): string {
  const drug = lowerFirst(course.drug);
  return course.days ? `${drug} ${course.days} дн.` : drug;
}

/** «амоксициллин 7 дн. — в «Препаратах»»; курсов нет — пусто. */
export function medicationsCaption(courses: ReadonlyArray<Pick<EpisodeMedication, "drug" | "days">>): string {
  if (!courses.length) return "";
  return `${courses.map(medicationCaption).join(", ")} — в «Препаратах»`;
}

// ── Госпитализации и документы ───────────────────────────────────────────────

/** «14–15.11.2025», «28.10–02.11.2025»; без выписки — «с 14.11.2025, не выписан». Без года — для ленты. */
export function stayPeriod(row: Pick<Hospitalization, "admittedOn" | "dischargedOn">, withYear = true): string {
  const start = dayjs(row.admittedOn);
  const yearFormat = withYear ? ".YYYY" : "";
  if (!row.dischargedOn) return `с ${start.format(`DD.MM${yearFormat}`)}, не выписан`;
  const end = dayjs(row.dischargedOn);
  if (end.isSame(start, "day")) return start.format(`DD.MM${yearFormat}`);
  if (!end.isSame(start, "year")) return `${start.format("DD.MM.YYYY")}–${end.format("DD.MM.YYYY")}`;
  if (end.isSame(start, "month")) return `${start.format("DD")}–${end.format(`DD.MM${yearFormat}`)}`;
  return `${start.format("DD.MM")}–${end.format(`DD.MM${yearFormat}`)}`;
}

const ATTACHMENT_WORDS: Record<HealthAttachment["kind"], [string, string]> = {
  discharge: ["выписка", "выписки"],
  image: ["снимок", "снимки"],
  other: ["документ", "документы"],
};

/** «выписка, снимки (3)»: виды документов (число — по каждому виду) и сколько их всего. */
export function attachmentsCaption(attachments: ReadonlyArray<Pick<HealthAttachment, "kind">>): string {
  if (!attachments.length) return "";
  const order: Array<HealthAttachment["kind"]> = ["discharge", "image", "other"];
  const kinds = order
    .map((kind) => {
      const count = attachments.filter((item) => (ATTACHMENT_WORDS[item.kind] ? item.kind : "other") === kind).length;
      return count ? ATTACHMENT_WORDS[kind][count > 1 ? 1 : 0] : "";
    })
    .filter(Boolean);
  return attachments.length > 1 ? `${kinds.join(", ")} (${attachments.length})` : kinds[0];
}

/** У госпитализации: «выписка приложена» или «документы (2)». */
export function stayDocsCaption(attachments: ReadonlyArray<Pick<HealthAttachment, "kind">>): string {
  if (attachments.some((item) => item.kind === "discharge")) return "выписка приложена";
  return attachments.length ? `документы (${attachments.length})` : "";
}

/** PDF или снимок — по имени или ссылке. */
export function isPdfAttachment(attachment: Pick<HealthAttachment, "url" | "name">): boolean {
  return /\.pdf($|\?)/i.test(attachment.url) || /\.pdf$/i.test(attachment.name);
}

// ── Хронические ──────────────────────────────────────────────────────────────

/** «приёмов за 12 мес.: 2, последний — 17.03.2026». */
export function chronicStatText(stat: ChronicStat | undefined): string {
  if (!stat) return "";
  const last = stat.lastVisitOn ? `, последний — ${formatDate(stat.lastVisitOn)}` : "";
  return `приёмов за 12 мес.: ${stat.visitsLast12Months}${last}`;
}

// ── Детские инфекции ─────────────────────────────────────────────────────────

/** Короткие названия для строк «Переболела: розеола (01.2026)». Порядок — как в каталоге сервера (§3.7). */
export const INFECTION_SHORT: Record<ChildhoodInfectionCode, string> = {
  varicella: "ветряная оспа",
  measles: "корь",
  rubella: "краснуха",
  mumps: "паротит",
  pertussis: "коклюш",
  scarlet_fever: "скарлатина",
  roseola: "розеола",
  mononucleosis: "мононуклеоз",
};

export const EVIDENCE_OPTIONS: Option<InfectionEvidence>[] = [
  { value: "doctor", label: "Диагноз врача" },
  { value: "lab", label: "Анализ" },
  { value: "parent", label: "Со слов родителей" },
];

const EVIDENCE_WORDS: Record<InfectionEvidence, string> = { doctor: "диагноз врача", lab: "по анализу", parent: "со слов родителей" };

export function infectionStatusOptions(gender: PatientGender | null | undefined): Option<InfectionStatus>[] {
  return [
    { value: "had", label: byGender(gender, "Болела", "Болел", "Болел(а)") },
    { value: "not_had", label: byGender(gender, "Не болела", "Не болел", "Не болел(а)") },
    { value: "unknown", label: "Нет сведений" },
  ];
}

/** Первое упоминание инфекции в приёмах и архиве. */
export function firstMention(info: Pick<InfectionSummary, "mentions">): InfectionSummary["mentions"][number] | null {
  if (!info.mentions.length) return null;
  return [...info.mentions].sort((a, b) => a.on.localeCompare(b.on))[0];
}

/** Итог строкой: «болела 01.2026, со слов родителей», «болела — из приёма 12.03.2025», «не болела», «нет сведений». */
export function infectionStatusText(info: InfectionSummary, gender?: PatientGender | null): string {
  const record = info.record;
  if (info.status === "had" && info.derived) {
    const mention = firstMention(info);
    return `${hadWord(gender)} — из приёма${mention ? ` ${formatDate(mention.on)}` : ""}`;
  }
  const evidence = record?.evidence ? EVIDENCE_WORDS[record.evidence] : "";
  if (info.status === "had") {
    const when = record ? formatPrecisionDate(record.occurredOn, record.datePrecision) : "";
    return [[hadWord(gender), when].filter(Boolean).join(" "), evidence].filter(Boolean).join(", ");
  }
  if (info.status === "not_had") return [notHadWord(gender), evidence].filter(Boolean).join(", ");
  return "нет сведений";
}

/** Подсказка о прививке у строки инфекции; тексты утверждает главный врач (§3.7). */
export function infectionVaccineHint(info: Pick<InfectionSummary, "infection" | "status">, gender?: PatientGender | null): string | null {
  if (info.infection === "varicella") {
    if (info.status === "had") return "Прививка от ветряной оспы, скорее всего, не нужна. Решает врач.";
    if (info.status === "not_had") {
      return `${byGender(gender, "Не болела", "Не болел", "Не болел(а)")} — от ветряной оспы защищает только прививка. Обсудите с родителями.`;
    }
    return null;
  }
  if ((info.infection === "measles" || info.infection === "rubella" || info.infection === "mumps") && info.status === "had") {
    return "Прививку КПК обычно всё равно делают: она защищает и от двух других инфекций. Решает врач.";
  }
  return null;
}

/** «В приёме 12.03.2025 диагноз «Ветряная оспа», а отмечено «не болела» — проверьте.» */
export function infectionConflictText(info: InfectionSummary, gender?: PatientGender | null): string | null {
  if (!info.conflict) return null;
  const mention = firstMention(info);
  const where = mention?.legacyConclusionId && !mention.conclusionId ? "В архиве" : "В приёме";
  const title = mention?.title || info.name;
  return `${where}${mention ? ` ${formatDate(mention.on)}` : ""} диагноз «${title}», а отмечено «${notHadWord(gender)}» — проверьте.`;
}

/** Дата «болела»: отметки — с её точностью, выведенная — по первому упоминанию. */
export function infectionHadDate(info: InfectionSummary): { on: string; precision: DatePrecision } | null {
  if (info.status !== "had") return null;
  if (info.record?.status === "had") {
    return info.record.occurredOn ? { on: info.record.occurredOn, precision: info.record.datePrecision } : null;
  }
  const mention = firstMention(info);
  return mention ? { on: mention.on, precision: "day" } : null;
}

/** Строка над календарём прививок: «Переболела: розеола (01.2026). Не болела: ветряная оспа.»; отметок нет — null. */
export function vaccinationInfectionsLine(infections: ReadonlyArray<InfectionSummary>, gender?: PatientGender | null): string | null {
  const had = infections
    .filter((info) => info.status === "had")
    .map((info) => {
      const date = infectionHadDate(info);
      const when = date ? formatPrecisionDate(date.on, date.precision) : "";
      return when ? `${INFECTION_SHORT[info.infection]} (${when})` : INFECTION_SHORT[info.infection];
    });
  const notHad = infections.filter((info) => info.status === "not_had").map((info) => INFECTION_SHORT[info.infection]);
  const parts = [
    had.length ? `${byGender(gender, "Переболела", "Переболел", "Переболел(а)")}: ${had.join(", ")}.` : "",
    notHad.length ? `${byGender(gender, "Не болела", "Не болел", "Не болел(а)")}: ${notHad.join(", ")}.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Строка ленты для отметки, которой нет в приёмах: «Розеола, 01.2026, со слов родителей». */
export function infectionRibbonText(info: InfectionSummary): string {
  const record = info.record;
  const short = INFECTION_SHORT[info.infection];
  const name = short.charAt(0).toUpperCase() + short.slice(1);
  const when = record ? formatPrecisionDate(record.occurredOn, record.datePrecision) : "";
  const evidence = record?.evidence ? EVIDENCE_WORDS[record.evidence] : "";
  return [name, when, evidence].filter(Boolean).join(", ");
}

/** Как открыто окно отметки: правка, «болела» кнопкой или «Подтвердить» из приёма. */
export type InfectionDrawerMode = "edit" | "had" | "confirm";

/** Форма отметки по итогу инфекции и способу открытия окна (§5). */
export function infectionForm(info: InfectionSummary, mode: InfectionDrawerMode): ChildhoodInfectionInput {
  const record = info.record;
  const base: ChildhoodInfectionInput = {
    infection: info.infection,
    status: record?.status ?? "unknown",
    occurredOn: record?.occurredOn ?? null,
    datePrecision: record?.datePrecision ?? "day",
    evidence: record?.evidence ?? "",
    sourceConclusionId: record?.sourceConclusionId ?? null,
    notes: record?.notes ?? "",
  };
  if (mode === "confirm") {
    // «Подтвердить» из приёма: болела, дата первого упоминания, диагноз врача, заключение-источник.
    const mention = firstMention(info);
    return {
      ...base,
      status: "had",
      occurredOn: mention?.on ?? base.occurredOn,
      datePrecision: "day",
      evidence: "doctor",
      sourceConclusionId: mention?.conclusionId ?? null,
    };
  }
  if (mode === "had") return { ...base, status: "had", evidence: base.evidence || "parent" };
  return base;
}

/**
 * Тело отметки: дата — только у «болела» (при «не болела» и «нет сведений»
 * сервер её и так очищает); создание — без пустых полей, правка — null очищает.
 */
export function infectionPayload(form: ChildhoodInfectionInput, mode: "create" | "update"): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    infection: form.infection,
    status: form.status,
    datePrecision: form.datePrecision,
    notes: form.notes.trim(),
  };
  const occurredOn = form.status === "had" ? normalizePrecisionDate(form.occurredOn, form.datePrecision) : null;
  const evidence = form.status === "unknown" ? "" : form.evidence;
  if (occurredOn || mode === "update") payload.occurredOn = occurredOn;
  if (evidence || mode === "update") payload.evidence = evidence || null;
  if (form.sourceConclusionId != null || mode === "update") payload.sourceConclusionId = form.sourceConclusionId;
  return payload;
}

/** «Не болела» одной кнопкой — со слов родителей (§4.1). */
export function notHadQuickPayload(info: InfectionSummary): Record<string, unknown> {
  const form: ChildhoodInfectionInput = {
    ...infectionForm(info, "edit"),
    status: "not_had",
    occurredOn: null,
    evidence: "parent",
    sourceConclusionId: null,
  };
  return infectionPayload(form, info.record ? "update" : "create");
}

/** Отметка «болела», внесённая вручную и не видная в приёмах, — отдельной строкой ленты. */
export function isManualOnlyInfection(info: InfectionSummary): boolean {
  return info.record?.status === "had" && info.mentions.length === 0;
}

// ── Лента по годам ───────────────────────────────────────────────────────────

export type RibbonItem =
  | { kind: "episode"; key: string; date: string; precision: DatePrecision; episode: IllnessEpisode }
  | { kind: "hospitalization"; key: string; date: string; precision: DatePrecision; row: Hospitalization }
  | { kind: "infection"; key: string; date: string | null; precision: DatePrecision; info: InfectionSummary };

export interface RibbonYear {
  key: string;
  /** null — записи без даты (инфекция «болела», когда — не помнят). */
  year: number | null;
  items: RibbonItem[];
  /** Случаев болезни (случаи и инфекции) — у заголовка года. */
  cases: number;
  stays: number;
}

/** Записи ленты: «all» — случаи, госпитализации и отметки инфекций вне приёмов; «episodes» — только случаи. */
export function ribbonItems(
  history: Pick<IllnessHistory, "episodes" | "hospitalizations" | "infections">,
  scope: "all" | "episodes" = "all",
): RibbonItem[] {
  const items: RibbonItem[] = history.episodes.map((episode) => ({
    kind: "episode",
    key: `e-${episode.key}`,
    date: episode.startedOn,
    precision: episode.datePrecision,
    episode,
  }));
  if (scope === "all") {
    for (const row of history.hospitalizations) {
      items.push({ kind: "hospitalization", key: `h-${row.id}`, date: row.admittedOn, precision: "day", row });
    }
    for (const info of history.infections) {
      if (!isManualOnlyInfection(info)) continue;
      items.push({
        kind: "infection",
        key: `i-${info.infection}`,
        date: info.record?.occurredOn ?? null,
        precision: info.record?.datePrecision ?? "day",
        info,
      });
    }
  }
  return items;
}

const PRECISION_RANK: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 };

/**
 * Лента по годам, новые сверху. Внутри года записи «только год» — в конце,
 * записи без даты — отдельной группой в самом конце.
 */
export function groupRibbonByYear(items: ReadonlyArray<RibbonItem>): RibbonYear[] {
  const dated = items.filter((item) => item.date);
  const undated = items.filter((item) => !item.date);
  const sorted = [...dated].sort((a, b) => {
    const yearA = dayjs(a.date as string).year();
    const yearB = dayjs(b.date as string).year();
    if (yearA !== yearB) return yearB - yearA;
    const roughA = a.precision === "year" ? 1 : 0;
    const roughB = b.precision === "year" ? 1 : 0;
    if (roughA !== roughB) return roughA - roughB;
    const byDate = (b.date as string).localeCompare(a.date as string);
    return byDate || PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision];
  });
  const years: RibbonYear[] = [];
  const push = (year: number | null, item: RibbonItem) => {
    let group = years[years.length - 1];
    if (!group || group.year !== year) {
      group = { key: year == null ? "no-date" : `y-${year}`, year, items: [], cases: 0, stays: 0 };
      years.push(group);
    }
    group.items.push(item);
    if (item.kind === "hospitalization") group.stays += 1;
    else group.cases += 1;
  };
  for (const item of sorted) push(dayjs(item.date as string).year(), item);
  for (const item of undated) push(null, item);
  return years;
}

/** Сколько строк ленты показывать сразу: у ребёнка с архивом их бывает больше сотни. */
export const RIBBON_PAGE = 40;

/** Первые `limit` строк ленты; у заголовка года числа — за весь год. */
export function limitRibbon(groups: ReadonlyArray<RibbonYear>, limit: number): { groups: RibbonYear[]; hidden: number } {
  const shown: RibbonYear[] = [];
  let left = limit;
  let hidden = 0;
  for (const group of groups) {
    if (left <= 0) {
      hidden += group.items.length;
      continue;
    }
    const items = group.items.slice(0, left);
    hidden += group.items.length - items.length;
    left -= items.length;
    shown.push({ ...group, items });
  }
  return { groups: shown, hidden };
}

/** «2 случая · стационар 1» у заголовка года. */
export function yearCaption(group: Pick<RibbonYear, "cases" | "stays">): string {
  return [
    group.cases ? `${group.cases} ${pluralRu(group.cases, ["случай", "случая", "случаев"])}` : "",
    group.stays ? `стационар ${group.stays}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── Ручной ввод: коды, группы, «не вносите ли дважды?» ───────────────────────

const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
};

/**
 * Код МКБ-10 как читает сервер (§3.1): без пробелов, заглавными, кириллица —
 * латиницей, запятая — точкой, без «*», «+», «†» в конце. Не похоже на код — пусто.
 */
export function normalizeIcdCode(raw: string | null | undefined): string {
  const text = (raw ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[АВЕКМНОРСТХ]/g, (letter) => CYRILLIC_LOOKALIKES[letter] ?? letter)
    .replace(/,/g, ".")
    .replace(/[*+†]+$/u, "");
  return /^[A-Z]\d{2}(\.[0-9A-Z]{1,2})?$/.test(text) ? text : "";
}

/** Группа диагноза (§3.2): ОРЗ J00–J22, отит H65–H66, кишечная A00–A09, иначе рубрика, без кода — название. */
export function diagnosisGroup(code: string | null | undefined, title: string | null | undefined): string {
  const normalized = normalizeIcdCode(code);
  if (normalized) {
    const letter = normalized[0];
    const number = Number(normalized.slice(1, 3));
    if (letter === "J" && number <= 22) return "ari";
    if (letter === "H" && (number === 65 || number === 66)) return "otitis";
    if (letter === "A" && number <= 9) return "intestinal";
    return normalized.slice(0, 3);
  }
  return `title:${(title ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "")}`;
}

/** Группа случая: по счётчику, иначе по первому диагнозу. */
export function episodeGroup(episode: Pick<IllnessEpisode, "counter" | "diagnoses">): string {
  if (episode.counter) return episode.counter;
  const first = episode.diagnoses[0];
  return diagnosisGroup(first?.code, first?.title);
}

/** Сколько дней между двумя отрезками (0 — пересекаются). */
function gapDays(a: { from: Dayjs; to: Dayjs }, b: { from: Dayjs; to: Dayjs }): number {
  if (a.to.isBefore(b.from, "day")) return b.from.diff(a.to, "day");
  if (b.to.isBefore(a.from, "day")) return a.from.diff(b.to, "day");
  return 0;
}

/** Не больше стольких дней между приёмами одного случая (§3.2). */
export const EPISODE_GAP_DAYS = 21;

/**
 * Случай из приёмов той же группы ближе 21 дня к вводимой болезни (§3.6) —
 * окно спрашивает, не вносят ли дважды. «Только год» слишком груб — не сверяем.
 */
export function findNearbyEpisode(
  episodes: ReadonlyArray<IllnessEpisode>,
  entry: { code: string; title: string; date: string | null; precision: DatePrecision },
): IllnessEpisode | null {
  if (!entry.date || entry.precision === "year" || (!entry.code.trim() && !entry.title.trim())) return null;
  const group = diagnosisGroup(entry.code, entry.title);
  const range = precisionRange(entry.date, entry.precision);
  return (
    episodes.find(
      (episode) =>
        episode.source !== "manual" &&
        episodeGroup(episode) === group &&
        gapDays(range, { from: dayjs(episode.startedOn), to: dayjs(episode.endedOn || episode.startedOn) }) <= EPISODE_GAP_DAYS,
    ) ?? null
  );
}

/** «В приёме 12.12.2025 уже есть ОРВИ — не вносите ли дважды?» — дата ближайшего к вводимой дате приёма. */
export function duplicateWarning(episode: IllnessEpisode, date: string | null): string {
  const target = date ? dayjs(date) : dayjs(episode.startedOn);
  const visitDays = episode.visits.map((visit) => visit.on);
  const nearest = (visitDays.length ? visitDays : [episode.startedOn]).reduce((best, day) =>
    Math.abs(dayjs(day).diff(target, "day")) < Math.abs(dayjs(best).diff(target, "day")) ? day : best,
  );
  const where = episode.source === "archive" ? "В архиве" : "В приёме";
  const title = episode.diagnoses[0]?.title || "этот диагноз";
  return `${where} ${formatDate(nearest)} уже есть ${title} — не вносите ли дважды?`;
}

/** Где лечили перенесённую болезнь — быстрые кнопки (§3.10). */
export const PLACE_PRESETS = ["Дома", "Другая клиника", "Стационар"];
