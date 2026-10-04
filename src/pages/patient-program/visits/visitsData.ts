import dayjs, { type Dayjs } from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import type { PatientConclusionRow } from "../../../api/medical";
import { ageLabel } from "../../../components/health/healthMeta";
import { pluralRu } from "../../../utility/amountInWords";

/** Место приёма на ленте: впереди, уже был или отменён (неявка — тоже отмена). */
export type VisitPhase = "upcoming" | "past" | "cancelled";
export type VisitFilter = "all" | VisitPhase;
export type ConclusionMark = "none" | "draft" | "done";

export interface VisitDoctor {
  id: number;
  name: string;
  photoUrl: string | null;
}

export interface VisitDiagnosis {
  code: string;
  title: string;
}

export interface Visit {
  id: number;
  appointment: DjangoAppointment;
  at: string;
  phase: VisitPhase;
  noShow: boolean;
  doctors: VisitDoctor[];
  services: string[];
  /** Возраст ребёнка в день приёма: «1 год 3 мес.»; пусто без даты рождения. */
  age: string;
  diagnoses: VisitDiagnosis[];
  conclusion: ConclusionMark;
}

const HAPPENED = new Set(["arrived", "in_progress", "completed"]);

/**
 * Отмена и неявка — «отменён»; пришёл, на приёме, завершён — «был» при любом
 * времени; остальное решает дата. Бэк приёмы не закрывает, поэтому прошедший
 * «Ожидаем» — тоже «был».
 */
export function visitPhase(appt: Pick<DjangoAppointment, "status" | "scheduledAt">, now: Dayjs = dayjs()): VisitPhase {
  if (appt.status === "canceled" || appt.status === "no_show") return "cancelled";
  if (HAPPENED.has(appt.status)) return "past";
  return dayjs(appt.scheduledAt).isAfter(now) ? "upcoming" : "past";
}

/** Врачи приёма без повторов: по строкам услуг, у старых записей — поле приёма. */
export function visitDoctors(appt: Pick<DjangoAppointment, "services" | "employee">): VisitDoctor[] {
  const seen = new Map<number, VisitDoctor>();
  for (const line of appt.services) {
    const employee = line.employee;
    if (employee && !seen.has(employee.id)) {
      seen.set(employee.id, { id: employee.id, name: employee.fullName, photoUrl: employee.photoUrl });
    }
  }
  if (!seen.size && appt.employee) {
    seen.set(appt.employee.id, { id: appt.employee.id, name: appt.employee.fullName, photoUrl: appt.employee.photoUrl });
  }
  return [...seen.values()];
}

export function visitServices(appt: Pick<DjangoAppointment, "services">): string[] {
  const names = appt.services.map((line) => line.service?.name?.trim() ?? "").filter(Boolean);
  return [...new Set(names)];
}

/** Заключение по строкам услуг: готово, черновик или нет. */
export function lineConclusionMark(appt: Pick<DjangoAppointment, "services">): ConclusionMark {
  let draft = false;
  for (const line of appt.services) {
    if (line.conclusionState === "completed" || (line.conclusionsCompleted ?? 0) > 0) return "done";
    if (line.conclusionState === "draft" || line.conclusionId != null) draft = true;
  }
  return draft ? "draft" : "none";
}

interface AppointmentConclusions {
  diagnoses: VisitDiagnosis[];
  mark: ConclusionMark;
}

/** Диагнозы и состояние заключений по приёмам — из медистории пациента. */
export function conclusionsByAppointment(rows: ReadonlyArray<PatientConclusionRow>): Map<number, AppointmentConclusions> {
  const map = new Map<number, AppointmentConclusions>();
  for (const row of rows) {
    const entry = map.get(row.appointmentId) ?? { diagnoses: [], mark: "none" as ConclusionMark };
    if (row.status === "completed") entry.mark = "done";
    else if (entry.mark === "none") entry.mark = "draft";
    for (const item of Array.isArray(row.diagnosisData) ? row.diagnosisData : []) {
      const code = String(item?.diagnosisCode ?? item?.diagnosis_code ?? "").trim();
      const title = String(item?.title ?? item?.displayName ?? "").trim();
      if (!code && !title) continue;
      if (entry.diagnoses.some((known) => known.code === code && known.title === title)) continue;
      entry.diagnoses.push({ code, title });
    }
    map.set(row.appointmentId, entry);
  }
  return map;
}

const MARK_RANK: Record<ConclusionMark, number> = { none: 0, draft: 1, done: 2 };

interface BuildOptions {
  birthDate: string | null;
  conclusions?: ReadonlyArray<PatientConclusionRow>;
  now?: Dayjs;
}

/** Лента приёмов книжки: от поздних к ранним, с возрастом и диагнозами. */
export function buildVisits(appointments: ReadonlyArray<DjangoAppointment>, options: BuildOptions): Visit[] {
  const now = options.now ?? dayjs();
  const byAppointment = conclusionsByAppointment(options.conclusions ?? []);
  return [...appointments]
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .map((appointment) => {
      const fromHistory = byAppointment.get(appointment.id);
      const lineMark = lineConclusionMark(appointment);
      const historyMark = fromHistory?.mark ?? "none";
      return {
        id: appointment.id,
        appointment,
        at: appointment.scheduledAt,
        phase: visitPhase(appointment, now),
        noShow: appointment.status === "no_show",
        doctors: visitDoctors(appointment),
        services: visitServices(appointment),
        age: ageLabel(options.birthDate, appointment.scheduledAt),
        diagnoses: fromHistory?.diagnoses ?? [],
        conclusion: MARK_RANK[historyMark] > MARK_RANK[lineMark] ? historyMark : lineMark,
      };
    });
}

export function visitCounts(visits: ReadonlyArray<Visit>): Record<VisitFilter, number> {
  const counts: Record<VisitFilter, number> = { all: visits.length, upcoming: 0, past: 0, cancelled: 0 };
  for (const visit of visits) counts[visit.phase] += 1;
  return counts;
}

export function filterVisits(visits: ReadonlyArray<Visit>, filter: VisitFilter, doctorId: number | null): Visit[] {
  return visits.filter(
    (visit) =>
      (filter === "all" || visit.phase === filter) &&
      (doctorId == null || visit.doctors.some((doctor) => doctor.id === doctorId)),
  );
}

export interface DoctorOption {
  id: number;
  name: string;
  count: number;
}

/** Врачи для фильтра: чаще встречающиеся выше. */
export function doctorOptions(visits: ReadonlyArray<Visit>): DoctorOption[] {
  const map = new Map<number, DoctorOption>();
  for (const visit of visits) {
    for (const doctor of visit.doctors) {
      const option = map.get(doctor.id) ?? { id: doctor.id, name: doctor.name, count: 0 };
      option.count += 1;
      map.set(doctor.id, option);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
}

export type TimelineItem =
  | { kind: "year"; key: string; year: number; count: number }
  | { kind: "today"; key: string }
  | { kind: "visit"; key: string; visit: Visit };

/**
 * Строки ленты: заголовок года при его смене и отметка «сегодня» между
 * будущими и прошедшими приёмами (только если есть и те и другие).
 */
export function timelineItems(visits: ReadonlyArray<Visit>, now: Dayjs = dayjs()): TimelineItem[] {
  const years = new Map<number, number>();
  for (const visit of visits) {
    const year = dayjs(visit.at).year();
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  const hasFuture = visits.some((visit) => dayjs(visit.at).isAfter(now));
  const hasPast = visits.some((visit) => !dayjs(visit.at).isAfter(now));
  const items: TimelineItem[] = [];
  const pushYear = (year: number) => items.push({ kind: "year", key: `year-${year}`, year, count: years.get(year) ?? 0 });
  let currentYear: number | null = null;
  let todayPlaced = !(hasFuture && hasPast);
  for (const visit of visits) {
    const at = dayjs(visit.at);
    if (!todayPlaced && !at.isAfter(now)) {
      // «Сегодня» стоит под заголовком своего года, если в нём есть приёмы.
      if (currentYear !== now.year() && years.has(now.year())) {
        pushYear(now.year());
        currentYear = now.year();
      }
      items.push({ kind: "today", key: "today" });
      todayPlaced = true;
    }
    if (at.year() !== currentYear) {
      pushYear(at.year());
      currentYear = at.year();
    }
    items.push({ kind: "visit", key: `visit-${visit.id}`, visit });
  }
  return items;
}

/** Отрезок линии ленты: будущее — пунктиром, прошлое — сплошной, края ленты — без линии. */
export type Segment = "none" | "solid" | "dashed";

/**
 * Линия ленты по строкам: всё до отметки «сегодня» — будущее (пунктир),
 * после — прошлое. Заголовок года берёт зону следующей за ним строки.
 */
export function railSegments(items: ReadonlyArray<TimelineItem>, now: Dayjs = dayjs()): Array<{ top: Segment; bottom: Segment }> {
  const future = new Array<boolean>(items.length).fill(false);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "visit") future[index] = dayjs(item.visit.at).isAfter(now);
    else if (item.kind === "today") future[index] = true;
    else future[index] = index + 1 < items.length && future[index + 1];
  }
  return items.map((_, index) => ({
    top: index === 0 ? "none" : future[index] ? "dashed" : "solid",
    bottom: index === items.length - 1 ? "none" : future[index + 1] ? "dashed" : "solid",
  }));
}

/** «сегодня», «завтра», «через 3 дня», «2 недели назад», «через 11 месяцев». */
export function relativeDay(at: string, now: Dayjs = dayjs()): string {
  const days = dayjs(at).startOf("day").diff(now.startOf("day"), "day");
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  const abs = Math.abs(days);
  let text: string;
  if (abs < 14) text = `${abs} ${pluralRu(abs, ["день", "дня", "дней"])}`;
  else if (abs < 60) {
    const weeks = Math.round(abs / 7);
    text = `${weeks} ${pluralRu(weeks, ["неделю", "недели", "недель"])}`;
  } else if (abs < 365) {
    const months = Math.max(2, Math.round(abs / 30.44));
    text = `${months} ${pluralRu(months, ["месяц", "месяца", "месяцев"])}`;
  } else {
    const years = Math.floor(abs / 365.25);
    text = years === 1 ? "год" : `${years} ${pluralRu(years, ["год", "года", "лет"])}`;
  }
  return days > 0 ? `через ${text}` : `${text} назад`;
}

export interface MonthActivity {
  key: string;
  label: string;
  title: string;
  count: number;
}

export interface VisitSummary {
  next: Visit | null;
  last: Visit | null;
  pastCount: number;
  cancelledCount: number;
  noShowCount: number;
  doctorsCount: number;
  firstAt: string | null;
  withConclusion: number;
  months: MonthActivity[];
}

const MONTH_LETTERS = ["Я", "Ф", "М", "А", "М", "И", "И", "А", "С", "О", "Н", "Д"];
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Месяц тремя буквами для колонки даты: у dayjs то «сент.», то «июнь». */
export function monthShort(at: string): string {
  return MONTH_SHORT[dayjs(at).month()];
}

/** «апреля 2025» — для «с апреля 2025». */
export function monthYearGenitive(at: string): string {
  const date = dayjs(at);
  return `${MONTH_GENITIVE[date.month()]} ${date.year()}`;
}

/** Сводка над лентой: ближайший и последний приём, итоги, приёмы по месяцам за год. */
export function visitSummary(visits: ReadonlyArray<Visit>, now: Dayjs = dayjs()): VisitSummary {
  const upcoming = visits.filter((visit) => visit.phase === "upcoming");
  const past = visits.filter((visit) => visit.phase === "past");
  const doctors = new Set<number>();
  for (const visit of past) for (const doctor of visit.doctors) doctors.add(doctor.id);
  const months: MonthActivity[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const month = now.subtract(back, "month");
    const count = past.filter((visit) => dayjs(visit.at).isSame(month, "month")).length;
    months.push({
      key: month.format("YYYY-MM"),
      label: MONTH_LETTERS[month.month()],
      title: `${month.format("MMMM YYYY")}: ${count} ${pluralRu(count, ["приём", "приёма", "приёмов"])}`,
      count,
    });
  }
  return {
    // Лента идёт от поздних к ранним: ближайший будущий — последний в своём списке.
    next: upcoming.length ? upcoming[upcoming.length - 1] : null,
    last: past[0] ?? null,
    pastCount: past.length,
    cancelledCount: visits.filter((visit) => visit.phase === "cancelled" && !visit.noShow).length,
    noShowCount: visits.filter((visit) => visit.noShow).length,
    doctorsCount: doctors.size,
    firstAt: past.length ? past[past.length - 1].at : null,
    withConclusion: past.filter((visit) => visit.conclusion === "done").length,
    months,
  };
}
