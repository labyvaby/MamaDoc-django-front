import React from "react";
import { Box, Stack, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import dayjs from "dayjs";

import type { ScheduleRow, ScheduleState } from "./orthoSchedule";

const STATE_TEXT: Record<ScheduleState, string> = {
  done: "пройдено",
  missed: "пропущено",
  due: "сейчас",
  upcoming: "впереди",
  nodata: "нет данных",
};

/** Сроки осмотров ортопеда по 211н (ТЗ §3.6): пройдено, пропущено, сейчас, впереди. */
export const OrthoScheduleStrip: React.FC<{ rows: ScheduleRow[] }> = ({ rows }) => {
  const theme = useTheme();
  const tone = (state: ScheduleState): string =>
    state === "done"
      ? theme.palette.success.main
      : state === "missed"
        ? theme.palette.error.main
        : state === "due"
          ? theme.palette.warning.main
          : state === "nodata"
            ? theme.palette.text.secondary
            : theme.palette.text.disabled;
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Сроки осмотров ортопеда</Typography>
        <Typography variant="caption" color="text.secondary">
          по приказу 211н
        </Typography>
      </Stack>
      <Box sx={{ display: "grid", gap: 0.75, gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
        {rows.map((row) => {
          const color = tone(row.state);
          return (
            <Tooltip key={row.key} arrow title={`${row.note}${row.doneAt ? ` · осмотр ${dayjs(row.doneAt).format("DD.MM.YYYY")}` : ""}`}>
              <Box
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: "10px",
                  border: `1px ${row.state === "upcoming" || row.state === "nodata" ? "dashed" : "solid"} ${alpha(color, row.state === "upcoming" || row.state === "nodata" ? 0.5 : 0.45)}`,
                  bgcolor: row.state === "upcoming" || row.state === "nodata" ? "transparent" : alpha(color, 0.08),
                }}
              >
                <Stack direction="row" alignItems="center" gap={0.5}>
                  {row.state === "done" && <CheckOutlined sx={{ fontSize: 14, color }} />}
                  <Typography variant="body2" fontWeight={700}>
                    {row.label}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
                  {STATE_TEXT[row.state]}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};
