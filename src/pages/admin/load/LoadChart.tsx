import React, { useMemo } from "react";
import { useTheme, useMediaQuery } from "@mui/material";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import dayjs from "dayjs";

import type { HourPoint, DayPoint } from "../../../api/load";

export type LoadChartMode = "hourly" | "daily";

interface Props {
  mode: LoadChartMode;
  hourly: HourPoint[];
  daily: DayPoint[];
}

/** Business-hours window for the hourly view, widened to any hour with data. */
function hourWindow(hourly: HourPoint[]): [number, number] {
  const nonZero = hourly.filter((h) => h.count > 0).map((h) => h.hour);
  if (nonZero.length === 0) return [8, 20];
  return [Math.min(8, Math.min(...nonZero)), Math.max(20, Math.max(...nonZero))];
}

export const LoadChart: React.FC<Props> = ({ mode, hourly, daily }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const data = useMemo(() => {
    if (mode === "daily") {
      return daily.map((d) => ({ label: dayjs(d.date).format("DD.MM"), value: d.count }));
    }
    const [lo, hi] = hourWindow(hourly);
    return hourly
      .filter((h) => h.hour >= lo && h.hour <= hi)
      .map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: h.count }));
  }, [mode, hourly, daily]);

  const peakValue = useMemo(
    () => (data.length ? Math.max(...data.map((d) => d.value)) : 0),
    [data],
  );

  const primaryColor = theme.palette.primary.main;
  const peakColor = theme.palette.error.main;

  const renderDot = (props: { cx?: number; cy?: number; value?: number; index?: number }) => {
    const { cx, cy, value, index } = props;
    if (value === peakValue && value > 0 && cx != null && cy != null) {
      return (
        <circle
          key={`dot-${index}`}
          cx={cx}
          cy={cy}
          r={isMobile ? 4 : 6}
          fill={peakColor}
          stroke={theme.palette.background.paper}
          strokeWidth={2}
        />
      );
    }
    return <React.Fragment key={`dot-${index}`} />;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 16, right: isMobile ? 8 : 24, left: isMobile ? -20 : 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="loadColorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={primaryColor} stopOpacity={0.75} />
            <stop offset="95%" stopColor={primaryColor} stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis
          dataKey="label"
          minTickGap={isMobile ? 24 : 16}
          tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }}
          interval={isMobile ? "preserveStartEnd" : 0}
        />
        <YAxis
          tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }}
          allowDecimals={false}
          width={isMobile ? 28 : 40}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
          }}
          labelStyle={{ fontWeight: 600, color: theme.palette.text.primary }}
          itemStyle={{ color: theme.palette.text.secondary }}
          formatter={(value: number | undefined) => [value ?? 0, "Приёмов"]}
          labelFormatter={(label) => (mode === "daily" ? `Дата: ${label}` : `Время: ${label}`)}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={primaryColor}
          strokeWidth={isMobile ? 2 : 3}
          fillOpacity={1}
          fill="url(#loadColorValue)"
          dot={renderDot}
          activeDot={{ r: isMobile ? 5 : 7, strokeWidth: 0, fill: peakColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default LoadChart;
