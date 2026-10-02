/**
 * Лист заключения рядом с формой — «так выйдет на печать», пока врач пишет.
 *
 * Зачем. До 28.09.2026 врач видел документ, только нажав «Сохранить и печать»:
 * заметил перенос на вторую страницу или пустую строку бланка — правь,
 * сохраняй, печатай снова. Теперь лист собирается из формы на лету.
 *
 * Лист строится теми же деталями, что и печать (pages/print/ConclusionPrintPage):
 *  - с бланком — FormSheetPreview по страницам, значения и хвост из
 *    buildConclusionPrintParts (дровер передаёт их готовыми);
 *  - без бланка — ConclusionDocumentView, экранный вид штатного документа.
 * Поэтому экран не может разойтись с бумагой в том, какие строки куда попали.
 *
 * ⚠ Это предпросмотр несохранённого состояния. Печатается по-прежнему только
 * сохранённое — кнопка «Печать» в дровере сначала сохраняет.
 *
 * Клик по строке листа бланка отдаёт id поля (`data-sheet-field` в FormSheet) —
 * дровер ставит курсор в его строку.
 */
import React from "react";
import { Box, Stack, Typography } from "@mui/material";

import { sheetSizeMm, type ConclusionFormTemplate } from "../../api/conclusionForms";
import type { ConclusionPDFData } from "../../utility/pdfGenerator";
import { ConclusionDocumentView } from "../../pages/print/DocumentViews";
import { useT } from "../../i18n/VerticalProvider";
import { FormSheetPreview } from "./FormSheetPreview";
import type { SheetContext } from "./FormSheet";
import { ConclusionTrailer, type ConclusionTrailerFields } from "./ConclusionTrailer";

const PX_PER_MM = 96 / 25.4;

type Props = {
  /** Бланк листа; null — штатный документ без бланка (`document`). */
  template: ConclusionFormTemplate | null;
  context: SheetContext;
  /** Значения строк листа (свободные строки + подставленные колонки). */
  values: Record<string, string>;
  trailer: ConclusionTrailerFields;
  /** Документ без бланка. */
  document: ConclusionPDFData;
  highlightFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
  /** Сохранённый документ (просмотр): подпись без «после сохранения». */
  saved?: boolean;
};

export const ConclusionSheetPane: React.FC<Props> = ({
  template,
  context,
  values,
  trailer,
  document: freeDocument,
  highlightFieldId = null,
  onFieldClick,
  saved = false,
}) => {
  const { t } = useT("appointments");
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [hostWidth, setHostWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setHostWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Превью пересобирает страницы копированием DOM на каждый рендер — при
  // быстром наборе это отставание, а не потеря. Отложенные значения отдают
  // приоритет полю ввода.
  const deferredValues = React.useDeferredValue(values);
  const deferredTrailer = React.useDeferredValue(trailer);
  const deferredDocument = React.useDeferredValue(freeDocument);

  const sheetWidthPx = template
    ? sheetSizeMm(template.pageSize, template.orientation).width * PX_PER_MM
    : 0;
  // Лист не крупнее натуральной величины: на широком мониторе A4 в 100%
  // читается как бумага, а растянутый — как плакат.
  const scale = template && hostWidth > 0 ? Math.min(1, hostWidth / sheetWidthPx) : 1;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFieldClick) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-sheet-field]");
    const id = row?.dataset.sheetField;
    if (id) onFieldClick(id);
  };

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {saved ? t("conclusion.sheet.captionSaved") : t("conclusion.sheet.caption")}
      </Typography>
      <Box
        ref={hostRef}
        onClick={handleClick}
        sx={{
          minWidth: 0,
          ...(onFieldClick && template
            ? {
                "& [data-sheet-field]": { cursor: "pointer", borderRadius: "1mm" },
                // Лист — бумага, он белый в любой теме: подсветка тоже
                // бумажная, а не из палитры интерфейса.
                "& [data-sheet-field]:hover": { background: "#eef2f8" },
              }
            : null),
        }}
      >
        {template ? (
          hostWidth > 0 && (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <FormSheetPreview
                template={template}
                context={context}
                values={deferredValues}
                scale={scale}
                highlightFieldId={highlightFieldId}
                trailer={<ConclusionTrailer fields={deferredTrailer} />}
              />
            </Box>
          )
        ) : (
          <ConclusionDocumentView data={deferredDocument} />
        )}
      </Box>
    </Stack>
  );
};

export default ConclusionSheetPane;
