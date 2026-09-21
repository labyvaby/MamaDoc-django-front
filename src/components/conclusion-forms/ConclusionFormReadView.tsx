import React from "react";
import { Box, Stack, Typography } from "@mui/material";

import {
  fieldCaption,
  stripLeadingBlankLines,
  type ConclusionFormTemplate,
} from "../../api/conclusionForms";
import {
  CONCLUSION_FIELD_LABELS,
  CONCLUSION_FIELD_UNITS,
} from "../../utility/conclusionFields";
import type { ConclusionTrailerFields } from "./ConclusionTrailer";

/**
 * Просмотр заключения, заполненного по бланку.
 *
 * Зачем. Штатный просмотр рисует все колонки заключения подряд — рост, вес,
 * температуру, диагноз, анамнез, объективно — и у заключения по бланку
 * показывал «— — —», «Диагноз: не указано», «Объективно: —», а весь протокол
 * (карта гинеколога) целиком уезжал под заголовок «Анамнез», куда бланк
 * собирает текст. Это та же жалоба «лишние поля», что и в форме правки
 * (клиника 21, 21.09.2026), только в истории пациента.
 *
 * Здесь документ читается так же, как печатается: строки бланка, затем то,
 * чего на листе нет (`trailer` из buildConclusionPrintParts), — ни одно
 * значение не теряется и не показывается дважды. Отличие от листа одно:
 * пустые строки не рисуются — на экране линейка под ручку не нужна.
 */
export interface ConclusionFormReadViewProps {
  template: Pick<ConclusionFormTemplate, "title" | "name" | "fields">;
  /** Значения строк бланка, привязанные строки — уже из колонок заключения. */
  values: Record<string, string>;
  /** Колонки, которых нет на листе бланка. */
  trailer: ConclusionTrailerFields;
}

const MEASUREMENTS = ["heightCm", "weightKg", "temperature"] as const;
const SECTIONS = ["complaints", "diagnosis", "anamnesis", "objective", "conclusion"] as const;

const Section: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box>
    {label && (
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
    )}
    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {value}
    </Typography>
  </Box>
);

/** Подпись для экрана: без двоеточия, которое печать ставит сама. */
const screenLabel = (label: string) => fieldCaption(label).replace(/:$/, "");

export const ConclusionFormReadView: React.FC<ConclusionFormReadViewProps> = ({
  template,
  values,
  trailer,
}) => {
  const lines = template.fields
    .map((field) => ({
      id: field.id,
      label: screenLabel(field.label),
      value: stripLeadingBlankLines(values[field.id] ?? "").trimEnd(),
    }))
    .filter((line) => line.value.trim() !== "");

  const measurements = MEASUREMENTS.filter((key) => trailer[key]?.trim());
  const sections = SECTIONS.filter((key) => trailer[key]?.trim());
  const title = template.title.trim() || template.name.trim();

  return (
    <Stack spacing={2}>
      {title && (
        <Typography variant="subtitle1" fontWeight={600}>
          {title}
        </Typography>
      )}

      {lines.map((line) => (
        <Section key={line.id} label={line.label} value={line.value} />
      ))}

      {lines.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          Строки бланка не заполнены.
        </Typography>
      )}

      {measurements.length > 0 && (
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          {measurements.map((key) => (
            <Box key={key}>
              <Typography variant="subtitle2" color="text.secondary">
                {CONCLUSION_FIELD_LABELS[key]}
              </Typography>
              <Typography variant="body1">
                {trailer[key]} {CONCLUSION_FIELD_UNITS[key]}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}

      {sections.map((key) => (
        <Section key={key} label={CONCLUSION_FIELD_LABELS[key]} value={trailer[key] ?? ""} />
      ))}
    </Stack>
  );
};

export default ConclusionFormReadView;
