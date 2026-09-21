import React from "react";
import { Box } from "@mui/material";

import {
  resolveMargins,
  sheetSizeMm,
  type ConclusionFormPayload,
  type ConclusionFormTemplate,
} from "../../api/conclusionForms";
import { FormSheet, type SheetContext } from "./FormSheet";
import { applySheetPageBreaks, layoutSheetPages } from "./sheetPageLayout";

/**
 * Превью бланка по страницам — отдельными листами A4/A5, как в просмотре PDF.
 *
 * Зачем. Экранный лист был ровно одной страницей с обрезкой, и длинный бланк
 * (карта гинеколога, 16 строк с нормами) в конструкторе обрывался посередине,
 * хотя печать давно переносит его на следующие страницы (21.09.2026). Длинная
 * лента с пунктиром на месте разрыва читалась хуже, чем отдельные листы.
 *
 * Как. Лист рисуется один раз обычным FormSheet — невидимо, в натуральную
 * величину. После каждого рендера его DOM копируется, и к копии применяется
 * ровно та раскладка, что у печати (`applySheetPageBreaks` — перенос блоков и
 * строк через границу, `layoutSheetPages` — подложка и «1/2» на каждой
 * странице). Затем для каждой страницы показывается окно размером с лист,
 * через которое видна своя часть копии. Так превью совпадает с бумагой, а не
 * изображает её.
 *
 * ⚠ Копии живут вне React (раскладка режет текстовые узлы и вставляет
 * распорки — в управляемом React DOM это сломало бы следующий рендер).
 * Поэтому страницы собираются руками в `pagesRef`, а React владеет только
 * невидимым исходником.
 */
export interface FormSheetPreviewProps {
  template: ConclusionFormPayload | ConclusionFormTemplate;
  context: SheetContext;
  values?: Record<string, string>;
  /** Масштаб листа на экране: 1 = натуральная величина. */
  scale?: number;
  highlightFieldId?: string | null;
  /** Пунктиром показать рабочую область на каждой странице. */
  showContentBounds?: boolean;
}

/** Промежуток между листами на экране. */
const PAGE_GAP_PX = 16;

export const FormSheetPreview: React.FC<FormSheetPreviewProps> = ({
  template,
  context,
  values,
  scale = 1,
  highlightFieldId = null,
  showContentBounds = false,
}) => {
  const sourceRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const pagesRef = React.useRef<HTMLDivElement | null>(null);

  const { width, height: pageHeight } = sheetSizeMm(template.pageSize, template.orientation);
  const margins = resolveMargins(template.pageSize, template.margins);

  // Без массива зависимостей: исходник перерисовывается на каждую правку
  // бланка, и страницы должны пересобраться вслед за ним.
  React.useLayoutEffect(() => {
    const source = sourceRef.current;
    const measure = measureRef.current;
    const pagesHost = pagesRef.current;
    if (!source || !measure || !pagesHost) return;

    measure.replaceChildren(source.cloneNode(true));
    applySheetPageBreaks(measure, template);
    layoutSheetPages(measure, template);

    const sheet = measure.querySelector<HTMLElement>("[data-print-sheet]");
    if (!sheet) return;
    // Лист у превью в натуральную величину, поэтому высоту берём из вёрстки.
    const pxPerMm = sheet.offsetWidth / width || 96 / 25.4;
    const pages = Math.max(1, Math.round(sheet.offsetHeight / pxPerMm / pageHeight));

    const nodes: HTMLElement[] = [];
    for (let page = 0; page < pages; page += 1) {
      const frame = document.createElement("div");
      Object.assign(frame.style, {
        position: "relative",
        overflow: "hidden",
        width: `${width * scale}mm`,
        height: `${pageHeight * scale}mm`,
        background: "#fff",
        boxShadow: "0 0 0 1px rgba(0,0,0,.12)",
        marginTop: page === 0 ? "0" : `${PAGE_GAP_PX}px`,
      });

      const copy = sheet.cloneNode(true) as HTMLElement;
      Object.assign(copy.style, {
        position: "absolute",
        top: "0",
        left: "0",
        boxShadow: "none",
        transformOrigin: "top left",
        // Справа налево: сначала сдвиг к своей странице в миллиметрах листа,
        // затем масштаб экрана.
        transform: `scale(${scale}) translateY(-${page * pageHeight}mm)`,
      });
      frame.appendChild(copy);

      if (showContentBounds) {
        const bounds = document.createElement("div");
        Object.assign(bounds.style, {
          position: "absolute",
          top: `${margins.top * scale}mm`,
          right: `${margins.right * scale}mm`,
          bottom: `${margins.bottom * scale}mm`,
          left: `${margins.left * scale}mm`,
          border: "1px dashed rgba(25,118,210,.5)",
          pointerEvents: "none",
        });
        frame.appendChild(bounds);
      }
      nodes.push(frame);
    }
    pagesHost.replaceChildren(...nodes);
    measure.replaceChildren();
  });

  return (
    <Box sx={{ position: "relative" }}>
      {/* Исходник и черновик раскладки: вне экрана, но в вёрстке — раскладке
          нужны настоящие размеры строк. */}
      <Box
        aria-hidden
        sx={{
          position: "fixed",
          left: "-100000px",
          top: 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        <Box ref={sourceRef}>
          <FormSheet
            template={template}
            context={context}
            values={values}
            scale={1}
            highlightFieldId={highlightFieldId}
          />
        </Box>
        <Box ref={measureRef} />
      </Box>

      <Box ref={pagesRef} />
    </Box>
  );
};

export default FormSheetPreview;
