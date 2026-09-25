/**
 * Окно отрисовки сетки врачей во вкладке «Окна».
 *
 * У филиала в день бывает 25–50 врачей, а у сотрудника со сменой 00:00–23:59 —
 * 47 окон. Все колонки разом — это 1000+ строк, и любое действие на странице
 * (нажатие мыши, выбор дня, перезапрос) замирало на секунды. Поэтому окна дня
 * рисуются только у видимых колонок и соседей про запас; остальные колонки
 * стоят той же ширины с одной шапкой врача, и лента прокручивается как раньше.
 */

/** Меньше пикселя колонки на экране — это не «видна». */
const SUBPIXEL_PX = 1;

/** Индексы колонок (включительно), которым рисуем окна дня. */
export interface ColumnRange {
  from: number;
  to: number;
}

export function visibleColumnRange(params: {
  scrollLeft: number;
  viewportWidth: number;
  columnWidth: number;
  count: number;
  /** Сколько колонок рисовать про запас с каждой стороны. */
  overscan: number;
  /** Сколько колонок считать видимыми, пока размеры неизвестны. */
  fallbackVisible: number;
}): ColumnRange {
  const { viewportWidth, columnWidth, count, overscan, fallbackVisible } = params;
  if (count <= 0) return { from: 0, to: -1 };
  if (columnWidth <= 0 || viewportWidth <= 0) {
    return { from: 0, to: Math.min(count - 1, fallbackVisible - 1 + overscan) };
  }
  const scrollLeft = Math.max(0, params.scrollLeft);
  // Масштаб экрана даёт дробные scrollLeft: колонка, торчащая на доли
  // пикселя, видимой не считается (иначе к ней добавлялся бы и запас).
  const first = Math.min(count - 1, Math.floor((scrollLeft + SUBPIXEL_PX) / columnWidth));
  const last = Math.min(
    count - 1,
    Math.ceil((scrollLeft + viewportWidth - SUBPIXEL_PX) / columnWidth) - 1,
  );
  return {
    from: Math.max(0, first - overscan),
    to: Math.min(count - 1, Math.max(first, last) + overscan),
  };
}

export function sameColumnRange(a: ColumnRange, b: ColumnRange): boolean {
  return a.from === b.from && a.to === b.to;
}

/**
 * Номер объекта по ссылке: тот же объект — тот же номер.
 *
 * React Query при перезапросе с теми же данными возвращает прежний объект
 * (structural sharing), а `dataUpdatedAt` меняется всегда. Штамп по ссылке
 * не заставляет пересчитывать и перерисовывать сетку, когда ничего не
 * изменилось, — а перезапрос идёт на каждое изменение приёмов в филиале.
 */
export function createIdentityStamper(): (value: object | null | undefined) => number {
  const ids = new WeakMap<object, number>();
  let next = 0;
  return (value) => {
    if (!value) return 0;
    let id = ids.get(value);
    if (id === undefined) {
      next += 1;
      id = next;
      ids.set(value, id);
    }
    return id;
  };
}
