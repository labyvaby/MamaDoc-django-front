import React from "react";
import { Box } from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import type { DatePrecision } from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { CustomDatePicker } from "../ui";
import { DATE_PRECISIONS, normalizePrecisionDate, precisionDateError } from "./illnessData";

interface PrecisionDateFieldProps {
  label: string;
  value: string | null;
  precision: DatePrecision;
  /** Новая дата уже приведена к точности: месяц — 1-е число, год — 1 января. */
  onChange: (value: string | null, precision: DatePrecision) => void;
  birthDate?: string | null;
  required?: boolean;
}

const FORMATS: Record<DatePrecision, string> = { day: "DD.MM.YY", month: "MM.YYYY", year: "YYYY" };
const VIEWS: Record<DatePrecision, Array<"year" | "month" | "day">> = {
  day: ["year", "month", "day"],
  month: ["year", "month"],
  year: ["year"],
};

/**
 * Дата с точностью для трёх окон (болезнь, детская инфекция, операция):
 * кнопками «Дата / Месяц и год / Только год», ниже — поле нужного вида.
 * Не раньше рождения и не в будущем — с той же точностью.
 */
export const PrecisionDateField: React.FC<PrecisionDateFieldProps> = ({
  label,
  value,
  precision,
  onChange,
  birthDate,
  required = false,
}) => {
  const error = precisionDateError(value, precision, birthDate);
  return (
    <Section title={label}>
      <ChipGroup<DatePrecision>
        label={`${label}: точность`}
        options={DATE_PRECISIONS}
        selected={[precision]}
        onToggle={(next) => onChange(normalizePrecisionDate(value, next), next)}
      />
      <Box sx={{ mt: 1.25, maxWidth: { md: 260 } }}>
        <CustomDatePicker
          key={precision}
          label={DATE_PRECISIONS.find((option) => option.value === precision)?.label}
          value={value ? dayjs(value) : null}
          onChange={(next) => {
            const date = next as Dayjs | null;
            onChange(date && date.isValid() ? normalizePrecisionDate(date.format("YYYY-MM-DD"), precision) : null, precision);
          }}
          views={VIEWS[precision]}
          openTo={precision === "day" ? "day" : "year"}
          format={FORMATS[precision]}
          disableFuture
          minDate={birthDate ? dayjs(birthDate).startOf(precision === "day" ? "day" : precision) : undefined}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
              required,
              error: Boolean(error),
              helperText: error ?? undefined,
            },
          }}
        />
      </Box>
    </Section>
  );
};
