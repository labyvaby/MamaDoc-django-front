/**
 * Выделение периода в шахматке зажатием мыши (RoomBookingGrid.tsx): нажатие на
 * свободной ячейке — «от», протяжка тянет диапазон ночей, отпускание — «до».
 * Ячейка шахматки = ночь, поэтому выделенные ячейки — это ровно те ночи, что
 * попадут в бронь: заезд — первая из них, выезд — день после последней. Простой
 * клик — диапазон из одной ячейки, то есть бронь на одну ночь, как и раньше.
 *
 * Чистая логика вынесена сюда, чтобы проверять её тестом без DOM. Индексы —
 * позиции в видимых днях сетки (visibleDates).
 */

/**
 * Куда реально дотянется выделение: от ячейки start к ячейке hover, но не
 * дальше первой занятой (free[i] === false) на пути — через чужую бронь
 * быструю бронь не протянуть. Направление любое, тянуть можно и влево.
 */
export function clampSelectionEnd(free: readonly boolean[], start: number, hover: number): number {
  const step = hover >= start ? 1 : -1;
  let end = start;
  for (let i = start + step; step > 0 ? i <= hover : i >= hover; i += step) {
    if (!free[i]) break;
    end = i;
  }
  return end;
}

/** [нижний, верхний] индекс выделения — старт и конец могут идти в любом порядке. */
export function selectionBounds(start: number, end: number): [number, number] {
  return start <= end ? [start, end] : [end, start];
}
