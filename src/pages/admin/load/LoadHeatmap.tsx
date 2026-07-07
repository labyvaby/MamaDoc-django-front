import React, { useMemo } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import type { HeatCell } from "../../../api/load";

const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAYS_FULL = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

interface Props {
  cells: HeatCell[];
}

export const LoadHeatmap: React.FC<Props> = ({ cells }) => {
  const theme = useTheme();

  const { hours, grid, max } = useMemo(() => {
    // grid[weekday][hour] = count
    const g: Record<number, Record<number, number>> = {};
    let hi = 20;
    let lo = 8;
    let m = 0;
    for (const c of cells) {
      (g[c.weekday] ??= {})[c.hour] = c.count;
      if (c.count > m) m = c.count;
      if (c.hour < lo) lo = c.hour;
      if (c.hour > hi) hi = c.hour;
    }
    const hrs: number[] = [];
    for (let h = lo; h <= hi; h++) hrs.push(h);
    return { hours: hrs, grid: g, max: m };
  }, [cells]);

  const cellBg = (count: number): string => {
    if (!count || max === 0) return alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.06 : 0.04);
    const ratio = count / max;
    return alpha(theme.palette.primary.main, 0.12 + 0.78 * ratio);
  };

  const legendStop = (r: number) =>
    r === 0
      ? alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.06 : 0.04)
      : alpha(theme.palette.primary.main, 0.12 + 0.78 * r);

  return (
    <Box sx={{ overflowX: "auto", scrollbarWidth: "thin" }}>
      <Box sx={{ minWidth: 40 + hours.length * 34 }}>
        {/* Заголовок с часами */}
        <Box sx={{ display: "flex", gap: "3px", mb: "3px", pl: "34px" }}>
          {hours.map((h) => (
            <Box
              key={h}
              sx={{ flex: 1, textAlign: "center", fontSize: "0.65rem", color: "text.disabled" }}
            >
              {String(h).padStart(2, "0")}
            </Box>
          ))}
        </Box>

        {/* Строки дней недели */}
        {WEEKDAYS_SHORT.map((wd, wi) => (
          <Box key={wd} sx={{ display: "flex", gap: "3px", mb: "3px", alignItems: "center" }}>
            <Box sx={{ width: "31px", fontSize: "0.7rem", color: "text.secondary", flexShrink: 0 }}>
              {wd}
            </Box>
            {hours.map((h) => {
              const count = grid[wi]?.[h] ?? 0;
              return (
                <Tooltip
                  key={h}
                  title={count > 0 ? `${WEEKDAYS_FULL[wi]}, ${String(h).padStart(2, "0")}:00 — ${count}` : ""}
                  disableInteractive
                  arrow
                >
                  <Box
                    sx={{
                      flex: 1,
                      height: 22,
                      borderRadius: "4px",
                      bgcolor: cellBg(count),
                      cursor: count > 0 ? "default" : "default",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ))}

        {/* Легенда */}
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, pl: "34px" }}>
          <Typography variant="caption" color="text.disabled">
            Меньше
          </Typography>
          {[0, 0.25, 0.55, 1].map((r) => (
            <Box key={r} sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: legendStop(r) }} />
          ))}
          <Typography variant="caption" color="text.disabled">
            Больше
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
};

export default LoadHeatmap;
