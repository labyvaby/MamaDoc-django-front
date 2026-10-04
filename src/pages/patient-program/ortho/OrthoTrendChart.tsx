import React from "react";
import { Box, Stack, Typography, alpha, useTheme } from "@mui/material";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SegmentedTabs } from "../../../components/ui";
import type { OrthoTrend, TrendMetric } from "./orthoTrend";

const TITLES: Record<TrendMetric, string> = { atr: "Ротация", cobb: "Угол Кобба", alpha: "Угол α по Графу" };

/**
 * Динамика (ТЗ §4.5): ротация по сколиометру (полосы 3° и 7°), угол Кобба
 * (10°, 20°, 40°) и угол α УЗИ суставов (55° и 60°). Полосы — цветом нормы.
 */
export const OrthoTrendChart: React.FC<{ trend: OrthoTrend }> = ({ trend }) => {
  const theme = useTheme();
  const [metric, setMetric] = React.useState<TrendMetric>(trend.metrics[0] ?? "atr");
  React.useEffect(() => {
    if (!trend.metrics.includes(metric) && trend.metrics.length) setMetric(trend.metrics[0]);
  }, [trend.metrics, metric]);
  if (!trend.metrics.length) return null;
  const tick = { fontSize: 12, fill: theme.palette.text.secondary };
  const ok = alpha(theme.palette.success.main, 0.09);
  const warn = alpha(theme.palette.warning.main, 0.12);
  const bad = alpha(theme.palette.error.main, 0.09);
  const data = trend.points.filter((point) =>
    metric === "atr" ? point.atr != null : metric === "cobb" ? point.cobb != null : point.alphaL != null || point.alphaR != null,
  );
  const values = data.flatMap((point) =>
    metric === "atr" ? [point.atr ?? 0] : metric === "cobb" ? [point.cobb ?? 0] : [point.alphaL ?? 60, point.alphaR ?? 60],
  );
  const domain: [number, number] =
    metric === "atr"
      ? [0, Math.max(10, Math.ceil(Math.max(...values) + 1))]
      : metric === "cobb"
        ? [0, Math.max(30, Math.ceil((Math.max(...values) + 5) / 10) * 10)]
        : [Math.min(40, Math.floor(Math.min(...values) / 5) * 5), Math.max(70, Math.ceil(Math.max(...values) / 5) * 5)];
  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">Динамика</Typography>
        {trend.metrics.length > 1 && (
          <SegmentedTabs<TrendMetric>
            layoutId="ortho-trend-metric"
            value={metric}
            onChange={setMetric}
            tabs={trend.metrics.map((key) => ({ key, label: TITLES[key] }))}
          />
        )}
      </Stack>
      <Box sx={{ height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            {metric === "atr" && (
              <>
                <ReferenceArea y1={0} y2={3} fill={ok} ifOverflow="hidden" />
                <ReferenceArea y1={3} y2={6.5} fill={warn} ifOverflow="hidden" />
                <ReferenceArea y1={6.5} y2={domain[1]} fill={bad} ifOverflow="hidden" />
              </>
            )}
            {metric === "cobb" && (
              <>
                <ReferenceArea y1={0} y2={10} fill={ok} ifOverflow="hidden" />
                <ReferenceArea y1={10} y2={20} fill={warn} ifOverflow="hidden" />
                <ReferenceArea y1={20} y2={domain[1]} fill={bad} ifOverflow="hidden" />
              </>
            )}
            {metric === "alpha" && (
              <>
                <ReferenceArea y1={60} y2={domain[1]} fill={ok} ifOverflow="hidden" />
                <ReferenceArea y1={50} y2={60} fill={warn} ifOverflow="hidden" />
                <ReferenceArea y1={domain[0]} y2={50} fill={bad} ifOverflow="hidden" />
              </>
            )}
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} />
            <YAxis domain={domain} allowDataOverflow tickFormatter={(value: number) => `${value}°`} tick={tick} />
            <Tooltip formatter={(value) => `${value}°`} />
            {metric === "alpha" ? (
              <>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="alphaL" name="Левый" stroke={theme.palette.info.main} strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls />
                <Line type="monotone" dataKey="alphaR" name="Правый" stroke={theme.palette.secondary.main} strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey={metric}
                name={TITLES[metric]}
                stroke={theme.palette.primary.main}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};
