import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatAcuity } from "./visionNorms";
import type { TrendPoint } from "./visionSignals";

/** Острота OD и OS по осмотрам, пунктир — норма по возрасту на дату осмотра. */
export const VisionTrendChart: React.FC<{ points: TrendPoint[] }> = ({ points }) => {
  const theme = useTheme();
  const top = Math.max(1.2, ...points.flatMap((point) => [point.od ?? 0, point.os ?? 0]));
  const tick = { fontSize: 12, fill: theme.palette.text.secondary };
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Динамика остроты
      </Typography>
      <Box sx={{ height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={tick} />
            <YAxis domain={[0, Math.ceil(top * 10) / 10]} tickFormatter={(value: number) => formatAcuity(value)} tick={tick} />
            <Tooltip formatter={(value) => formatAcuity(Number(value ?? 0))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="stepAfter"
              dataKey="norm"
              name="Норма по возрасту"
              stroke={theme.palette.text.disabled}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="od"
              name="Правый (OD)"
              stroke={theme.palette.info.main}
              strokeWidth={2.5}
              dot={{ r: 3.5 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="os"
              name="Левый (OS)"
              stroke={theme.palette.secondary.main}
              strokeWidth={2.5}
              dot={{ r: 3.5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};
