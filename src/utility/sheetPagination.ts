/**
 * Перенос блоков листа бланка на следующую страницу.
 *
 * Зачем. html2pdf растеризует лист одной картинкой и режет её на страницы по
 * миллиметрам, не глядя на текст: строка, попавшая на границу, уходит в PDF
 * половинками, а продолжение на второй странице начинается от самого верхнего
 * края бумаги (у собственного `pagebreak` html2pdf полей нет, и в grid-строку
 * он вставляет распорку-div, ломая колонки). Поэтому переносы считаем сами:
 * каждому блоку — дополнительный отступ сверху, который сдвигает его на
 * следующую страницу за верхнее поле бланка.
 *
 * Чистая функция над измеренными координатами: DOM здесь нет, и её можно
 * проверить тестом без браузера (см. `applySheetPageBreaks` в
 * `printConclusionSheet.tsx`, где блоки измеряются и отступы применяются).
 */

export interface PageGeometry {
  /** Физическая высота страницы. */
  pageHeightMm: number;
  /** Верхнее поле бланка: с него начинается контент на каждой странице. */
  marginTopMm: number;
  /** Нижнее поле: блок не должен заходить в него. */
  marginBottomMm: number;
}

/** Блок листа в миллиметрах от верха листа, в порядке документа. */
export interface MeasuredBlock {
  top: number;
  bottom: number;
}

const EPSILON = 0.01;

/**
 * Для каждого блока — отступ сверху (мм), который нужно добавить, чтобы блоки
 * не рвались границей страницы и не залезали в поля. Блоки с одинаковым `top`
 * (соседи в одной строке двухколоночной сетки) двигаются вместе: сдвинуть
 * половину строки нельзя — вторая половина останется на прежней странице.
 *
 * Блок выше рабочей области страницы перенести некуда — он остаётся на месте
 * и режется как раньше (гигантское заключение на две страницы — редкость, и
 * лучше разрез, чем пустая страница перед ним).
 */
export function planPageBreaks(blocks: MeasuredBlock[], geometry: PageGeometry): number[] {
  const { pageHeightMm: pageH, marginTopMm, marginBottomMm } = geometry;
  const usable = pageH - marginTopMm - marginBottomMm;

  const shifts: number[] = [];
  // Накопленный сдвиг: каждый перенос двигает вниз и всё, что идёт после.
  let offset = 0;
  let groupTop: number | null = null;
  let groupShift = 0;

  for (const block of blocks) {
    if (groupTop !== null && Math.abs(block.top - groupTop) < EPSILON) {
      shifts.push(groupShift);
      continue;
    }

    const top = block.top + offset;
    const bottom = block.bottom + offset;
    const height = block.bottom - block.top;
    const page = Math.floor(top / pageH);
    const pageTop = page * pageH;
    const limit = pageTop + pageH - marginBottomMm;

    let shift = 0;
    if (height <= usable + EPSILON) {
      if (bottom > limit + EPSILON) {
        // Не влезает над нижним полем — на следующую страницу, за верхнее поле.
        shift = pageTop + pageH + marginTopMm - top;
      } else if (page >= 1 && top < pageTop + marginTopMm - EPSILON) {
        // Начался в верхнем поле продолжения — опустить до рабочей области.
        shift = pageTop + marginTopMm - top;
      }
    }

    shifts.push(shift);
    offset += shift;
    groupTop = block.top;
    groupShift = shift;
  }

  return shifts;
}

/**
 * Сколько физических страниц займёт лист высотой `sheetHeightMm`.
 *
 * Лист в печати на 1 мм ниже страницы (см. `FormSheet`, округление
 * растеризации), поэтому одностраничный лист — это 296 мм, а не 297; допуск в
 * пару миллиметров не даёт такому листу посчитаться за две страницы.
 */
export function sheetPageCount(sheetHeightMm: number, pageHeightMm: number): number {
  const SLACK_MM = 2;
  return Math.max(1, Math.ceil((sheetHeightMm - SLACK_MM) / pageHeightMm));
}

/**
 * Верх номера страницы (мм от верха листа): посередине нижнего поля бланка.
 *
 * Строка номера ~3 мм, поэтому центр поля сдвигаем на её половину. Если поле
 * совсем узкое, номер всё равно не прилипает к обрезу бумаги — принтеры не
 * пропечатывают последние миллиметры.
 */
export function pageNumberTopMm(
  pageIndex: number,
  pageHeightMm: number,
  marginBottomMm: number,
): number {
  const LINE_MM = 3;
  const MIN_FROM_EDGE_MM = 4;
  const fromBottom = Math.max(marginBottomMm / 2 + LINE_MM / 2, MIN_FROM_EDGE_MM + LINE_MM);
  return (pageIndex + 1) * pageHeightMm - fromBottom;
}
