/**
 * Раскладка листа бланка по страницам — общая для печати и превью.
 *
 * Вынесено из printConclusionSheet.tsx, чтобы превью в конструкторе
 * (FormSheetPreview) раскладывало лист ровно как печать, не подтягивая
 * html2pdf: библиотека тяжёлая и нужна только при самой печати.
 */
import {
  pageBreakStep,
  pageNumberTopMm,
  sheetPageCount,
} from "../../utility/sheetPagination";
import {
  resolveMargins,
  sheetSizeMm,
  type ConclusionFormTemplate,
  type ConclusionFormPayload,
} from "../../api/conclusionForms";

/** CSS-миллиметр — ровно 96/25.4 px, той же линейкой меряет и html2pdf. */
const PX_PER_MM = 96 / 25.4;

/** Меньше двух строк абзаца на странице не оставляем — висячая строка. */
const MIN_KEEP_LINES = 2;
/** Предохранитель от бесконечного цикла на вырожденной вёрстке. */
const MAX_STEPS_PER_BLOCK = 60;

/**
 * Первая строка текста внутри `el`, которая заходит ниже `limitPx`.
 *
 * Строк как DOM-узлов нет — это переносы внутри текстового узла, поэтому
 * ищем символ: у символов по порядку документа низ не убывает, и первый
 * символ ниже границы начинает переносимую строку.
 */
function findOverflowLine(
  el: HTMLElement,
  limitPx: number,
): { node: Text; offset: number; lineTopPx: number; lineHeightPx: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    range.selectNodeContents(node);
    if (range.getBoundingClientRect().bottom <= limitPx) continue;
    for (let offset = 0; offset < node.length; offset += 1) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getClientRects()[0];
      // У переноса строки и схлопнутых пробелов прямоугольника может не быть.
      if (!rect || rect.height === 0) continue;
      if (rect.bottom > limitPx) {
        return { node, offset, lineTopPx: rect.top, lineHeightPx: rect.height };
      }
    }
  }
  return null;
}

/** Добавить к margin-top блока `mm` миллиметров. */
function pushDown(el: HTMLElement, mm: number): void {
  const current = parseFloat(window.getComputedStyle(el).marginTop) || 0;
  el.style.marginTop = `${current + mm * PX_PER_MM}px`;
}

/**
 * Разводит содержимое листа по страницам, чтобы ни одна строка не попала на
 * границу страницы и не залезла в поля бланка — иначе html2pdf режет картинку
 * листа по миллиметрам, разрывая строку пополам, а продолжение начинается от
 * самого края второй страницы.
 *
 * Единица — блок `data-print-block` (поле бланка, строка заключения, подпись).
 * Короткий блок, не влезший над нижним полем, переезжает на следующую страницу
 * целиком. Длинный абзац режется по строке: перед первой не влезшей строкой
 * вставляется распорка до верхнего поля следующей страницы. Раньше абзац без
 * переносов (текст вставлен одной строкой) переезжал целиком, оставляя
 * полстраницы пустой, а не влезая и в новую страницу — резался пополам
 * (жалоба 14.09.2026). `data-print-keep` запрещает резать (подпись врача).
 *
 * Блоки обрабатываются по порядку с живым замером: каждый сдвиг меняет
 * координаты всего, что ниже. Применять один раз к свежему рендеру.
 */
export function applySheetPageBreaks(
  container: HTMLElement,
  template: ConclusionFormTemplate | ConclusionFormPayload,
): void {
  const { height: pageHeightMm } = sheetSizeMm(template.pageSize, template.orientation);
  const margins = resolveMargins(template.pageSize, template.margins);
  const geometry = {
    pageHeightMm,
    marginTopMm: margins.top,
    marginBottomMm: margins.bottom,
  };

  const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-print-block]"));
  for (const el of elements) {
    // После разреза дальше решаем уже за хвост абзаца: он начинается с верха
    // рабочей области новой страницы, а не с верха всего блока — иначе блок
    // так и числился бы пересекающим первую страницу, и второй разрез не
    // случился бы (найдено стендом 14.09.2026).
    let pieceTopMm: number | null = null;
    for (let step = 0; step < MAX_STEPS_PER_BLOCK; step += 1) {
      const originTop = container.getBoundingClientRect().top;
      const rect = el.getBoundingClientRect();
      const blockTopMm = (rect.top - originTop) / PX_PER_MM;
      const decision = pageBreakStep(
        {
          top: pieceTopMm ?? blockTopMm,
          bottom: (rect.bottom - originTop) / PX_PER_MM,
        },
        geometry,
      );

      if (decision.kind === "fits") break;
      if (decision.kind === "shift") {
        pushDown(el, decision.shiftMm);
        break;
      }

      if (!el.hasAttribute("data-print-keep")) {
        const line = findOverflowLine(el, originTop + decision.limitMm * PX_PER_MM);
        const pieceTopPx = originTop + (pieceTopMm ?? blockTopMm) * PX_PER_MM;
        const keptPx = line ? line.lineTopPx - pieceTopPx : 0;
        if (line && keptPx >= line.lineHeightPx * MIN_KEEP_LINES - 1) {
          const lineTopMm = (line.lineTopPx - originTop) / PX_PER_MM;
          const spacer = document.createElement("span");
          spacer.setAttribute("data-print-spacer", "");
          spacer.style.display = "block";
          spacer.style.height = `${(decision.nextContentTopMm - lineTopMm) * PX_PER_MM}px`;
          line.node.parentNode?.insertBefore(spacer, line.node.splitText(line.offset));
          // Остаток абзаца мог не влезть и в следующую страницу — замеряем снова.
          pieceTopMm = decision.nextContentTopMm;
          continue;
        }
      }

      if (decision.fallbackShiftMm > 0) {
        // На этой странице места абзацу нет: переносим целиком, а если он
        // длиннее страницы — режем уже там, на следующей итерации.
        pushDown(el, decision.fallbackShiftMm);
        continue;
      }
      // Неразрезаемый блок выше рабочей области — оставляем как есть.
      break;
    }
  }
}

/**
 * Оформление многостраничного листа: подложка и номер «1/2» на каждой странице.
 *
 * Подложка — фирменная бумага клиники — повторяется, а не только на первой:
 * вторая страница без шапки и рамки бланка выглядела листом из другого
 * документа. Номер страницы нужен, чтобы рассыпавшиеся листы заключения можно
 * было собрать и понять, что второй не потерялся; у одностраничного
 * документа «1/1» — шум, его не печатаем.
 *
 * Считается после `applySheetPageBreaks`: переносы удлиняют лист. Последняя
 * страница добивается до полной высоты — иначе html2canvas снимет лист только
 * до конца текста, и подложка на ней оборвётся посередине; заодно подпись,
 * прижатая к низу колонки, встаёт у низа последней страницы, как и на
 * одностраничном бланке.
 */
export function layoutSheetPages(
  container: HTMLElement,
  template: ConclusionFormTemplate | ConclusionFormPayload,
): void {
  const sheet = container.querySelector<HTMLElement>("[data-print-sheet]");
  if (!sheet) return;

  const { height: pageHeightMm } = sheetSizeMm(template.pageSize, template.orientation);
  const margins = resolveMargins(template.pageSize, template.margins);
  const sheetHeightMm = sheet.getBoundingClientRect().height / PX_PER_MM;
  const pages = sheetPageCount(sheetHeightMm, pageHeightMm);
  if (pages <= 1) return;

  // Тот же миллиметр запаса, что у одностраничного листа (см. FormSheet).
  sheet.style.minHeight = `${pages * pageHeightMm - 1}mm`;

  const background = sheet.querySelector<HTMLElement>(":scope > [data-sheet-background]");
  for (let page = pages - 1; page >= 1; page -= 1) {
    if (!background) break;
    const copy = background.cloneNode(true) as HTMLElement;
    copy.style.top = `${page * pageHeightMm}mm`;
    background.after(copy);
  }

  for (let page = 0; page < pages; page += 1) {
    const label = document.createElement("div");
    label.textContent = `${page + 1}/${pages}`;
    // Номер живёт в нижнем поле бланка: `applySheetPageBreaks` гарантирует, что
    // текст туда не заходит, поэтому с подписью и заключением он не сталкивается.
    Object.assign(label.style, {
      position: "absolute",
      top: `${pageNumberTopMm(page, pageHeightMm, margins.bottom)}mm`,
      right: `${margins.right}mm`,
      fontSize: "0.75em",
      lineHeight: "1",
      color: "#555",
      pointerEvents: "none",
    });
    sheet.appendChild(label);
  }
}
