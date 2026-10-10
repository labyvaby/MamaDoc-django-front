import React from "react";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import dayjs from "dayjs";

import type { AiUsageByDay } from "../../api/aiUsage";
import { formatTokens, formatTokensShort } from "./aiUsageRows";

/** Токены по дням; пропуски уже заполнены нулями (fillUsageDays). */
export const AiUsageChart: React.FC<{ days: AiUsageByDay[] }> = ({ days }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.palette.divider} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => dayjs(d).format("DD.MM")}
          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
          axisLine={{ stroke: theme.palette.divider }}
          tickLine={false}
          minTickGap={isMobile ? 16 : 8}
        />
        <YAxis
          tickFormatter={(v: number) => formatTokensShort(v)}
          tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
          axisLine={false}
          tickLine={false}
          width={64}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: theme.palette.action.hover }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as AiUsageByDay | undefined) : undefined;
            if (!p) return null;
            return (
              <Box
                sx={{
                  px: 1.25,
                  py: 1,
                  borderRadius: "8px",
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Typography variant="caption" color="text.secondary" display="block">
                  {dayjs(p.date).format("DD.MM.YYYY, dd")}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatTokens(p.totalTokens)} токенов
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Обращений: {formatTokens(p.requests)}
                </Typography>
              </Box>
            );
          }}
        />
        <Bar dataKey="totalTokens" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
};
