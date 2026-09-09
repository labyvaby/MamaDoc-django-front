import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import html2pdf from "html2pdf.js";

import { pdfFileName } from "../../utility/pdfLayout";
import type {
  ConclusionFormTemplate,
  ConclusionFormPayload,
} from "../../api/conclusionForms";
import { FormSheet, type SheetContext } from "./FormSheet";
import { ConclusionTrailer, type ConclusionTrailerFields } from "./ConclusionTrailer";

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
