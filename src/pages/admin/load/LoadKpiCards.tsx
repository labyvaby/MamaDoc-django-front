import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SpeedOutlined from "@mui/icons-material/SpeedOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import CalendarViewWeekOutlined from "@mui/icons-material/CalendarViewWeekOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";

import { subtleBg } from "../../../theme/uiHelpers";
import type { LoadKpi } from "../../../api/load";

const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

type Tone = "accent" | "success" | "error";

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
          color:
            tone === "accent"
              ? "primary.onSurface"
              : tone === "success"
                ? "success.main"
                : "error.main",
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
      {sub && (
        <Typography variant="caption" color="text.disabled" display="block" noWrap>
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
  const peak = kpi.peakHour != null ? `${String(kpi.peakHour).padStart(2, "0")}:00` : "—";
  const busiest = kpi.busiestWeekday != null ? WEEKDAYS[kpi.busiestWeekday] : "—";
  const deltaUp = (kpi.deltaPct ?? 0) >= 0;
  const deltaValue =
    kpi.deltaPct == null
      ? "—"
      : `${deltaUp ? "+" : ""}${kpi.deltaPct.toLocaleString("ru-RU")}%`;

  return (
    <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
      <Tile
        icon={<SpeedOutlined />}
        label="Пиковый час"
        value={peak}
        sub={kpi.peakHour != null ? `${kpi.peakCount} приёмов` : "нет данных"}
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
