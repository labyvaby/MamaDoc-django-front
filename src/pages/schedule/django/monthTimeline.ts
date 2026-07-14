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

/**
 * Укладывает смены дня в минимум горизонтальных дорожек: непересекающиеся по
 * времени смены делят одну дорожку (интервальная упаковка, 1 дорожка ≈ «поток»).
 * Смены целиком вне окна 07–22 (ранние/поздние/ночные) не выбрасываются, а
 * прижимаются к краю окна с минимальной шириной — иначе счётчик дня видит
 * смену, а таймлайн нет.
 */
export function packIntoLanes(occs: DayOccurrence[]): PackedLane[] {
  const segs: LaneSegment[] = occs
    .map((occ) => {
      const rawStart = occMinutes(occ.startTime);
      // Ночная смена «через полночь» (например 20:00–02:00) — рисуем до конца суток.
      const rawEnd = occMinutes(occ.endTime) <= rawStart ? 24 * 60 : occMinutes(occ.endTime);
      let startMin = clampMin(rawStart, MONTH_DAY_START_MIN, MONTH_DAY_END_MIN);
      let endMin = clampMin(rawEnd, MONTH_DAY_START_MIN, MONTH_DAY_END_MIN);
      if (endMin - startMin < MONTH_MIN_SEG_MIN) {
        if (rawEnd <= MONTH_DAY_START_MIN) {
          // Целиком до 07:00 — прижимаем к левому краю.
          startMin = MONTH_DAY_START_MIN;
          endMin = MONTH_DAY_START_MIN + MONTH_MIN_SEG_MIN;
        } else if (rawStart >= MONTH_DAY_END_MIN) {
          // Целиком после 22:00 — прижимаем к правому краю.
          startMin = MONTH_DAY_END_MIN - MONTH_MIN_SEG_MIN;
          endMin = MONTH_DAY_END_MIN;
        } else {
          // Короткая смена внутри окна — растягиваем до минимума в границах окна.
          endMin = Math.min(startMin + MONTH_MIN_SEG_MIN, MONTH_DAY_END_MIN);
          startMin = endMin - MONTH_MIN_SEG_MIN;
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
 * долей занятых кабинетов, как в исходном supabase-редизайне.)
 */
export function hourlyOccupancy(occs: DayOccurrence[]): number[] {
  return OCCUPANCY_HOURS.map((h) => {
    const min = h * 60;
    const ids = new Set<number>();
    for (const o of occs) {
      if (occMinutes(o.startTime) <= min && occMinutes(o.endTime) > min) ids.add(o.employeeId);
    }
    return ids.size;
  });
}
