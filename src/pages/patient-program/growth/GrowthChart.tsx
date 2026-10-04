import React from "react";
import { Box, Typography, alpha, useTheme } from "@mui/material";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { ChipGroup } from "../vision/VisionControls";
import { INDICATOR_OF, type MeasureKey, type Measurement } from "./growthData";
import { CENTILE_LINES, lmsAt, valueAtZ, type GrowthSex } from "./growthNorms";
import { ageTick, ageTicks, chartRange, formatNumber, valueAxis } from "./growthUi";
import { WHO_LMS } from "./whoGrowthData";

const TABS: ReadonlyArray<{ value: MeasureKey; label: string; unit: string }> = [
  { value: "heightCm", label: "Рост", unit: "см" },
  { value: "weightKg", label: "Вес", unit: "кг" },
  { value: "bmi", label: "ИМТ", unit: "" },
  { value: "headCm", label: "Голова", unit: "см" },
];

interface CurveRow {
  m: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
  wide: [number, number];
  band: [number, number];
}

function curves(key: MeasureKey, sex: GrowthSex, from: number, to: number): CurveRow[] {
  const indicator = INDICATOR_OF[key];
  const stepMonths = to - from > 60 ? 2 : to - from > 24 ? 1 : 0.5;
  const rows: CurveRow[] = [];
  for (let m = from; m <= to + 1e-9; m += stepMonths) {
    const lms = lmsAt(indicator, sex, m);
    if (!lms) continue;
    const values = Object.fromEntries(CENTILE_LINES.map((line) => [line.key, valueAtZ(lms, line.z)])) as Record<
      "p3" | "p15" | "p50" | "p85" | "p97",
      number
    >;
    rows.push({ m, ...values, wide: [values.p3, values.p97], band: [values.p15, values.p85] });
  }
  return rows;
}

/** График показателя по возрасту с коридорами ВОЗ (3–97 и 15–85 центили) и замерами ребёнка. */
export const GrowthChart: React.FC<{ list: Measurement[]; sex: GrowthSex | null }> = ({ list, sex }) => {
  const theme = useTheme();
  const available = TABS.filter((tab) => list.some((item) => item[tab.value] != null && item.months != null));
  const [key, setKey] = React.useState<MeasureKey>(available[0]?.value ?? "heightCm");
  const tab = available.find((item) => item.value === key) ?? available[0];
  if (!tab) return null;
  const points = list
    .filter((item) => item[tab.value] != null && item.months != null)
    // Рост — с поправкой лёжа/стоя, как его сравнивают с ВОЗ.
    .map((item) => ({
      m: Math.round((item.months as number) * 100) / 100,
      v: (tab.value === "heightCm" ? item.heightNormsCm ?? item.heightCm : item[tab.value]) as number,
    }))
    .reverse();
  const tableEnd = sex ? WHO_LMS[INDICATOR_OF[tab.value]][sex].length - 1 : null;
  const { from, to, curveTo } = chartRange(
    points.map((point) => point.m),
    tableEnd,
  );
  const rows = sex && curveTo != null ? curves(tab.value, sex, from, curveTo) : [];
  const axis = valueAxis([...rows.flatMap((row) => [row.p3, row.p97]), ...points.map((point) => point.v)]);
  const success = theme.palette.success.main;
  const tick = { fontSize: 12, fill: theme.palette.text.secondary };
  const digits = tab.value === "heightCm" || tab.value === "headCm" ? 0 : 1;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="subtitle2">По возрасту и нормам ВОЗ</Typography>
        <ChipGroup options={available} selected={[tab.value]} onToggle={(value) => setKey(value)} />
      </Box>
      <Box sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
            <XAxis type="number" dataKey="m" domain={[from, to]} ticks={ageTicks(from, to)} tickFormatter={ageTick} tick={tick} />
            <YAxis
              domain={axis?.domain ?? ["auto", "auto"]}
              ticks={axis?.ticks}
              allowDataOverflow
              tickFormatter={(value: number) => formatNumber(value, digits)}
              tick={tick}
              width={44}
            />
            <Tooltip
              formatter={(value) => (Array.isArray(value) ? value.map((item) => formatNumber(Number(item), 1)).join(" – ") : formatNumber(Number(value ?? 0), 1))}
              labelFormatter={(label) => ageTick(Number(label))}
            />
            <Area dataKey="wide" stroke="none" fill={alpha(success, 0.08)} isAnimationActive={false} name="3–97 центиль" />
            <Area dataKey="band" stroke="none" fill={alpha(success, 0.18)} isAnimationActive={false} name="15–85 центиль" />
            <Line dataKey="p50" stroke={success} strokeWidth={1.5} strokeDasharray="6 4" dot={false} name="Медиана" isAnimationActive={false} />
            <Scatter
              data={points}
              dataKey="v"
              name={tab.label}
              fill={theme.palette.primary.main}
              line={{ stroke: theme.palette.primary.main, strokeWidth: 2.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
      {!sex && (
        <Typography variant="caption" color="text.secondary">
          Коридоров ВОЗ нет: в карточке ребёнка не указан пол
        </Typography>
      )}
      {list.some((item) => item.corrected) && (
        <Typography variant="caption" color="text.secondary" display="block">
          Недоношенный: до двух лет возраст на графике скорректированный
        </Typography>
      )}
      {tableEnd != null && to > tableEnd && (
        <Typography variant="caption" color="text.secondary">
          Нормы ВОЗ для показателя «{tab.label}» — до {ageTick(tableEnd)}
          {tab.value === "weightKg" ? "; дальше вес оценивают по ИМТ" : ""}
        </Typography>
      )}
    </Box>
  );
};
