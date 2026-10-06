import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TimesheetCode, TimesheetDayStat, TimesheetRow } from "../../api/timesheet";
import { cascadeContainer, cascadeItem, UserAvatar } from "../../components/ui";
import { subtleBorder } from "../../theme/uiHelpers";
import { formatHours, toNumber } from "./model";

const MotionBox = motion.create(Box);

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <MotionBox
      variants={cascadeItem}
      sx={{ p: 2, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "background.paper", minWidth: 0 }}
    >
      <Typography variant="subtitle2" fontWeight={800}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {hint}
        </Typography>
      )}
      {children}
    </MotionBox>
  );
}

export interface TimesheetChartsProps {
  daily: TimesheetDayStat[];
  rows: TimesheetRow[];
  codes: TimesheetCode[];
  /** YYYY-MM-DD — дни после него ещё не прожиты, линия часов там обрывается. */
  today: string;
  /** YYYY-MM */
  month: string;
}

export const TimesheetCharts: React.FC<TimesheetChartsProps> = ({ daily, rows, codes, today, month }) => {
  const theme = useTheme();
  const axis = { fontSize: 11, fill: theme.palette.text.secondary };
  const data = daily.map((d) => ({
    day: d.day,
    present: d.present,
    leave: d.leave,
    absent: d.absent,
    missing: d.missing,
    planned: d.planned,
    hours: `${month}-${String(d.day).padStart(2, "0")}` > today ? null : toNumber(d.hours),
  }));

  const distribution = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.totals.codes)) {
        counts.set(key, (counts.get(key) ?? 0) + value);
      }
    }
    return codes
      .filter((code) => (counts.get(code.key) ?? 0) > 0)
      .map((code) => ({ name: code.name, letter: code.letter, value: counts.get(code.key) ?? 0, color: code.color }));
  }, [rows, codes]);

  const leaders = (key: "overtime" | "missing") =>
    [...rows]
      .map((row) => ({
        row,
        value: key === "overtime" ? toNumber(row.totals.overtimeHours) : row.totals.missingDays,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

  const tooltipStyle = {
    contentStyle: {
      borderRadius: 12,
      border: `1px solid ${subtleBorder(theme)}`,
      background: theme.palette.background.paper,
      boxShadow: "0 12px 28px rgba(0,0,0,.18)",
      fontSize: 12,
    },
    labelFormatter: (label: React.ReactNode) => `${String(label)} число`,
  };

  return (
    <MotionBox
      variants={cascadeContainer}
      initial="hidden"
      animate="show"
      sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" } }}
    >
      <Panel title="Явка по дням" hint="Столбцы — люди по категориям, линия — отработанные часы">
        <Box sx={{ height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={subtleBorder(theme)} />
              <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} interval={0} />
              <YAxis yAxisId="people" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis yAxisId="hours" orientation="right" tick={axis} tickLine={false} axisLine={false} />
              <RechartsTooltip
                {...tooltipStyle}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    present: "На работе",
                    leave: "Отпуск, больничный",
                    absent: "Неявка",
                    missing: "Пропуск",
                    hours: "Часы",
                  };
                  const key = String(name ?? "");
                  const numeric = Number(value ?? 0);
                  return [key === "hours" ? `${formatHours(numeric)} ч` : numeric, labels[key] ?? key];
                }}
              />
              <Bar yAxisId="people" dataKey="present" stackId="a" fill={theme.palette.success.main} radius={[0, 0, 0, 0]} animationDuration={800} />
              <Bar yAxisId="people" dataKey="leave" stackId="a" fill={theme.palette.warning.main} animationDuration={800} />
              <Bar yAxisId="people" dataKey="absent" stackId="a" fill="#8b5cf6" animationDuration={800} />
              <Bar yAxisId="people" dataKey="missing" stackId="a" fill={alpha(theme.palette.error.main, 0.8)} radius={[4, 4, 0, 0]} animationDuration={800} />
              <Line
                yAxisId="hours"
                type="monotone"
                dataKey="hours"
                stroke={theme.palette.primary.main}
                strokeWidth={2.5}
                dot={false}
                animationDuration={1000}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </Panel>
      <Panel title="Из чего состоит месяц" hint="Все отметки табеля">
        {distribution.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
            Пока нет отметок
          </Typography>
        ) : (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 150, height: 150, flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                    animationDuration={900}
                  >
                    {distribution.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle.contentStyle} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
              {distribution.map((item) => (
                <Stack key={item.name} direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: item.color, flexShrink: 0 }} />
                  <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {item.letter} · {item.name}
                  </Typography>
                  <Typography variant="caption" fontWeight={800}>
                    {item.value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}
      </Panel>
      <Panel title="Больше всех переработали" hint="Часы сверх графика за месяц">
        <LeaderList items={leaders("overtime")} unit="ч" color="#f97316" empty="Переработок нет" />
      </Panel>
      <Panel title="Больше всех пропусков" hint="Рабочие дни без отметок">
        <LeaderList items={leaders("missing")} unit="дн." color={theme.palette.error.main} empty="Пропусков нет 🎉" />
      </Panel>
    </MotionBox>
  );
};

function LeaderList({
  items,
  unit,
  color,
  empty,
}: {
  items: { row: TimesheetRow; value: number }[];
  unit: string;
  color: string;
  empty: string;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        {empty}
      </Typography>
    );
  }
  const max = Math.max(...items.map((item) => item.value));
  return (
    <Stack spacing={1}>
      {items.map(({ row, value }) => (
        <Stack key={row.employee.id} direction="row" spacing={1.25} alignItems="center">
          <UserAvatar src={row.employee.photoUrl} name={row.employee.fullName} size={28} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="caption" fontWeight={700} noWrap>
                {row.employee.fullName}
              </Typography>
              <Typography variant="caption" fontWeight={800}>
                {formatHours(value)} {unit}
              </Typography>
            </Stack>
            <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.18 : 0.12) }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(value / max) * 100}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: "100%", borderRadius: 3, background: color }}
              />
            </Box>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export default TimesheetCharts;
