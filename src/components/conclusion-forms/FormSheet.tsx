import React from "react";
import { Box } from "@mui/material";

import {
  fieldCaption,
  REQUIRED_BLOCK_LABELS,
  resolveMargins,
  sheetSizeMm,
  sheetTypography,
  startsOnNewLine,
  stripLeadingBlankLines,
  type ConclusionFormTemplate,
  type ConclusionFormPayload,
  type FormField,
} from "../../api/conclusionForms";

/**
 * Лист бланка — один рендер на все сценарии: превью в конструкторе,
 * предпросмотр при заполнении врачом и печать.
 *
 * Геометрия задаётся в миллиметрах, а не в пикселях: лист должен совпасть с
 * бумагой, а `mm` в CSS от вьюпорта не зависит (тот же приём, что в
 * `utility/pdfGenerator.ts`). Уменьшение под размер экрана делается
 * `transform: scale()` поверх готового листа, поэтому пропорции при любом
 * масштабе сохраняются, а не пересчитываются вёрсткой.
 *
 * Лист всегда белый с чёрным текстом независимо от темы приложения — это
 * бумага, а не элемент интерфейса (ср. `Sheet` в pages/print/DocumentViews).
 */

/** Данные приёма, которыми заполняются обязательные блоки. */
export interface SheetContext {
  patientFio: string;
  patientDob: string;
  appointmentDateTime: string;
  doctorFio: string;
  clinicName: string;
  clinicLogoUrl?: string | null;
}

/** Демо-контекст для конструктора: врач ещё никого не принимает. */
export const PREVIEW_CONTEXT: SheetContext = {
  patientFio: "Иванова Мария Сергеевна",
  patientDob: "14.03.1991",
  appointmentDateTime: "12.08.2026 10:30",
  doctorFio: "Зарифьян А. Р.",
  clinicName: "Название клиники",
  clinicLogoUrl: null,
};

type SheetTemplate = ConclusionFormPayload | ConclusionFormTemplate;

interface FormSheetProps {
  template: SheetTemplate;
  context: SheetContext;
  /** Значения полей по id. Пустые поля печатаются пустой линейкой. */
  values?: Record<string, string>;
  /** Масштаб листа: 1 = натуральная величина. */
  scale?: number;
  /** Подсветить поле в превью (при фокусе на нём в конструкторе). */
  highlightFieldId?: string | null;
  /**
   * Блок под полями листа — колонки заключения, которых бланк не печатает
   * (`ConclusionTrailer`). Стоит внутри листа и ВЫШЕ подписи: подпись врача
   * должна заверять то, что напечатано над ней. Раньше этот блок приклеивался
   * следом за всем листом, и диагноз с заключением оказывались под подписью.
   */
  trailer?: React.ReactNode;
  /** Пунктиром показать границу рабочей области (конструктор бланка). */
  showContentBounds?: boolean;
  /**
   * Режим печати: физическая страница — минимум высоты листа, а не потолок.
   * Короткий бланк занимает страницу целиком (letterhead и подложка — во весь
   * лист, подпись у низа, как на бумаге), а длинный растёт дальше вместе с
   * контентом, и подпись уезжает вниз следом за ним. html2pdf режет
   * получившийся поток на страницы, а `applySheetPageBreaks`
   * (printConclusionSheet.tsx) заранее сдвигает блоки с границы страницы —
   * см. `data-print-block`.
   *
   * История. Сначала лист был `overflow: hidden` и молча терял всё, что не
   * влезло (бланк с длинными полями печатался без диагноза/заключения —
   * жалоба клиники 08.09.2026). Затем — фиксированная высота с видимым
   * оверфлоу: блок полей ужимался до свободного места (`minHeight: 0`), а
   * подпись оставалась прижатой к низу листа, и хвост заключения печатался
   * прямо под «Врач/Подпись» (жалоба 14.09.2026). Заодно перенос на вторую
   * страницу и не мог работать: обёртка листа была фиксированной высоты, и
   * html2canvas снимал только её.
   */
  printMode?: boolean;
}

/** Подпись значения обязательного блока или поля. */
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="span" sx={{ fontWeight: 700 }}>
    {children}
  </Box>
);

/**
 * Значение поля: заполненное печатается текстом, пустое — линейкой под ручку.
 * Так распечатанный бланк остаётся пригодным для дозаполнения от руки, ровно
 * как бумажные бланки, с которых конструктор списан.
 */
const FieldValue: React.FC<{ value: string; multiline?: boolean; rows?: number }> = ({
  value,
  multiline,
  rows = 3,
}) => {
  if (!value.trim()) {
    return (
      <Box
        sx={{
          mt: multiline ? "1mm" : 0,
          flex: multiline ? "none" : 1,
          minWidth: multiline ? undefined : "20mm",
          height: multiline ? `${rows * 5}mm` : "4mm",
          borderBottom: "0.3mm dotted #999",
          // Многострочное пустое поле — это несколько линеек подряд.
          backgroundImage: multiline
            ? "repeating-linear-gradient(transparent, transparent 4.7mm, #999 4.7mm, #999 5mm)"
            : "none",
        }}
      />
    );
  }
  return (
    <Box
      component="span"
      sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", flex: multiline ? undefined : 1 }}
    >
      {value}
    </Box>
  );
};

const SheetField: React.FC<{
  field: FormField;
  value: string;
  highlighted: boolean;
}> = ({ field, value, highlighted }) => {
  const multiline = field.type === "multiline";
  // Двоеточие ровно одно: в бланках его часто пишут прямо в подписи.
  const caption = fieldCaption(field.label);
  // Пустые строки в начале значения печать не тянет (в старых заключениях они
  // сохранены вместе с нормой), а «с новой строки под подписью» решает норма
  // поля — так её задумал администратор, ставя перенос первым символом.
  const stripped = stripLeadingBlankLines(value);
  const shown = multiline && stripped && startsOnNewLine(field) ? `\n${stripped}` : stripped;
  return (
    <Box
      data-print-block
      sx={{
        gridColumn: field.width === "half" ? "span 1" : "span 2",
        mb: "2.5mm",
        // Подсветка живёт только на экране: в печать уходит белый лист.
        outline: highlighted ? "0.5mm solid #1976d2" : "none",
        outlineOffset: "1mm",
        borderRadius: highlighted ? "1mm" : 0,
      }}
    >
      {multiline ? (
        <>
          {/* Пробел после двоеточия — иначе текст врача прилипает к подписи
              («Семейный анамнез:без особенностей»), и администратору
              приходилось дописывать пробел в саму подпись поля. */}
          {caption && <Label>{caption} </Label>}
          <FieldValue value={shown} multiline rows={field.rows ?? 3} />
        </>
      ) : (
        <Box sx={{ display: "flex", alignItems: "baseline", gap: "2mm" }}>
          {caption && <Label>{caption}</Label>}
          <FieldValue value={shown} />
        </Box>
      )}
    </Box>
  );
};

export const FormSheet: React.FC<FormSheetProps> = ({
  template,
  context,
  values = {},
  scale = 1,
  highlightFieldId = null,
  printMode = false,
  trailer = null,
  showContentBounds = false,
}) => {
  const { width, height: pageHeight } = sheetSizeMm(template.pageSize, template.orientation);
  const margins = resolveMargins(template.pageSize, template.margins);

  // A5 печатается тем же кеглем, что A4, — иначе текст на половинном листе
  // выглядит крупнее оригинала. Уменьшаем пропорционально ширине листа.
  const { fontPt } = sheetTypography(template.pageSize);

  // В печати лист на волос ниже физической страницы. html2pdf растеризует
  // разметку и режет получившуюся картинку на страницы: при листе ростом
  // ровно в страницу округление пикселей выплёскивало миллиметр пустоты на
  // следующую страницу, и каждая печать выходила с лишним чистым листом.
  // На бумаге этот миллиметр не виден, а настоящий перенос (когда контент
  // правда не влез) работает как прежде.
  const height = printMode ? pageHeight - 1 : pageHeight;

  /**
   * В печать идут только заполненные строки.
   *
   * На экране пустое поле — это линейка под ручку, и она нужна: конструктор
   * списан с бумажных бланков, которые дозаполняют от руки. Но в готовом
   * документе незаполненные строки давали пустые провалы на пол-листа, и
   * заключение выглядело недоделанным (решение заказчика 08.09.2026 — пустые
   * не печатать). Превью в конструкторе при этом обязано показывать лист
   * целиком: администратор верстает бланк, а не смотрит на конкретный приём.
   */
  const printedFields = printMode
    ? template.fields.filter((field) =>
        (values[field.id] ?? field.defaultValue ?? "").trim() !== "",
      )
    : template.fields;

  return (
    <Box
      sx={{
        // Обёртка занимает место уже отмасштабированного листа: scale не влияет
        // на поток, без этого в конструкторе появлялась бы пустая полоса.
        width: `${width * scale}mm`,
        // Обёртка растёт за листом: html2canvas снимает область по границам
        // элемента, и всё, что выходит за фиксированную высоту, не попадает в
        // снимок. На страницы экранный лист режет FormSheetPreview.
        minHeight: `${height * scale}mm`,
        flexShrink: 0,
      }}
    >
      <Box
        data-print-sheet
        sx={{
          boxSizing: "border-box",
          position: "relative",
          // Страница — минимум, а не потолок:
          // лист растёт с контентом, а подпись, будучи последним flex-элементом
          // колонки, стоит у низа короткого листа и уезжает вниз за длинным.
          // Прежняя авто-высота (08.09.2026) ломала прижим подписи потому, что
          // блок содержимого был `height: 100%`, а проценты от min-height
          // родителя не считаются; теперь он flex-элемент — см. ниже.
          overflow: "visible",
          width: `${width}mm`,
          // Минимум — страница (короткий бланк: подпись у низа листа), дальше
          // лист растёт с контентом — и в печати, и на экране. Обрезка по
          // странице на экране теряла всё, что не влезло (карта гинеколога,
          // 21.09.2026); по страницам лист раскладывает FormSheetPreview.
          minHeight: `${height}mm`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          bgcolor: "#fff",
          color: "#000",
          fontFamily: "Arial, sans-serif",
          fontSize: `${fontPt}pt`,
          lineHeight: 1.35,
          pt: `${margins.top}mm`,
          pr: `${margins.right}mm`,
          pb: `${margins.bottom}mm`,
          pl: `${margins.left}mm`,
          display: "flex",
          flexDirection: "column",
          // Рамка — ориентир страницы на экране; на бумаге ей делать нечего.
          boxShadow: printMode ? "none" : "0 0 0 1px rgba(0,0,0,.12)",
        }}
      >
        {/* Подложка — фирменный бланк под текстом. */}
        {template.background.imageUrl && (
          <Box
            component="img"
            src={template.background.imageUrl}
            alt=""
            data-sheet-background
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              // Высота страницы, а не листа: подложка — это одна страница
              // фирменной бумаги. Когда лист вырос на несколько страниц, её
              // не растягивают на все, а повторяют на каждой
              // (`layoutSheetPages` в printConclusionSheet.tsx).
              height: `${pageHeight}mm`,
              objectFit: "cover",
              opacity: template.background.opacity,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Граница рабочей области — только в конструкторе. Отступы подгоняют
            под напечатанную шапку фирменной бумаги, и без видимой рамки это
            делается распечатыванием пробников. В печать рамка не идёт. */}
        {showContentBounds && (
          <Box
            sx={{
              position: "absolute",
              top: `${margins.top}mm`,
              right: `${margins.right}mm`,
              bottom: `${margins.bottom}mm`,
              left: `${margins.left}mm`,
              border: "0.3mm dashed #1976d2",
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Содержимое поверх подложки. Заполняет лист как flex-элемент, а не
            `height: 100%`: в печати высота листа — min-height, и процент от
            неё не считается, а flex тянется и до минимума, и дальше по контенту. */}
        <Box
          sx={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flex: "1 1 auto",
          }}
        >
          {template.showClinicHeader && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "3mm",
                pb: "2mm",
                mb: "3mm",
                borderBottom: "0.3mm solid #000",
              }}
            >
              {context.clinicLogoUrl && (
                <Box
                  component="img"
                  src={context.clinicLogoUrl}
                  alt=""
                  sx={{ height: "12mm", width: "auto", objectFit: "contain" }}
                />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: "1.15em" }}>{context.clinicName}</Box>
                {template.headerContacts?.trim() && (
                  <Box sx={{ fontSize: "0.8em", whiteSpace: "pre-wrap" }}>
                    {template.headerContacts}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {(template.title.trim() || template.subtitle?.trim()) && (
            <Box sx={{ textAlign: "center", mb: "4mm" }}>
              {template.title.trim() && (
                <Box sx={{ fontWeight: 700, fontSize: "1.25em", textTransform: "uppercase" }}>
                  {template.title}
                </Box>
              )}
              {template.subtitle?.trim() && (
                <Box sx={{ fontSize: "0.85em" }}>{template.subtitle}</Box>
              )}
            </Box>
          )}

          {/* Обязательные блоки-идентификация: их состав фиксирован. */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: "4mm",
              mb: "3mm",
              pb: "2mm",
              borderBottom: "0.3mm solid #ccc",
            }}
          >
            <Box sx={{ gridColumn: "span 2", mb: "1.5mm" }}>
              <Label>{REQUIRED_BLOCK_LABELS.patientFio}:</Label> {context.patientFio}
            </Box>
            <Box>
              <Label>{REQUIRED_BLOCK_LABELS.patientDob}:</Label> {context.patientDob}
            </Box>
            <Box>
              <Label>{REQUIRED_BLOCK_LABELS.appointmentDateTime}:</Label>{" "}
              {context.appointmentDateTime}
            </Box>
          </Box>

          {/* Поля шаблона и хвост заключения — вместе занимают остаток листа,
              чтобы подпись осталась прижатой к низу страницы. Ниже своего
              контента блок не ужимается (min-height остаётся auto): именно
              `minHeight: 0` здесь давал заключение, напечатанное поверх
              «Врач/Подпись», — блок сжимался до свободного места, а текст
              вытекал из него под прижатую подпись. */}
          <Box sx={{ flex: "1 1 auto" }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                columnGap: "4mm",
                alignContent: "start",
              }}
            >
              {printedFields.map((field) => (
                <SheetField
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? field.defaultValue ?? ""}
                  highlighted={highlightFieldId === field.id}
                />
              ))}
            </Box>
            {trailer}
          </Box>

          {template.footerNote?.trim() && (
            <Box data-print-block sx={{ fontSize: "0.75em", mt: "3mm", whiteSpace: "pre-wrap" }}>
              {template.footerNote}
            </Box>
          )}

          {/* Подпись — всегда внизу листа. Линейка короткая и фиксированной
              длины: во всю ширину листа она читалась как пустая графа для
              текста, а росписи хватает пары сантиметров. */}
          <Box data-print-block data-print-keep sx={{ mt: "5mm", pt: "3mm" }}>
            <Box>
              <Label>{REQUIRED_BLOCK_LABELS.doctorFio}:</Label> {context.doctorFio}
            </Box>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: "2mm", mt: "4mm" }}>
              <Label>{REQUIRED_BLOCK_LABELS.signature}:</Label>
              <Box
                sx={{ width: "40mm", flexShrink: 0, borderBottom: "0.3mm solid #000", height: "4mm" }}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default FormSheet;
