import React from "react";
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer } from "recharts";

import type { TimesheetDayStat, TimesheetSummary } from "../../api/timesheet";
import { cascadeContainer, cascadeItem } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import { formatHours, plural, toNumber } from "./model";

const MotionBox = motion.create(Box);

const live = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(16,185,129,.6); }
  70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
  100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
`;

/** Число, которое «досчитывает» до нового значения. */
function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const motionValue = useMotionValue(0);
  const text = useTransform(motionValue, (latest) =>
    `${latest.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    })}${suffix}`,
  );
  React.useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [motionValue, value]);
  return <motion.span>{text}</motion.span>;
}

function Ring({ percent, color }: { percent: number; color: string }) {
  const theme = useTheme();
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <Box component="svg" viewBox="0 0 56 56" sx={{ width: 56, height: 56, flexShrink: 0 }}>
      <circle cx="28" cy="28" r={radius} fill="none" stroke={subtleBg(theme, true)} strokeWidth="6" />
      <motion.circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - Math.min(100, Math.max(0, percent)) / 100) }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </Box>
  );
}

interface TileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent: string;
  chart?: React.ReactNode;
  side?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}

function Tile({ label, value, hint, accent, chart, side, onClick, active }: TileProps) {
  const theme = useTheme();
  const body = (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        p: 1.75,
        pb: chart ? 0 : 1.75,
        borderRadius: "14px",
        border: 1,
        borderColor: active ? alpha(accent, 0.6) : "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        textAlign: "left",
        transition: "border-color .2s ease, transform .2s ease, box-shadow .2s ease",
        boxShadow: active ? `0 0 0 3px ${alpha(accent, 0.15)}` : "none",
        "&:hover": onClick
          ? { transform: "translateY(-2px)", boxShadow: `0 10px 26px ${alpha(accent, 0.16)}` }
          : undefined,
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 90% at 100% 0%, ${alpha(accent, theme.palette.mode === "dark" ? 0.16 : 0.1)} 0%, transparent 60%)`,
          pointerEvents: "none",
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
        <Box sx={{ minWidth: 0, position: "relative" }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap display="block">
            {label}
          </Typography>
          <Typography
            component="div"
            sx={{
              fontSize: { xs: 22, md: 24, xl: 26 },
              fontWeight: 800,
              letterSpacing: -0.6,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              mt: 0.25,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mt: 0.25 }}>
              {hint}
            </Typography>
          )}
        </Box>
        {side}
      </Stack>
      {chart && <Box sx={{ height: 34, mx: -1.75, mt: 0.5 }}>{chart}</Box>}
    </Box>
  );
  return (
    <MotionBox variants={cascadeItem} sx={{ minWidth: { xs: 210, md: 158 }, flex: { xs: "0 0 auto", md: 1 } }}>
      {onClick ? (
        <ButtonBase onClick={onClick} sx={{ width: "100%", height: "100%", borderRadius: "14px", display: "block" }}>
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </MotionBox>
  );
}

function Sparkline({ data, dataKey, color }: { data: TimesheetDayStat[]; dataKey: keyof TimesheetDayStat; color: string }) {
  const id = React.useId().replace(/:/g, "");
  const points = data.map((d) => ({ day: d.day, value: dataKey === "hours" ? toNumber(d.hours) : Number(d[dataKey]) }));
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 180, height: 34 }}>
      <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#spark-${id})`}
          isAnimationActive
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniBars({ data, color }: { data: TimesheetDayStat[]; color: string }) {
  const points = data.map((d) => ({ day: d.day, value: d.missing }));
  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 180, height: 34 }}>
      <BarChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface TimesheetKpisProps {
  summary: TimesheetSummary;
  daily: TimesheetDayStat[];
  pendingRequests: number;
  canApprove: boolean;
  missingOnly: boolean;
  onToggleMissing: () => void;
  onOpenRequests: () => void;
}

export const TimesheetKpis: React.FC<TimesheetKpisProps> = ({
  summary,
  daily,
  pendingRequests,
  canApprove,
  missingOnly,
  onToggleMissing,
  onOpenRequests,
}) => {
  const theme = useTheme();
  const today = summary.today;
  const fillColor =
    summary.filledPercent >= 95
      ? theme.palette.success.main
      : summary.filledPercent >= 75
        ? theme.palette.warning.main
        : theme.palette.error.main;
  const hours = toNumber(summary.hours);
  const overtime = toNumber(summary.overtimeHours);
  const leave = summary.vacationDays + summary.sickDays;

  return (
    <MotionBox
      variants={cascadeContainer}
      initial="hidden"
      animate="show"
      sx={{
        display: "flex",
        gap: 1.5,
        overflowX: "auto",
        pb: 0.5,
        mx: { xs: -2, md: 0 },
        px: { xs: 2, md: 0 },
        scrollSnapType: { xs: "x mandatory", md: "none" },
        "& > *": { scrollSnapAlign: "start" },
      }}
    >
      {today ? (
        <Tile
          label="Сейчас на смене"
          accent={theme.palette.success.main}
          value={
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: "success.main",
                  animation: today.onShift ? `${live} 1.6s infinite` : undefined,
                  opacity: today.onShift ? 1 : 0.35,
                }}
              />
              <CountUp value={today.onShift} />
            </Stack>
          }
          hint={`пришли ${today.present} · ждём ${today.expected}${today.leave ? ` · отсутствуют ${today.leave}` : ""}`}
          chart={<Sparkline data={daily} dataKey="present" color={theme.palette.success.main} />}
        />
      ) : (
        <Tile
          label="Явки за месяц"
          accent={theme.palette.success.main}
          value={<CountUp value={summary.workedDays} />}
          hint={plural(summary.employees, "сотрудник", "сотрудника", "сотрудников")}
          chart={<Sparkline data={daily} dataKey="present" color={theme.palette.success.main} />}
        />
      )}
      <Tile
        label="Отработано"
        accent={theme.palette.primary.main}
        value={<CountUp value={hours} decimals={1} suffix=" ч" />}
        hint={toNumber(summary.nightHours) ? `из них ночью ${formatHours(summary.nightHours)} ч` : "дневные часы"}
        chart={<Sparkline data={daily} dataKey="hours" color={theme.palette.primary.main} />}
      />
      <Tile
        label="Заполнено"
        accent={fillColor}
        value={<CountUp value={summary.filledPercent} suffix="%" />}
        hint={`${summary.plannedDays - summary.missingDays} из ${summary.plannedDays} дней по графику`}
        side={<Ring percent={summary.filledPercent} color={fillColor} />}
      />
      <Tile
        label="Пропуски"
        accent={theme.palette.error.main}
        value={<CountUp value={summary.missingDays} />}
        hint={missingOnly ? "показаны только с пропусками" : "нажмите — только с пропусками"}
        chart={<MiniBars data={daily} color={alpha(theme.palette.error.main, 0.75)} />}
        onClick={onToggleMissing}
        active={missingOnly}
      />
      <Tile
        label="Отпуск · больничный"
        accent={theme.palette.warning.main}
        value={<CountUp value={leave} />}
        hint={`отпуск ${summary.vacationDays} · больничный ${summary.sickDays}${summary.tripDays ? ` · командировки ${summary.tripDays}` : ""}`}
      />
      <Tile
        label="Переработка"
        accent="#f97316"
        value={<CountUp value={overtime} decimals={1} suffix=" ч" />}
        hint={summary.earlyLeaves ? `ранних уходов ${summary.earlyLeaves}` : "ранних уходов нет"}
      />
      {canApprove && (
        <Tile
          label="Заявки на исправление"
          accent={theme.palette.info.main}
          value={<CountUp value={pendingRequests} />}
          hint={pendingRequests ? "ждут решения — открыть" : "все рассмотрены"}
          onClick={onOpenRequests}
          active={pendingRequests > 0}
        />
      )}
    </MotionBox>
  );
};

export default TimesheetKpis;
