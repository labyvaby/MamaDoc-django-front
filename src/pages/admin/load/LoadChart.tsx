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

import { useT } from "../../../i18n/VerticalProvider";
import { formatHours, type LoadBucket, type LoadMetric } from "./loadBuckets";

interface Props {
  metric: LoadMetric;
  buckets: LoadBucket[];
}

type ChartPoint = LoadBucket & { value: number | null };

export const LoadChart: React.FC<Props> = ({ metric, buckets }) => {
  const { t } = useT("load");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isUtilization = metric === "utilization";

  const data = useMemo<ChartPoint[]>(
    () => buckets.map((b) => ({ ...b, value: isUtilization ? b.utilization : b.count })),
    [buckets, isUtilization],
  );

  const peakValue = useMemo(() => data.reduce((m, d) => Math.max(m, d.value ?? 0), 0), [data]);

  const primaryColor = theme.palette.primary.main;
  const peakColor = theme.palette.error.main;

  const renderDot = (props: { cx?: number; cy?: number; value?: number | null; index?: number }) => {
    const { cx, cy, value, index } = props;
    if (value != null && value === peakValue && value > 0 && cx != null && cy != null) {
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

  const formatValue = (value: unknown, point: ChartPoint | undefined): [string | number, string] => {
    if (!isUtilization) return [typeof value === "number" ? value : 0, t("chartTooltipLabel")];
    if (value == null || !point) return ["нет смен", "Загрузка"];
    return [
      `${value}% · ${formatHours(point.busyMinutes)} ч из ${formatHours(point.scheduleMinutes)} ч`,
      "Загрузка",
    ];
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
          width={isMobile ? 32 : 44}
          domain={isUtilization ? [0, 100] : undefined}
          tickFormatter={isUtilization ? (v: number) => `${v}%` : undefined}
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
          formatter={(value, _name, item) => formatValue(value, item?.payload as ChartPoint | undefined)}
          labelFormatter={(label, payload) =>
            (payload?.[0]?.payload as ChartPoint | undefined)?.title ?? String(label)
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={primaryColor}
          strokeWidth={isMobile ? 2 : 3}
          fillOpacity={1}
          fill="url(#loadColorValue)"
          connectNulls={false}
          dot={renderDot}
          activeDot={{ r: isMobile ? 5 : 7, strokeWidth: 0, fill: peakColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default LoadChart;
