import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import html2pdf from "html2pdf.js";

import { pdfFileName } from "../../utility/pdfLayout";
import {
  planPageBreaks,
  pageNumberTopMm,
  sheetPageCount,
  type MeasuredBlock,
} from "../../utility/sheetPagination";
import {
  resolveMargins,
  sheetSizeMm,
  type ConclusionFormTemplate,
  type ConclusionFormPayload,
} from "../../api/conclusionForms";
import { FormSheet, type SheetContext } from "./FormSheet";
import { ConclusionTrailer, type ConclusionTrailerFields } from "./ConclusionTrailer";

/** CSS-миллиметр — ровно 96/25.4 px, той же линейкой меряет и html2pdf. */
const PX_PER_MM = 96 / 25.4;

/**
 * Раздвигает блоки листа (`data-print-block`) так, чтобы ни один не попал на
 * границу страницы и не залез в поля бланка — иначе html2pdf режет картинку
 * листа по миллиметрам, разрывая строку пополам, а продолжение начинается от
 * самого края второй страницы. Расчёт — `planPageBreaks`; здесь только
 * измерение и инлайновый `margin-top`, который html2pdf унесёт в свой клон
 * вместе с остальными стилями.
 *
 * Отступ добавляется к уже имеющемуся margin-top блока, поэтому применять
 * можно только один раз к свежему рендеру.
 */
export function applySheetPageBreaks(
  container: HTMLElement,
  template: ConclusionFormTemplate | ConclusionFormPayload,
): void {
  const { height: pageHeightMm } = sheetSizeMm(template.pageSize, template.orientation);
  const margins = resolveMargins(template.pageSize, template.margins);
  const originTop = container.getBoundingClientRect().top;

  const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-print-block]"));
  const blocks: MeasuredBlock[] = elements.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: (rect.top - originTop) / PX_PER_MM,
      bottom: (rect.bottom - originTop) / PX_PER_MM,
    };
  });

  const shifts = planPageBreaks(blocks, {
    pageHeightMm,
    marginTopMm: margins.top,
    marginBottomMm: margins.bottom,
  });

  shifts.forEach((shiftMm, index) => {
    if (shiftMm <= 0) return;
    const el = elements[index];
    const current = parseFloat(window.getComputedStyle(el).marginTop) || 0;
    el.style.marginTop = `${current + shiftMm * PX_PER_MM}px`;
  });
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
    // Номер живёт в нижнем поле бланка: `planPageBreaks` гарантирует, что
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

/**
 * PDF заключения, у которого есть бланк: один документ, а не два.
 *
 * До 08.09.2026 «Печать бланка» и «Печать заключения» были независимыми
 * кнопками: бланк печатал только поля, которые завёл администратор, и диагноз
 * с заключением, ни к одному полю не привязанные, не попадали на бумагу вовсе.
 * Теперь лист бланка (шапка клиники, подложка, строки протокола) печатается
 * вместе с хвостом — колонками, которых лист не покрыл, — и хвост стоит внутри
 * листа, над подписью врача.
 *
 * Лист рисуется тем же компонентом, что и превью в конструкторе: что врач
 * видел на экране, то и уходит в файл.
 *
 * 🔴 Контейнер намеренно живёт в обычном потоке документа и не уносится за
 * пределы вьюпорта: html2canvas снимает область по координатам элемента, и для
 * элемента вне экрана снимок выходит пустым (та же ловушка описана в
 * `utility/pdfGenerator.ts`). Поэтому лист на мгновение виден на странице.
 */
export async function generateConclusionSheetPdf(
  template: ConclusionFormTemplate | ConclusionFormPayload,
  context: SheetContext,
  values: Record<string, string>,
  trailer: ConclusionTrailerFields,
): Promise<Blob> {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    // flushSync: html2pdf снимает DOM синхронно сразу после вызова, поэтому
    // лист должен быть смонтирован к этому моменту, а не в следующем кадре.
    flushSync(() => {
      root.render(
        <FormSheet
          template={template}
          context={context}
          values={values}
          scale={1}
          printMode
          trailer={<ConclusionTrailer fields={trailer} />}
        />,
      );
    });

    // Лист уже в потоке документа и измерен браузером — самое время развести
    // блоки по страницам, до того как html2pdf снимет его клон.
    applySheetPageBreaks(container, template);
    layoutSheetPages(container, template);

    const blob = await html2pdf()
      .set({
        margin: [0, 0, 0, 0] as [number, number, number, number],
        filename: pdfFileName("conclusion", context.patientFio),
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: {
          unit: "mm" as const,
          format: template.pageSize.toLowerCase() as "a4" | "a5",
          orientation: template.orientation,
        },
      })
      .from(container)
      .output("blob");

    return blob as Blob;
  } finally {
    // unmount откладываем: React запрещает синхронный размонтаж во время
    // рендера, а мы приходим сюда из промиса — здесь это уже безопасно.
    root.unmount();
    container.remove();
  }
}
