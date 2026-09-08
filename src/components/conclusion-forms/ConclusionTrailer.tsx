import React from "react";
import { Box } from "@mui/material";

import {
  CONCLUSION_FIELD_LABELS,
  CONCLUSION_FIELD_UNITS,
} from "../../utility/conclusionFields";

/**
 * «Хвост» заключения на листе бланка — колонки, которых сам лист не печатает.
 *
 * Зачем. Бланк печатает только то, что администратор завёл в конструкторе, и
 * до 08.09.2026 диагноз, заключение и объективный осмотр могли не попасть на
 * бумагу вовсе (реальная жалоба клиники). Теперь документ один: лист бланка
 * плюс этот блок с тем, что лист не покрыл, — значение либо стоит строкой
 * бланка, либо печатается здесь, потеряться молча ему негде.
 *
 * Блок рисуется ВНУТРИ листа, перед примечанием и подписью: подпись врача
 * должна заверять то, что стоит выше неё, а не наоборот. Поэтому здесь нет ни
 * своей ширины, ни кегля, ни полей — всё наследуется от листа, и хвост
 * выглядит его продолжением, а не приклеенной сбоку бумажкой.
 */
export interface ConclusionTrailerFields {
  heightCm?: string;
  weightKg?: string;
  temperature?: string;
  complaints?: string;
  diagnosis?: string;
  anamnesis?: string;
  objective?: string;
  conclusion?: string;
}

const MEASUREMENTS = ["heightCm", "weightKg", "temperature"] as const;
const SECTIONS = ["complaints", "diagnosis", "anamnesis", "objective", "conclusion"] as const;

const filled = (value?: string) => Boolean(value?.trim());

/** Есть ли что печатать: пустой хвост рисовать нельзя — это пустая линейка. */
function hasContent(fields: ConclusionTrailerFields): boolean {
  return [...MEASUREMENTS, ...SECTIONS].some((key) => filled(fields[key]));
}

export const ConclusionTrailer: React.FC<{ fields: ConclusionTrailerFields }> = ({
  fields,
}) => {
  if (!hasContent(fields)) return null;

  const measurements = MEASUREMENTS.filter((key) => filled(fields[key]));

  return (
    <Box sx={{ mt: "4mm", pt: "3mm", borderTop: "0.3mm dashed #999" }}>
      {measurements.length > 0 && (
        <Box sx={{ display: "flex", gap: "4mm", mb: "2mm" }}>
          {measurements.map((key) => (
            <Box key={key} sx={{ flex: key === "temperature" ? 1 : "0 0 45mm", minWidth: 0 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {CONCLUSION_FIELD_LABELS[key]}:
              </Box>{" "}
              {fields[key]} {CONCLUSION_FIELD_UNITS[key]}
            </Box>
          ))}
        </Box>
      )}

      {SECTIONS.filter((key) => filled(fields[key])).map((key) => (
        <Box key={key} sx={{ mt: "2.5mm" }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {CONCLUSION_FIELD_LABELS[key]}:
          </Box>
          {/* Длинные названия препаратов и коды переносятся, а не выпирают. */}
          <Box sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{fields[key]}</Box>
        </Box>
      ))}
    </Box>
  );
};

export default ConclusionTrailer;
