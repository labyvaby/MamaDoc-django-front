import type {
  ProfessionalScheduleBranch,
  ProfessionalScheduleException,
  ProfessionalScheduleRule,
} from "../../../api/publicBooking";

/**
 * Разбор расписания из GET /professionals/<id>/schedule/ в строки для пациента.
 *
 * ⚠ Нумерация дней недели у бэка своя: 0 — понедельник, 6 — воскресенье
 * (у JS Date 0 — воскресенье). Сверено с окнами на проде 28.08.2026.
 */

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** "09:00:00" и "09:00" → "09:00". Бэк отдаёт короткую форму, но не гарантирует. */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** Интервал времени: "09:00 – 18:00". */
export function timeRange(from: string, to: string): string {
  return `${hhmm(from)} – ${hhmm(to)}`;
}

/**
 * Дни недели человеку: «Ежедневно», «Пн – Пт», «Пн, Ср, Пт».
 * Три и больше подряд сворачиваются в диапазон, остальное перечисляется.
 */
export function weekdaysLabel(weekdays: number[], everydayLabel: string): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!days.length) return "";
  if (days.length === 7) return everydayLabel;

  const groups: number[][] = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && day === last[last.length - 1] + 1) last.push(day);
    else groups.push([day]);
  }
  return groups
    .map((g) =>
      g.length >= 3
        ? `${WEEKDAY_SHORT[g[0]]} – ${WEEKDAY_SHORT[g[g.length - 1]]}`
        : g.map((d) => WEEKDAY_SHORT[d]).join(", "),
    )
    .join(", ");
}

/** Правило одной строкой: «Пн, Ср, Пт · 09:00 – 18:00». Перерыв — отдельно. */
export function ruleLabel(rule: ProfessionalScheduleRule, everydayLabel: string): string {
  const days = weekdaysLabel(rule.weekdays, everydayLabel);
  const time = timeRange(rule.startTime, rule.endTime);
  return days ? `${days} · ${time}` : time;
}

/** Перерыв правила или null, если его нет. */
export function lunchRange(rule: ProfessionalScheduleRule): string | null {
  return rule.lunchStart && rule.lunchEnd ? timeRange(rule.lunchStart, rule.lunchEnd) : null;
}

/**
 * Исключения, которые ещё впереди, по возрастанию даты.
 * `today` — YYYY-MM-DD; сравниваем строками, чтобы не ловить таймзону.
 */
export function upcomingExceptions(
  exceptions: ProfessionalScheduleException[],
  today: string,
  limit = 3,
): ProfessionalScheduleException[] {
  return exceptions
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** «5 сент» — короткая дата для чипа исключения. */
export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00`)
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(".", "");
}

/**
 * Есть ли в филиале хоть какое-то рабочее время. Филиал приходит и вовсе без
 * графика — значит записать туда формально можно, но времени в нём не задано,
 * и предлагать его первым нельзя.
 */
export function branchHasSchedule(branch: ProfessionalScheduleBranch): boolean {
  return (
    branch.rules.length > 0 ||
    branch.exceptions.some((e) => e.kind === "extra" || e.kind === "override")
  );
}
