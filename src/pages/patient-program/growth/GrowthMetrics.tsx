import React from "react";
import { Box, Chip, Typography, alpha, useMediaQuery, useTheme } from "@mui/material";

import { assessMeasurement, deltaLabel, previousWith, type MeasureKey, type Measurement } from "./growthData";
import { bmiVerdict, centileLabel, type GrowthAssessment, type GrowthSex } from "./growthNorms";
import { formatNumber, growthColor } from "./growthUi";
import { useCountUp } from "./useCountUp";

interface MetricProps {
  label: string;
  value: number | null;
  unit: string;
  digits: number;
  assessment: GrowthAssessment | null;
  note?: string;
  delta?: string | null;
  animate: boolean;
}

const Metric: React.FC<MetricProps> = ({ label, value, unit, digits, assessment, note, delta, animate }) => {
  const theme = useTheme();
  const shown = useCountUp(value, animate);
  const status = assessment?.status ?? "unknown";
  const color = growthColor(theme, status);
  // Рамка и фон цветные только у отклонения; норму отмечает чип центиля.
  const off = status === "borderline" || status === "attention";
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: "14px",
        border: off ? `1px solid ${alpha(color, 0.45)}` : `1px solid ${theme.palette.divider}`,
        bgcolor: off ? alpha(color, 0.05) : "transparent",
        minWidth: 0,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>
        {shown == null ? "—" : formatNumber(shown, digits)}
        {unit && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Typography>
      {assessment && (
        <Chip
          size="small"
          label={centileLabel(assessment.centile)}
          sx={{ mt: 0.5, height: 22, borderRadius: "6px", fontWeight: 600, bgcolor: alpha(color, 0.16), color }}
        />
      )}
      {note && (
        <Typography variant="caption" display="block" sx={{ mt: 0.25, color: status === "unknown" ? "text.secondary" : color }}>
          {note}
        </Typography>
      )}
      {delta && (
        <Typography variant="caption" color="text.secondary" display="block">
          {delta}
        </Typography>
      )}
    </Box>
  );
};

interface GrowthMetricsProps {
  latest: Measurement;
  list: Measurement[];
  sex: GrowthSex | null;
}

const ROWS: ReadonlyArray<{ key: MeasureKey; label: string; unit: string; digits: number }> = [
  { key: "heightCm", label: "Рост", unit: "см", digits: 1 },
  { key: "weightKg", label: "Вес", unit: "кг", digits: 1 },
  { key: "bmi", label: "ИМТ", unit: "", digits: 1 },
  { key: "headCm", label: "Окружность головы", unit: "см", digits: 1 },
];

/** Показатели последнего замера: значение, центиль ВОЗ, прибавка. */
export const GrowthMetrics: React.FC<GrowthMetricsProps> = ({ latest, list, sex }) => {
  const animate = !useMediaQuery("(prefers-reduced-motion: reduce)");
  const delta = (key: MeasureKey, unit: string, digits: number): string | null => {
    const current = latest[key];
    const before = previousWith(list, latest, key);
    const previous = before?.[key];
    if (current == null || before == null || previous == null || key === "bmi") return null;
    return deltaLabel(current, previous, unit, before.at, latest.at, digits);
  };
  return (
    <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignContent: "start" }}>
      {ROWS.filter((row) => row.key !== "headCm" || latest.headCm != null).map((row) => {
        const assessment = assessMeasurement(latest, row.key, sex);
        return (
          <Metric
            key={row.key}
            label={row.label}
            value={latest[row.key]}
            unit={row.unit}
            digits={row.digits}
            assessment={assessment}
            note={row.key === "bmi" ? bmiVerdict(assessment?.z ?? null, latest.months) : undefined}
            delta={delta(row.key, row.unit, row.digits)}
            animate={animate}
          />
        );
      })}
      {latest.chestCm != null && (
        <Metric
          label="Окружность груди"
          value={latest.chestCm}
          unit="см"
          digits={1}
          assessment={null}
          note="у ВОЗ нет норм"
          delta={null}
          animate={animate}
        />
      )}
    </Box>
  );
};
