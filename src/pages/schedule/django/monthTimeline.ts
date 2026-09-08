import type { DayOccurrence } from "./occurrences";

/**
 * Геометрия и упаковка мини-таймлайна месячной ячейки календаря
 * (портировано из ветки redesigned-calendar). Чистая логика без JSX —
 * рендер дорожек живёт в ScheduleCalendar (MonthLane / renderMonthCell).
 */

// Рабочее окно 07:00–22:00; смены вне окна клампятся к краям (см. packIntoLanes).
export const MONTH_DAY_START_MIN = 7 * 60;
export const MONTH_DAY_END_MIN = 22 * 60;
export const MONTH_DAY_WINDOW = MONTH_DAY_END_MIN - MONTH_DAY_START_MIN;

// Опорные часы — вертикальные направляющие внутри ячейки.
export const HOUR_GUIDES = [9, 12, 15, 18] as const;
// Почасовые слоты для полосы загрузки: 07..21.
export const OCCUPANCY_HOURS = Array.from({ length: 15 }, (_, i) => 7 + i);

export const MONTH_CELL_HEIGHT = 184;
/** Высота хедера ячейки (номер дня + счётчик) — дорожки начинаются ниже. */
export const MONTH_CELL_HEAD_H = 28;
/** Высота одной дорожки-«кабинета». */
export const LANE_H = 22;
/** Больше дорожек сворачиваем в «+N». */
export const MAX_LANES = 5;

/** Минимальная видимая ширина сегмента, минут (чтобы смена не пропадала с таймлайна). */
export const MONTH_MIN_SEG_MIN = 20;

export const clampMin = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** "HH:MM" → минуты от полуночи (по умолчанию — начало окна). */
export const occMinutes = (t: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(t);
  if (!m) return MONTH_DAY_START_MIN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

/** Минута → позиция слева в % (07:00 → 0%, 22:00 → 100%). */
export const timeToLeftPct = (min: number): number =>
  ((clampMin(min, MONTH_DAY_START_MIN, MONTH_DAY_END_MIN) - MONTH_DAY_START_MIN) /
    MONTH_DAY_WINDOW) *
  100;

export interface LaneSegment {
  occ: DayOccurrence;
  startMin: number;
  endMin: number;
}

export interface PackedLane {
  segments: LaneSegment[];
  lastEndMin: number;
}

/** Отрезок шкалы в минутах от полуночи. */
export interface MinuteSpan {
  startMin: number;
  endMin: number;
}

/**
 * Обед сегмента в координатах шкалы, обрезанный по его границам.
 * null — обеда нет либо он целиком вне нарисованного куска смены
 * (смена прижата к краю окна, а перерыв остался снаружи).
 */
export function segmentLunch(seg: LaneSegment): MinuteSpan | null {
  if (!seg.occ.lunch) return null;
  const startMin = Math.max(occMinutes(seg.occ.lunch.start), seg.startMin);
  const endMin = Math.min(occMinutes(seg.occ.lunch.end), seg.endMin);
  return endMin > startMin ? { startMin, endMin } : null;
}

/**
 * Рабочие куски сегмента: обед разрывает полосу на «до» и «после».
 *
 * Полоса рисуется отрезками, а перерыв остаётся пустотой — на линии видно
 * ровно то время, когда сотрудник работает (просьба заказчика 03.09.2026).
 * Обед, примыкающий к краю смены, оставляет один кусок; съевший её целиком —
 * отдаёт сегмент как есть, иначе смена пропала бы со шкалы.
 */
export function segmentWorkSpans(seg: LaneSegment): MinuteSpan[] {
  const whole = { startMin: seg.startMin, endMin: seg.endMin };
  const lunch = segmentLunch(seg);
  if (!lunch) return [whole];
  const spans: MinuteSpan[] = [];
  if (lunch.startMin > seg.startMin) spans.push({ startMin: seg.startMin, endMin: lunch.startMin });
  if (lunch.endMin < seg.endMin) spans.push({ startMin: lunch.endMin, endMin: seg.endMin });
  return spans.length > 0 ? spans : [whole];
}

/** Окно, в котором раскладываются смены. По умолчанию — месячное 07:00–22:00. */
export interface LaneWindow {
  startMin?: number;
  endMin?: number;
  /** Минимальная видимая ширина сегмента, минут. */
  minSegMin?: number;
}

/**
 * Укладывает смены дня в минимум горизонтальных дорожек: непересекающиеся по
 * времени смены делят одну дорожку (интервальная упаковка, 1 дорожка ≈ «поток»).
 * Смены целиком вне окна (ранние/поздние/ночные) не выбрасываются, а
 * прижимаются к краю окна с минимальной шириной — иначе счётчик дня видит
 * смену, а таймлайн нет.
 *
 * Окно параметризуемо: недельная сетка сужает его до реального графика недели,
 * чтобы полоски занимали ширину колонки, а не треть её.
 */
export function packIntoLanes(occs: DayOccurrence[], window: LaneWindow = {}): PackedLane[] {
  const windowStart = window.startMin ?? MONTH_DAY_START_MIN;
  const windowEnd = window.endMin ?? MONTH_DAY_END_MIN;
  const minSeg = window.minSegMin ?? MONTH_MIN_SEG_MIN;
  const segs: LaneSegment[] = occs
    .map((occ) => {
      const rawStart = occMinutes(occ.startTime);
      // Ночная смена «через полночь» (например 20:00–02:00) — рисуем до конца суток.
      const rawEnd = occMinutes(occ.endTime) <= rawStart ? 24 * 60 : occMinutes(occ.endTime);
      let startMin = clampMin(rawStart, windowStart, windowEnd);
      let endMin = clampMin(rawEnd, windowStart, windowEnd);
      if (endMin - startMin < minSeg) {
        if (rawEnd <= windowStart) {
          // Целиком до начала окна — прижимаем к левому краю.
          startMin = windowStart;
          endMin = windowStart + minSeg;
        } else if (rawStart >= windowEnd) {
          // Целиком после конца окна — прижимаем к правому краю.
          startMin = windowEnd - minSeg;
          endMin = windowEnd;
        } else {
          // Короткая смена внутри окна — растягиваем до минимума в границах окна.
          endMin = Math.min(startMin + minSeg, windowEnd);
          startMin = endMin - minSeg;
        }
      }
      return { occ, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const lanes: PackedLane[] = [];
  for (const seg of segs) {
    const lane = lanes.find((l) => l.lastEndMin <= seg.startMin);
    if (lane) {
      lane.segments.push(seg);
      lane.lastEndMin = seg.endMin;
    } else {
      lanes.push({ segments: [seg], lastEndMin: seg.endMin });
    }
  }
  return lanes;
}

/**
 * Почасовая загрузка: число уникальных сотрудников в смене в каждый час 07..21.
 * (В API расписания нет «кабинетов», поэтому загрузку меряем людьми, а не
 * долей занятых кабинетов.)
 */
export function hourlyOccupancy(occs: DayOccurrence[]): number[] {
  return OCCUPANCY_HOURS.map((h) => {
    const min = h * 60;
    const ids = new Set<number>();
    for (const o of occs) {
      if (occMinutes(o.startTime) > min || occMinutes(o.endTime) <= min) continue;
      // Час внутри обеда сотрудник не работает — в загрузку он не идёт.
      if (o.lunch && occMinutes(o.lunch.start) <= min && occMinutes(o.lunch.end) > min) continue;
      ids.add(o.employeeId);
    }
    return ids.size;
  });
}
