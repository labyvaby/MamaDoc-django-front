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
  outsideMinutes: number;
  /** Слоты смен по сетке «Окон» и сколько из них занято приёмами. */
  scheduleSlots: number;
  busySlots: number;
  /** Загрузка: приёмы в смену и сверх графика ÷ время по графику, % (бывает
   *  больше 100); null — в отрезке нет смен. */
  utilization: number | null;
}

type Point = Pick<DayPoint, "count" | "scheduleMinutes" | "busyMinutes"> & {
  outsideMinutes?: number;
  scheduleSlots?: number;
  busySlots?: number;
};

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const COARSE_TO_FINE: LoadGranularity[] = ["monthly", "weekly", "daily", "hourly"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Загрузка: время приёмов ÷ время по графику, %. Больше 100 — работа сверх
 *  графика; null — смен нет, считать не от чего. */
export function loadPct(occupiedMinutes: number, scheduleMinutes: number): number | null {
  if (scheduleMinutes <= 0) return null;
  return Math.round((occupiedMinutes * 100) / scheduleMinutes);
}

/** Загрузка врача с учётом приёмов вне графика. */
export function employeeLoadPct(row: Pick<EmployeeLoad, "scheduleMinutes" | "busyMinutes" | "outsideMinutes">): number | null {
  return loadPct(row.busyMinutes + row.outsideMinutes, row.scheduleMinutes);
}

export interface LoadBarSegments {
  /** Ширина части «в смену», % ширины полосы. */
  inside: number;
  /** Ширина части «сверх графика», % ширины полосы. */
  outside: number;
  /** Где кончается график, % ширины полосы; null — загрузка не больше 100%. */
  marker: number | null;
}

/**
 * Полоса врача. До 100% шкала — время по графику: основной цвет — приёмы в
 * смену, следом оранжевый — сверх графика. Больше 100% — полоса заполнена
 * целиком, шкала растягивается до общей загрузки, а черта отмечает конец
 * графика.
 */
export function loadBarSegments(
  row: Pick<EmployeeLoad, "scheduleMinutes" | "busyMinutes" | "outsideMinutes">,
): LoadBarSegments {
  if (row.scheduleMinutes <= 0) return { inside: 0, outside: 0, marker: null };
  const inside = (row.busyMinutes * 100) / row.scheduleMinutes;
  const outside = (row.outsideMinutes * 100) / row.scheduleMinutes;
  const scale = Math.max(100, inside + outside);
  return {
    inside: (inside * 100) / scale,
    outside: (outside * 100) / scale,
    marker: inside + outside > 100 ? 10000 / scale : null,
  };
}

/** Самые загруженные сверху; без графика — в конце, по числу приёмов. */
export function sortByLoad(rows: EmployeeLoad[]): EmployeeLoad[] {
  const key = (r: EmployeeLoad) =>
    r.scheduleMinutes > 0 ? (r.busyMinutes + r.outsideMinutes) / r.scheduleMinutes : -1;
  return [...rows].sort(
    (a, b) => key(b) - key(a) || b.appointments - a.appointments || a.fullName.localeCompare(b.fullName, "ru"),
  );
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
  // ?? 0 — бэк без поля (выложен позже фронта) не должен давать NaN.
  const outsideMinutes = points.reduce((s, p) => s + (p.outsideMinutes ?? 0), 0);
  const scheduleSlots = points.reduce((s, p) => s + (p.scheduleSlots ?? 0), 0);
  const busySlots = points.reduce((s, p) => s + (p.busySlots ?? 0), 0);
  return {
    label,
    title,
    count,
    scheduleMinutes,
    busyMinutes,
    outsideMinutes,
    scheduleSlots,
    busySlots,
    utilization: loadPct(busyMinutes + outsideMinutes, scheduleMinutes),
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
export function outsideShare(outsideMinutes: number, scheduleMinutes: number): string {
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

/** «2 из 2 слотов», «1 из 1 слота», «5 из 21 слота». */
export function slotsLabel(busy: number, total: number): string {
  const mod10 = total % 10;
  const mod100 = total % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "слота" : "слотов";
  return `${busy} из ${total} ${word}`;
}

/** Минуты от полуночи → «09:30»; 1440 → «24:00». */
export function formatClock(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export interface ScheduleBand {
  x1: string;
  x2: string;
  label: string;
}

/**
 * Полоса смены на почасовом графике: от часа начала до часа конца (часы —
 * подписи оси), подпись с точным временем. null — смен нет или их часы вне
 * окна графика.
 */
export function scheduleBand(
  span: { startMinute: number; endMinute: number } | null | undefined,
  buckets: LoadBucket[],
): ScheduleBand | null {
  if (!span || buckets.length === 0) return null;
  const hours = buckets.map((b) => Number(b.label.slice(0, 2)));
  const first = hours[0];
  const last = hours[hours.length - 1];
  const startHour = Math.max(first, Math.floor(span.startMinute / 60));
  const endHour = Math.min(last, Math.ceil(span.endMinute / 60));
  if (startHour >= endHour) return null;
  return {
    x1: `${pad(startHour)}:00`,
    x2: `${pad(endHour)}:00`,
    label: `График ${formatClock(span.startMinute)}–${formatClock(span.endMinute)}`,
  };
}
