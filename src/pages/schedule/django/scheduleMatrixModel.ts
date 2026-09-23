import dayjs, { type Dayjs } from "dayjs";
import type {
  ScheduleException,
  ScheduleExceptionKind,
  ScheduleRule,
} from "../../../api/scheduling";
import { pluralRu } from "../../../utility/amountInWords";
import { computeDayOccurrences, isAbsenceKind, type DayOccurrence } from "./occurrences";
import { WEEKDAY_SHORT, type EmployeeSchedule, type ExceptionItem } from "./scheduleSettingsModel";

/**
 * Модель недельной матрицы вкладки «Настройка»: ячейки дня по сотрудникам,
 * одна главная проблема сотрудника, пресеты срока формы графика и дни работы
 * для плашки влияния отсутствия. Всё из уже загруженных правил и исключений.
 */

/** Сотрудник, для которого открыта панель или форма. */
export type EmployeeRef = { id: number; fullName: string };

export function pluralDays(n: number): string {
  return pluralRu(n, ["день", "дня", "дней"]);
}

export function pluralVisits(n: number): string {
  return pluralRu(n, ["запись", "записи", "записей"]);
}

/** dayjs считает 0=Вс, а бэкенд расписания — 0=Пн. */
function weekdayOf(date: string | Dayjs): number {
  return (dayjs(date).day() + 6) % 7;
}

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(date: Dayjs): Dayjs {
  return date.startOf("day").subtract(weekdayOf(date), "day");
}

const dm = (d: string) => dayjs(d).format("DD.MM");

/** «09:00» → «09», «15:30» остаётся: в тесной ячейке нули минут — шум. */
export function hh(time: string): string {
  return time.endsWith(":00") ? time.slice(0, 2) : time;
}

/** «Фамилия Имя» — отчество в тесной колонке не помещается. */
export function shortName(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(0, 2).join(" ");
}

// ── Ячейки недели ─────────────────────────────────────────────────────────────

const WEEKDAY_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

/**
 * Ячейка дня в матрице:
 * - `shift` — смена по недельному правилу (плашка в тон акцента);
 * - `oneoff` — только разовая смена или замена (пунктир);
 * - `absence` — выходной/отпуск на весь день;
 * - `empty` — смены нет.
 */
export interface DayCell {
  variant: "shift" | "oneoff" | "absence" | "empty";
  /** Первая строка: «09–17», «09–13 · 15–18», «Отпуск», «—». */
  label: string;
  /** Вторая строка: «обед 13», «разово», «замена». */
  sub: string | null;
  /** Телефон: «09\n17» / «отп.» — ячейка шириной в седьмую часть экрана. */
  compact: string;
  /** Полная подпись для скринридера. */
  aria: string;
}

function emptyCell(weekStart: Dayjs, d: number): DayCell {
  return {
    variant: "empty",
    label: "—",
    sub: null,
    compact: "",
    aria: `${WEEKDAY_FULL[d]} ${weekStart.add(d, "day").format("DD.MM")}: смены нет`,
  };
}

/**
 * Ячейки недели по сотрудникам: `Map<employeeId, DayCell[7]>` (Пн…Вс).
 * Смены дня — из computeDayOccurrences, той же логики, что у календаря: отпуск
 * гасит правило, замена подменяет, частичное отсутствие режет смену.
 * Сотрудника без смен и отсутствий в неделе в карте нет — см. `cellsOf`.
 */
export function buildWeekCells(
  weekStart: Dayjs,
  rules: ScheduleRule[],
  exceptions: ScheduleException[],
): Map<number, DayCell[]> {
  const result = new Map<number, DayCell[]>();
  for (let i = 0; i < 7; i += 1) {
    const day = weekStart.add(i, "day");
    const date = day.format("YYYY-MM-DD");
    const ariaDay = `${WEEKDAY_FULL[i]} ${day.format("DD.MM")}`;

    const byEmployee = new Map<number, DayOccurrence[]>();
    for (const occ of computeDayOccurrences(day, rules, exceptions)) {
      const list = byEmployee.get(occ.employeeId) ?? [];
      list.push(occ);
      byEmployee.set(occ.employeeId, list);
    }
    const absences = new Map<number, ScheduleExceptionKind>();
    for (const exc of exceptions) {
      if (exc.date !== date || !isAbsenceKind(exc.kind) || exc.startTime) continue;
      // Отпуск важнее выходного, если в один день стоят оба.
      if (absences.get(exc.employeeId) !== "vacation") absences.set(exc.employeeId, exc.kind);
    }

    for (const id of new Set([...byEmployee.keys(), ...absences.keys()])) {
      let row = result.get(id);
      if (!row) {
        row = Array.from({ length: 7 }, (_, d) => emptyCell(weekStart, d));
        result.set(id, row);
      }
      const absence = absences.get(id);
      if (absence) {
        const label = absence === "vacation" ? "Отпуск" : "Выходной";
        row[i] = {
          variant: "absence",
          label,
          sub: null,
          compact: absence === "vacation" ? "отп." : "вых.",
          aria: `${ariaDay}: ${label.toLowerCase()}`,
        };
        continue;
      }
      const occs = [...(byEmployee.get(id) ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
      if (occs.length === 0) continue;
      const byRule = occs.some((o) => o.kind === "rule");
      const lunch = occs.find((o) => o.lunch)?.lunch ?? null;
      const sub = byRule
        ? lunch
          ? `обед ${hh(lunch.start)}`
          : null
        : occs.some((o) => o.kind === "override")
          ? "замена"
          : "разово";
      row[i] = {
        variant: byRule ? "shift" : "oneoff",
        label: occs.map((o) => `${hh(o.startTime)}–${hh(o.endTime)}`).join(" · "),
        sub,
        compact: `${hh(occs[0].startTime)}\n${hh(occs[occs.length - 1].endTime)}`,
        aria:
          `${ariaDay}: ${occs.map((o) => `${o.startTime}–${o.endTime}`).join(", ")}` +
          (lunch ? `, обед ${lunch.start}–${lunch.end}` : "") +
          (byRule ? "" : `, ${sub}`),
      };
    }
  }
  return result;
}

/** Ячейки сотрудника; у кого в неделе нет ни смен, ни отсутствий — все пустые. */
export function cellsOf(cells: Map<number, DayCell[]>, employeeId: number, weekStart: Dayjs): DayCell[] {
  return cells.get(employeeId) ?? Array.from({ length: 7 }, (_, d) => emptyCell(weekStart, d));
}

// ── Исключения: подписи ──────────────────────────────────────────────────────

const KIND_TITLE: Record<ScheduleExceptionKind, string> = {
  day_off: "Выходной",
  vacation: "Отпуск",
  extra: "Разовая смена",
  override: "Замена смены",
};

export function exceptionKindTitle(kind: ScheduleExceptionKind): string {
  return KIND_TITLE[kind];
}

/** «25.09, пт» для дня, «06.10 – 19.10» для периода. */
export function exceptionWhen(item: Pick<ExceptionItem, "dateFrom" | "dateTo">): string {
  return item.dateFrom === item.dateTo
    ? `${dm(item.dateFrom)}, ${WEEKDAY_SHORT[weekdayOf(item.dateFrom)].toLowerCase()}`
    : `${dm(item.dateFrom)} – ${dm(item.dateTo)}`;
}

/** «14 дней» / «10:00–14:00» / «весь день» + комментарий. */
export function exceptionDetails(item: ExceptionItem): string {
  const days = dayjs(item.dateTo).diff(dayjs(item.dateFrom), "day") + 1;
  const span = item.startTime
    ? `${item.startTime}–${item.endTime}`
    : days > 1
      ? `${days} ${pluralDays(days)}`
      : isAbsenceKind(item.kind)
        ? "весь день"
        : "";
  return [span, item.comment].filter(Boolean).join(" · ");
}

// ── Проблемы сотрудника ──────────────────────────────────────────────────────

export type IssueTone = "error" | "warning" | "neutral";

export type IssueAction =
  | { kind: "review"; exception: ScheduleException }
  | { kind: "extend"; rule: ScheduleRule }
  | { kind: "create" };

export interface EmployeeIssue {
  tone: IssueTone;
  text: string;
  actionLabel: string;
  action: IssueAction;
}

/**
 * Одна главная проблема сотрудника — по приоритету: записи без разбора в днях
 * отсутствия → график заканчивается без продолжения → графика нет.
 */
export function employeeIssue(
  s: EmployeeSchedule,
  conflictsFor: (item: ExceptionItem) => number,
): EmployeeIssue | null {
  for (const item of s.exceptions) {
    if (!isAbsenceKind(item.kind)) continue;
    const n = conflictsFor(item);
    if (n === 0) continue;
    const range =
      item.dateFrom === item.dateTo ? dm(item.dateFrom) : `${dm(item.dateFrom)}–${dm(item.dateTo)}`;
    return {
      tone: "error",
      text: `${KIND_TITLE[item.kind]} ${range}: ${n} ${pluralVisits(n)} пациентов без разбора`,
      actionLabel: "Разобрать",
      action: { kind: "review", exception: item.days[0] },
    };
  }
  if (s.expiring && s.latestRule && s.until) {
    return {
      tone: "warning",
      text: `График заканчивается ${dm(s.until)} — после этого окон для записи не будет`,
      actionLabel: "Продлить на год",
      action: { kind: "extend", rule: s.latestRule },
    };
  }
  if (s.noActiveRules) {
    return {
      tone: "neutral",
      text: "Графика нет — записаться к врачу нельзя",
      actionLabel: "Задать график",
      action: { kind: "create" },
    };
  }
  return null;
}

/** Порядок строк: error → warning → без проблем → без графика. */
export function issueRank(issue: EmployeeIssue | null): number {
  if (!issue) return 2;
  return issue.tone === "error" ? 0 : issue.tone === "warning" ? 1 : 3;
}

// ── Форма графика ────────────────────────────────────────────────────────────

export type RuleFormMode = "create" | "edit" | "extend";

/**
 * Пресеты срока. В create/edit отсчёт от начала действия (минус день: «3 мес»
 * с 01.10 — это по 31.12), в extend — от старого конца (продлеваем «на» срок).
 */
export function periodPresets(base: string, mode: RuleFormMode): { label: string; value: string }[] {
  const from = dayjs(base);
  const shift = (months: number) => {
    const d = from.add(months, "month");
    return (mode === "extend" ? d : d.subtract(1, "day")).format("YYYY-MM-DD");
  };
  const presets = [
    { label: "3 мес", value: shift(3) },
    { label: "6 мес", value: shift(6) },
    { label: "1 год", value: shift(12) },
  ];
  const endOfYear = `${from.year()}-12-31`;
  if (endOfYear > base) presets.splice(2, 0, { label: "До конца года", value: endOfYear });
  return presets;
}

/**
 * Дни с работой по графику в диапазоне — для плашки влияния в форме
 * отсутствия. Считаем той же computeDayOccurrences, что и календарь.
 */
export function workingDaysInRange(
  employeeId: number,
  from: string,
  to: string,
  rules: ScheduleRule[],
  exceptions: ScheduleException[],
): string[] {
  if (from > to) return [];
  const own = rules.filter((r) => r.employeeId === employeeId && r.dateTo >= from && r.dateFrom <= to);
  if (own.length === 0) return [];
  const ownExc = exceptions.filter((e) => e.employeeId === employeeId);
  const result: string[] = [];
  const end = dayjs(to);
  // Потолок — год с запасом: длиннее период форма всё равно не сохранит.
  for (let d = dayjs(from), n = 0; !d.isAfter(end, "day") && n < 367; d = d.add(1, "day"), n += 1) {
    if (computeDayOccurrences(d, own, ownExc).length > 0) result.push(d.format("YYYY-MM-DD"));
  }
  return result;
}
