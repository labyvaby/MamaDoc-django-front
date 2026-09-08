import type { DayOccurrence } from "./occurrences";

/** Временно́е окно таймлайна, минуты от полуночи. */
export interface TimeWindow {
  startMin: number;
  endMin: number;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/**
 * Окно, когда смен нет вовсе — то же, что у месячной ячейки, чтобы пустая
 * неделя не выглядела иначе остальных.
 */
export const DEFAULT_WEEK_WINDOW: TimeWindow = { startMin: 7 * HOUR, endMin: 22 * HOUR };

/**
 * Минимальная ширина окна. Без неё неделя с единственной короткой сменой
 * растянула бы её на всю колонку, и соседние недели стали бы несравнимы.
 */
export const MIN_WINDOW_MIN = 8 * HOUR;

/** Запас по краям, чтобы полоска не упиралась в границу колонки. */
const PADDING_MIN = 30;

const toMinutes = (t: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(t);
  return m ? parseInt(m[1], 10) * HOUR + parseInt(m[2], 10) : 0;
};

/**
 * Окно недели по фактическому графику: от самой ранней смены до самой поздней,
 * округлённое до часа с получасовым запасом.
 *
 * Зачем: жёсткое окно 07:00–22:00 отдавало под смену 09:00–17:00 лишь половину
 * ширины колонки, остальное — пустота по краям. Подстроенное окно делает
 * полоски заметно длиннее, не меняя раскладку.
 */
export function computeWeekWindow(occurrences: DayOccurrence[]): TimeWindow {
  if (occurrences.length === 0) return DEFAULT_WEEK_WINDOW;

  let min = DAY;
  let max = 0;
  for (const occ of occurrences) {
    const start = toMinutes(occ.startTime);
    // Смена «через полночь» тянется до конца суток — как в packIntoLanes.
    const end = toMinutes(occ.endTime) <= start ? DAY : toMinutes(occ.endTime);
    if (start < min) min = start;
    if (end > max) max = end;
  }

  let startMin = Math.max(Math.floor((min - PADDING_MIN) / HOUR) * HOUR, 0);
  let endMin = Math.min(Math.ceil((max + PADDING_MIN) / HOUR) * HOUR, DAY);

  // Узкое окно расширяем симметрично, упираясь в границы суток.
  if (endMin - startMin < MIN_WINDOW_MIN) {
    const lack = MIN_WINDOW_MIN - (endMin - startMin);
    startMin = Math.max(startMin - Math.ceil(lack / 2), 0);
    endMin = Math.min(startMin + MIN_WINDOW_MIN, DAY);
    startMin = Math.max(endMin - MIN_WINDOW_MIN, 0);
  }

  return { startMin, endMin };
}

/** Минута → позиция слева в % внутри окна. */
export const windowPct = (min: number, window: TimeWindow): number => {
  const span = window.endMin - window.startMin;
  if (span <= 0) return 0;
  const clamped = Math.min(Math.max(min, window.startMin), window.endMin);
  return ((clamped - window.startMin) / span) * 100;
};

/** Шаги подписи часов, от частого к редкому. */
const TICK_STEPS = [1, 2, 3, 4, 6] as const;
/** Больше меток в колонку шириной ~130px не влезает. */
const MAX_TICKS = 5;

/**
 * Опорные часы окна: подписи в шапке и направляющие в ячейках. Шаг подбирается
 * под ширину окна — у 15-часового окна это привычные 9/12/15/18, у 10-часового
 * метки станут чаще, иначе привязка ко времени теряется.
 */
export function hourTicks(window: TimeWindow): number[] {
  const first = Math.ceil(window.startMin / HOUR);
  const last = Math.floor(window.endMin / HOUR);
  for (const step of TICK_STEPS) {
    const ticks: number[] = [];
    for (let h = Math.ceil(first / step) * step; h <= last; h += step) {
      // Края не подписываем: цифра у границы колонки слипается с цифрой
      // соседнего дня, поэтому отступаем от границ окна на 8% его ширины.
      const min = h * HOUR;
      const edge = (window.endMin - window.startMin) * 0.08;
      if (min - window.startMin >= edge && window.endMin - min >= edge) ticks.push(h);
    }
    if (ticks.length <= MAX_TICKS) return ticks;
  }
  return [];
}
