import React from "react";
import { Box } from "@mui/material";

import {
  REQUIRED_BLOCK_LABELS,
  sheetSizeMm,
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
  return (
    <Box
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
          {field.label.trim() && <Label>{field.label}: </Label>}
          <FieldValue value={value} multiline rows={field.rows ?? 3} />
        </>
      ) : (
        <Box sx={{ display: "flex", alignItems: "baseline", gap: "2mm" }}>
          {field.label.trim() && <Label>{field.label}:</Label>}
          <FieldValue value={value} />
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
}) => {
  const { width, height } = sheetSizeMm(template.pageSize, template.orientation);

  // A5 печатается тем же кеглем, что A4, — иначе текст на половинном листе
  // выглядит крупнее оригинала. Уменьшаем пропорционально ширине листа.
  const fontPt = template.pageSize === "A5" ? 9 : 11;
  const padX = template.pageSize === "A5" ? 10 : 15;

  return (
    <Box
      sx={{
        // Обёртка занимает место уже отмасштабированного листа: scale не влияет
        // на поток, без этого в конструкторе появлялась бы пустая полоса.
        width: `${width * scale}mm`,
        height: `${height * scale}mm`,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          width: `${width}mm`,
          height: `${height}mm`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          bgcolor: "#fff",
          color: "#000",
          fontFamily: "Arial, sans-serif",
          fontSize: `${fontPt}pt`,
          lineHeight: 1.35,
          px: `${padX}mm`,
          py: "12mm",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 0 1px rgba(0,0,0,.12)",
        }}
      >
        {/* Подложка — фирменный бланк под текстом. */}
        {template.background.imageUrl && (
          <Box
            component="img"
            src={template.background.imageUrl}
            alt=""
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: template.background.opacity,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Содержимое поверх подложки. */}
        <Box sx={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
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

          {/* Поля шаблона. */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: "4mm",
              alignContent: "start",
            }}
          >
            {template.fields.map((field) => (
              <SheetField
                key={field.id}
                field={field}
                value={values[field.id] ?? field.defaultValue ?? ""}
                highlighted={highlightFieldId === field.id}
              />
            ))}
          </Box>

          {template.footerNote?.trim() && (
            <Box sx={{ fontSize: "0.75em", mt: "3mm", whiteSpace: "pre-wrap" }}>
              {template.footerNote}
            </Box>
          )}

          {/* Подпись — всегда внизу листа. Линейка короткая и фиксированной
              длины: во всю ширину листа она читалась как пустая графа для
              текста, а росписи хватает пары сантиметров. */}
          <Box sx={{ mt: "5mm", pt: "3mm" }}>
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
