import dayjs from "dayjs";
import type {
  ScheduleException,
  ScheduleExceptionKind,
  ScheduleRule,
} from "../../../api/scheduling";
import { isAbsenceKind } from "./occurrences";

/**
 * Модель вкладки «Настройка» расписания: правила и исключения, собранные в
 * карточку сотрудника. Раньше это были две плоские таблицы, где у врача с тремя
 * правилами имя повторялось трижды, а его отпуск жил в другой таблице ниже.
 * Всё считается на фронте из уже загруженных правил/исключений — новых ручек нет.
 */

/** За сколько дней до конца правила предупреждать, что график заканчивается. */
export const RULE_EXPIRING_DAYS = 30;

export type RuleStatus = "active" | "expiring" | "upcoming" | "ended";

/** Минуты «ЧЧ:ММ» от полуночи. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Рабочих минут в одной смене правила — без обеда. */
export function ruleShiftMinutes(rule: Pick<ScheduleRule, "startTime" | "endTime" | "lunchStart" | "lunchEnd">): number {
  const shift = toMinutes(rule.endTime) - toMinutes(rule.startTime);
  const lunch =
    rule.lunchStart && rule.lunchEnd ? toMinutes(rule.lunchEnd) - toMinutes(rule.lunchStart) : 0;
  return Math.max(0, shift - Math.max(0, lunch));
}

/** Рабочих минут в неделю по правилу. */
export function ruleWeeklyMinutes(rule: ScheduleRule): number {
  return ruleShiftMinutes(rule) * new Set(rule.weekdays).size;
}

/**
 * Статус правила на дату `today` (YYYY-MM-DD). «Истекает» — действует, но
 * заканчивается в ближайшие RULE_EXPIRING_DAYS дней: именно тогда у врача
 * внезапно пропадают окна на витрине, если никто не продлил график.
 */
export function ruleStatus(rule: ScheduleRule, today: string): RuleStatus {
  if (rule.dateTo < today) return "ended";
  if (rule.dateFrom > today) return "upcoming";
  const left = dayjs(rule.dateTo).diff(dayjs(today), "day");
  return left <= RULE_EXPIRING_DAYS ? "expiring" : "active";
}

/** Сколько дней осталось до конца правила включительно (0 — последний день). */
export function ruleDaysLeft(rule: ScheduleRule, today: string): number {
  return dayjs(rule.dateTo).diff(dayjs(today), "day");
}

/** dayjs считает 0=Вс, а бэкенд расписания — 0=Пн. */
function ruleWeekdayOf(date: string): number {
  return (dayjs(date).day() + 6) % 7;
}

/**
 * Исключение в карточке. Период отсутствия, поставленный одной пачкой (общий
 * groupId), показывается одной строкой «Отпуск 01.10–14.10», а не 14 строками.
 */
export interface ExceptionItem {
  key: string;
  kind: ScheduleExceptionKind;
  dateFrom: string;
  dateTo: string;
  startTime: string | null;
  endTime: string | null;
  comment: string;
  branchName: string | null;
  groupId: string | null;
  /** Дни пачки по возрастанию даты (у одиночного — один). */
  days: ScheduleException[];
}

export function groupExceptions(exceptions: ScheduleException[]): ExceptionItem[] {
  const items: ExceptionItem[] = [];
  const byGroup = new Map<string, ExceptionItem>();
  const sorted = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));
  for (const exc of sorted) {
    const groupId = exc.groupId ?? null;
    if (groupId) {
      const existing = byGroup.get(groupId);
      if (existing) {
        existing.days.push(exc);
        existing.dateTo = exc.date;
        continue;
      }
    }
    const item: ExceptionItem = {
      key: groupId ? `g:${groupId}` : `e:${exc.id}`,
      kind: exc.kind,
      dateFrom: exc.date,
      dateTo: exc.date,
      startTime: exc.startTime,
      endTime: exc.endTime,
      comment: exc.comment,
      branchName: exc.branchName,
      groupId,
      days: [exc],
    };
    if (groupId) byGroup.set(groupId, item);
    items.push(item);
  }
  return items;
}

export interface EmployeeSchedule {
  employeeId: number;
  employeeName: string;
  /** Правила: сначала действующие, потом будущие, закончившиеся в конце. */
  rules: ScheduleRule[];
  exceptions: ExceptionItem[];
  /** Рабочих минут в неделю по правилам, действующим сегодня. */
  weeklyMinutes: number;
  worksToday: boolean;
  absentToday: boolean;
  /**
   * График заканчивается в ближайшие RULE_EXPIRING_DAYS дней, и продолжения
   * (правила, которое действует дольше) нет — пора продлевать.
   */
  expiring: boolean;
  /** Ни одного действующего или будущего правила. */
  noActiveRules: boolean;
  /** Действующие и будущие правила (без закончившихся). */
  liveRules: ScheduleRule[];
  /** Самый поздний конец среди действующих и будущих правил — «действует до». */
  until: string | null;
  /** Правило с этим концом — его и продлевает «Продлить на год». */
  latestRule: ScheduleRule | null;
}

const STATUS_ORDER: Record<RuleStatus, number> = { expiring: 0, active: 0, upcoming: 1, ended: 2 };

export function buildEmployeeSchedules(
  rules: ScheduleRule[],
  exceptions: ScheduleException[],
  today: string,
  /** Сотрудники без единого правила/исключения — чтобы показать «графика нет». */
  extraEmployees: { id: number; fullName: string }[] = [],
): EmployeeSchedule[] {
  const map = new Map<number, { name: string; rules: ScheduleRule[]; exceptions: ScheduleException[] }>();
  const bucket = (id: number, name: string) => {
    let b = map.get(id);
    if (!b) {
      b = { name, rules: [], exceptions: [] };
      map.set(id, b);
    }
    return b;
  };
  for (const r of rules) bucket(r.employeeId, r.employeeName).rules.push(r);
  for (const e of exceptions) bucket(e.employeeId, e.employeeName).exceptions.push(e);
  for (const emp of extraEmployees) bucket(emp.id, emp.fullName);

  const todayWeekday = ruleWeekdayOf(today);
  const result: EmployeeSchedule[] = [];
  for (const [employeeId, b] of map) {
    const statuses = new Map(b.rules.map((r) => [r.id, ruleStatus(r, today)]));
    const sortedRules = [...b.rules].sort(
      (x, y) =>
        STATUS_ORDER[statuses.get(x.id)!] - STATUS_ORDER[statuses.get(y.id)!] ||
        x.dateFrom.localeCompare(y.dateFrom) ||
        x.startTime.localeCompare(y.startTime),
    );
    const current = b.rules.filter((r) => {
      const s = statuses.get(r.id);
      return s === "active" || s === "expiring";
    });
    const todays = b.exceptions.filter((e) => e.date === today);
    const absentToday = todays.some((e) => isAbsenceKind(e.kind));
    const workingException = todays.some((e) => e.kind === "extra" || e.kind === "override");
    const worksByRule = current.some((r) => r.weekdays.includes(todayWeekday));
    // Отсутствие на часть дня (есть интервал) рабочий день не отменяет.
    const fullDayAbsent = todays.some((e) => isAbsenceKind(e.kind) && !e.startTime);
    const liveRules = sortedRules.filter((r) => statuses.get(r.id) !== "ended");
    const latestRule = liveRules.reduce<ScheduleRule | null>(
      (best, r) => (best === null || r.dateTo > best.dateTo ? r : best),
      null,
    );
    const latestEnd = latestRule?.dateTo ?? null;

    result.push({
      employeeId,
      employeeName: b.name,
      rules: sortedRules,
      exceptions: groupExceptions(b.exceptions),
      weeklyMinutes: current.reduce((sum, r) => sum + ruleWeeklyMinutes(r), 0),
      worksToday: (worksByRule || workingException) && !fullDayAbsent,
      absentToday,
      expiring:
        latestEnd !== null &&
        dayjs(latestEnd).diff(dayjs(today), "day") <= RULE_EXPIRING_DAYS,
      noActiveRules: latestEnd === null,
      liveRules,
      until: latestEnd,
      latestRule,
    });
  }
  // Сотрудники без графика — в конце: у филиала их бывает большинство
  // (администраторы, уволенные из графика), и они хоронили рабочие карточки.
  return result.sort(
    (a, b) =>
      Number(a.noActiveRules) - Number(b.noActiveRules) ||
      a.employeeName.localeCompare(b.employeeName, "ru"),
  );
}

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Дни правила коротко: подряд идущие схлопываются в диапазон — «Пн–Пт»,
 * «Пн–Ср, Пт», а не «Пн, Вт, Ср, Чт, Пт».
 */
export function weekdaysShort(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1;
    // Два соседних дня — через запятую: «Сб, Вс» читается лучше, чем «Сб–Вс».
    if (j - i >= 2) parts.push(`${WEEKDAY_SHORT[days[i]]}–${WEEKDAY_SHORT[days[j]]}`);
    else for (let k = i; k <= j; k += 1) parts.push(WEEKDAY_SHORT[days[k]]);
    i = j + 1;
  }
  return parts.join(", ");
}

/** «38 ч» / «37,5 ч» — без лишних нулей. */
export function formatWeeklyHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${String(hours).replace(".", ",")} ч`;
}
