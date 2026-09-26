/**
 * Перенос содержимого листа бланка на следующую страницу.
 *
 * Зачем. html2pdf растеризует лист одной картинкой и режет её на страницы по
 * миллиметрам, не глядя на текст: строка, попавшая на границу, уходит в PDF
 * половинками, а продолжение на второй странице начинается от самого верхнего
 * края бумаги (у собственного `pagebreak` html2pdf полей нет, и в grid-строку
 * он вставляет распорку-div, ломая колонки). Поэтому переносы считаем сами.
 *
 * Здесь — только решение по одному измеренному блоку, без DOM (проверяется
 * тестом). Измеряет, сдвигает и режет абзацы по строкам `applySheetPageBreaks`
 * в `printConclusionSheet.tsx`.
 */

export interface PageGeometry {
  /** Физическая высота страницы. */
  pageHeightMm: number;
  /** Верхнее поле бланка: с него начинается контент на каждой странице. */
  marginTopMm: number;
  /** Нижнее поле: блок не должен заходить в него. */
  marginBottomMm: number;
}

/** Блок листа в миллиметрах от верха листа. */
export interface MeasuredBlock {
  top: number;
  bottom: number;
}

export type PageBreakStep =
  /** Блок целиком в рабочей области своей страницы. */
  | { kind: "fits" }
  /** Блок начался в верхнем поле продолжения — опустить на `shiftMm`. */
  | { kind: "shift"; shiftMm: number }
  /**
   * Блок заходит в нижнее поле. Сначала пробуют разрезать его по строке:
   * строки ниже `limitMm` уезжают так, чтобы начаться с `nextContentTopMm`.
   * Не вышло (на странице не остаётся и пары строк, или блок неразрезаемый) —
   * сдвиг целиком на `fallbackShiftMm`; 0 — сдвигать бессмысленно: блок уже
   * стоит в начале рабочей области и всё равно не влезает.
   */
  | { kind: "cross"; limitMm: number; nextContentTopMm: number; fallbackShiftMm: number };

const EPSILON = 0.01;

export function pageBreakStep(block: MeasuredBlock, geometry: PageGeometry): PageBreakStep {
  const { pageHeightMm: pageH, marginTopMm, marginBottomMm } = geometry;
  const page = Math.floor((block.top + EPSILON) / pageH);
  const pageTop = page * pageH;
  const contentTop = pageTop + marginTopMm;
  const limitMm = pageTop + pageH - marginBottomMm;

  if (block.bottom <= limitMm + EPSILON) {
    if (page >= 1 && block.top < contentTop - EPSILON) {
      return { kind: "shift", shiftMm: contentTop - block.top };
    }
    return { kind: "fits" };
  }

  const nextContentTopMm = pageTop + pageH + marginTopMm;
  const atContentTop = block.top <= contentTop + EPSILON;
  return {
    kind: "cross",
    limitMm,
    nextContentTopMm,
    fallbackShiftMm: atContentTop ? 0 : nextContentTopMm - block.top,
  };
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
