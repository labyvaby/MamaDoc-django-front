import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import CalendarViewWeekOutlined from "@mui/icons-material/CalendarViewWeekOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import WorkHistoryOutlined from "@mui/icons-material/WorkHistoryOutlined";

import { subtleBg } from "../../../theme/uiHelpers";
import type { LoadKpi } from "../../../api/load";
import { useT } from "../../../i18n/VerticalProvider";
import { formatHours, loadPct, outsideShare } from "./loadBuckets";

const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

type Tone = "accent" | "success" | "warning" | "error";

const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
}> = ({ icon, label, value, sub, tone = "accent" }) => (
  <Box
    sx={(t) => ({
      flex: "1 1 180px",
      minWidth: 0,
      display: "flex",
      gap: 1.5,
      alignItems: "center",
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
    })}
  >
    <Box
      sx={(t) => {
        const c =
          tone === "success"
            ? t.palette.success.main
            : tone === "warning"
              ? t.palette.warning.main
              : tone === "error"
                ? t.palette.error.main
                : t.palette.primary.main;
        return {
          width: 40,
          height: 40,
          borderRadius: "10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone === "accent" ? "primary.onSurface" : `${tone}.main`,
          bgcolor: alpha(c, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 20 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={600} noWrap>
        {value}
      </Typography>
      {/* Перенос, а не многоточие: при меню слева плитки узкие, и хвост
          подписи («· СКУД 45%») иначе пропадал. */}
      {sub && (
        <Typography variant="caption" color="text.disabled" display="block">
          {sub}
        </Typography>
      )}
    </Box>
  </Box>
);

export interface LoadKpiCardsProps {
  kpi: LoadKpi;
  daysCount: number;
}

const LoadKpiCards: React.FC<LoadKpiCardsProps> = ({ kpi, daysCount }) => {
  const { t } = useT("load");
  const peak = kpi.peakHour != null ? `${String(kpi.peakHour).padStart(2, "0")}:00` : "—";
  const busiest = kpi.busiestWeekday != null ? WEEKDAYS[kpi.busiestWeekday] : "—";
  const deltaUp = (kpi.deltaPct ?? 0) >= 0;
  const deltaValue =
    kpi.deltaPct == null
      ? "—"
      : `${deltaUp ? "+" : ""}${kpi.deltaPct.toLocaleString("ru-RU")}%`;
  // ?? 0 — бэк без поля (выложен позже фронта) не должен давать NaN.
  const outsideMinutes = kpi.outsideMinutes ?? 0;
  const totalPct = loadPct(kpi.busyMinutes + outsideMinutes, kpi.scheduleMinutes);
  const utilizationSub = [
    kpi.scheduleMinutes > 0
      ? `${formatHours(kpi.busyMinutes)} из ${formatHours(kpi.scheduleMinutes)} ч`
      : "нет графика",
    kpi.scheduleMinutes > 0 && outsideMinutes > 0
      ? `+${outsideShare(outsideMinutes, kpi.scheduleMinutes)} вне графика`
      : null,
    kpi.attendanceUtilizationPct != null ? `СКУД ${kpi.attendanceUtilizationPct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
      <Tile
        icon={<WorkHistoryOutlined />}
        label="Загрузка по графику"
        value={totalPct == null ? "—" : `${totalPct}%`}
        sub={utilizationSub}
        tone={totalPct != null && totalPct > 100 ? "warning" : "accent"}
      />
      <Tile
        icon={<SpeedOutlined />}
        label="Пиковый час"
        value={peak}
        sub={kpi.peakHour != null ? t("count", { count: kpi.peakCount }) : t("noData")}
      />
      <Tile
        icon={<BarChartOutlined />}
        label="В среднем за день"
        value={kpi.avgDaily.toLocaleString("ru-RU")}
        sub={`за ${daysCount} дн · всего ${kpi.total}`}
      />
      <Tile
        icon={<CalendarViewWeekOutlined />}
        label="Загруженный день"
        value={busiest}
        sub={
          kpi.busiestWeekday != null
            ? `в среднем ${kpi.busiestWeekdayAvg.toLocaleString("ru-RU")}`
            : "нет данных"
        }
      />
      <Tile
        icon={kpi.deltaPct == null || deltaUp ? <TrendingUpOutlined /> : <TrendingDownOutlined />}
        label="К прошлому периоду"
        value={deltaValue}
        sub={`${kpi.total} против ${kpi.prevTotal}`}
        tone={kpi.deltaPct == null ? "accent" : deltaUp ? "success" : "error"}
      />
    </Stack>
  );
};

export default LoadKpiCards;
