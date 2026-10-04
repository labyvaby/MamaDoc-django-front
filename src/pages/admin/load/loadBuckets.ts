import dayjs, { type Dayjs } from "dayjs";

import type { DayPoint, EmployeeLoad, HourPoint } from "../../../api/load";

export type LoadGranularity = "hourly" | "daily" | "weekly" | "monthly";
export type LoadMetric = "count" | "utilization";

/** Один отрезок графика: час дня, день, неделя или месяц. */
export interface LoadBucket {
  label: string;
  title: string;
  count: number;
  scheduleMinutes: number;
  busyMinutes: number;
  /** Загрузка по графику 0–100; null — в отрезке нет смен. */
  utilization: number | null;
}

type Point = Pick<DayPoint, "count" | "scheduleMinutes" | "busyMinutes">;

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const COARSE_TO_FINE: LoadGranularity[] = ["monthly", "weekly", "daily", "hourly"];

const pad = (n: number) => String(n).padStart(2, "0");

export function utilizationPct(busyMinutes: number, scheduleMinutes: number): number | null {
  if (scheduleMinutes <= 0) return null;
  return Math.min(100, Math.round((busyMinutes * 100) / scheduleMinutes));
}

/** Минуты → часы для подписи: «47», «12,5», «1 457». */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  // От 100 ч десятые только мешают читать и не влезают в плитку сводки.
  const rounded = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return rounded.toLocaleString("ru-RU");
}

/** Разбивки, которые имеют смысл для периода. */
export function availableGranularities(from: Dayjs, to: Dayjs): LoadGranularity[] {
  const days = to.startOf("day").diff(from.startOf("day"), "day") + 1;
  const out: LoadGranularity[] = ["hourly"];
  if (days > 1) out.push("daily");
  if (days > 7) out.push("weekly");
  if (days > 7 && !from.isSame(to, "month")) out.push("monthly");
  return out;
}

/** Выбранная разбивка, если доступна, иначе ближайшая более мелкая. */
export function fitGranularity(current: LoadGranularity, available: LoadGranularity[]): LoadGranularity {
  return COARSE_TO_FINE.slice(COARSE_TO_FINE.indexOf(current)).find((g) => available.includes(g)) ?? "hourly";
}

/** Окно часов: рабочие 8–20, расширенные до часов с приёмами или сменами. */
export function hourWindow(hourly: HourPoint[]): [number, number] {
  const active = hourly.filter((h) => h.count > 0 || h.scheduleMinutes > 0).map((h) => h.hour);
  if (active.length === 0) return [8, 20];
  return [Math.min(8, ...active), Math.max(20, ...active)];
}

function toBucket(label: string, title: string, points: Point[]): LoadBucket {
  const count = points.reduce((s, p) => s + p.count, 0);
  const scheduleMinutes = points.reduce((s, p) => s + p.scheduleMinutes, 0);
  const busyMinutes = points.reduce((s, p) => s + p.busyMinutes, 0);
  return {
    label,
    title,
    count,
    scheduleMinutes,
    busyMinutes,
    utilization: utilizationPct(busyMinutes, scheduleMinutes),
  };
}

/** Разложить дни по группам с сохранением порядка. */
function groupDays(daily: DayPoint[], keyOf: (d: Dayjs) => string): DayPoint[][] {
  const groups = new Map<string, DayPoint[]>();
  for (const p of daily) {
    const key = keyOf(dayjs(p.date));
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

export function buildBuckets(granularity: LoadGranularity, hourly: HourPoint[], daily: DayPoint[]): LoadBucket[] {
  if (granularity === "hourly") {
    const [lo, hi] = hourWindow(hourly);
    return hourly
      .filter((h) => h.hour >= lo && h.hour <= hi)
      .map((h) => {
        const label = `${pad(h.hour)}:00`;
        return toBucket(label, `Время: ${label}`, [h]);
      });
  }
  if (granularity === "daily") {
    return daily.map((p) => {
      const label = dayjs(p.date).format("DD.MM");
      return toBucket(label, `Дата: ${label}`, [p]);
    });
  }
  if (granularity === "weekly") {
    // Неделя — с понедельника; dayjs().day(): 0 = воскресенье.
    return groupDays(daily, (d) => d.subtract((d.day() + 6) % 7, "day").format("YYYY-MM-DD")).map((days) => {
      const first = dayjs(days[0].date).format("DD.MM");
      const last = dayjs(days[days.length - 1].date).format("DD.MM");
      const label = first === last ? first : `${first}–${last}`;
      return toBucket(label, `Неделя: ${label}`, days);
    });
  }
  return groupDays(daily, (d) => d.format("YYYY-MM")).map((days) => {
    const d = dayjs(days[0].date);
    const label = `${MONTHS[d.month()]} ${d.year()}`;
    return toBucket(label, `Месяц: ${label}`, days);
  });
}

/**
 * Приёмы вне графика — в процентах от времени по графику, чтобы сравнивать
 * врачей с разной длиной смен (может быть больше 100%). Без графика процент
 * не от чего — тогда часы.
 */
function outsideShare(outsideMinutes: number, scheduleMinutes: number): string {
  if (scheduleMinutes <= 0) return `${formatHours(outsideMinutes)} ч`;
  const pct = (outsideMinutes * 100) / scheduleMinutes;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

/** Подпись под полоской врача: только части, по которым есть данные. */
export function employeeMeta(row: EmployeeLoad, countLabel: string): string {
  const parts = [countLabel];
  if (row.scheduleMinutes > 0) {
    parts.push(`${formatHours(row.busyMinutes)} из ${formatHours(row.scheduleMinutes)} ч`);
  }
  if (row.attendanceUtilizationPct != null) parts.push(`СКУД ${row.attendanceUtilizationPct}%`);
  if (row.outsideMinutes > 0) parts.push(`+${outsideShare(row.outsideMinutes, row.scheduleMinutes)} вне графика`);
  return parts.join(" · ");
}
