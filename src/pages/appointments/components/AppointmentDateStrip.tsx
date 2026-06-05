import React from "react";
import { Box, Chip, Stack, Typography, IconButton } from "@mui/material";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

interface AppointmentDateStripProps {
  date: Dayjs;
  onDateChange: (d: Dayjs) => void;
  dayCounts: Record<string, number>;
}

const STRIP_DAYS = 14;

const AppointmentDateStrip: React.FC<AppointmentDateStripProps> = ({
  date,
  onDateChange,
  dayCounts,
}) => {
  const today = dayjs().startOf("day");

  // Centre window: show days around the selected date
  const windowStart = React.useMemo(() => {
    const centre = date.startOf("day");
    return centre.subtract(Math.floor(STRIP_DAYS / 2), "day");
  }, [date]);

  const days = React.useMemo(() => {
    return Array.from({ length: STRIP_DAYS }, (_, i) => windowStart.add(i, "day"));
  }, [windowStart]);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Scroll active day into view on mount/change
  React.useLayoutEffect(() => {
    const el = scrollRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [date]);

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      sx={{ minWidth: 0, flexShrink: 0 }}
    >
      <IconButton
        size="small"
        onClick={() => onDateChange(date.subtract(1, "day"))}
        sx={{ flexShrink: 0 }}
      >
        <ChevronLeftOutlined fontSize="small" />
      </IconButton>

      <Box
        ref={scrollRef}
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 0.75,
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          flex: 1,
          minWidth: 0,
          py: 0.5,
        }}
      >
        {days.map((d) => {
          const key = d.format("YYYY-MM-DD");
          const isActive = d.isSame(date, "day");
          const isToday = d.isSame(today, "day");
          const count = dayCounts[key];

          return (
            <Box
              key={key}
              data-active={isActive ? "true" : undefined}
              onClick={() => onDateChange(d)}
              sx={{
                flexShrink: 0,
                cursor: "pointer",
                borderRadius: 2,
                px: 1,
                py: 0.5,
                minWidth: 46,
                textAlign: "center",
                bgcolor: isActive ? "primary.main" : "transparent",
                border: "1px solid",
                borderColor: isActive
                  ? "primary.main"
                  : isToday
                  ? "primary.light"
                  : "divider",
                transition: "all 150ms",
                "&:hover": {
                  bgcolor: isActive ? "primary.dark" : "action.hover",
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  color: isActive
                    ? "primary.contrastText"
                    : isToday
                    ? "primary.main"
                    : "text.secondary",
                  lineHeight: 1.2,
                  fontSize: "0.68rem",
                  textTransform: "capitalize",
                }}
              >
                {d.format("dd")}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: isActive ? "primary.contrastText" : "text.primary",
                  lineHeight: 1.2,
                }}
              >
                {d.format("D")}
              </Typography>
              {count != null && count > 0 ? (
                <Chip
                  label={count}
                  size="small"
                  sx={{
                    height: 14,
                    mt: 0.25,
                    fontSize: "0.6rem",
                    bgcolor: isActive ? "rgba(255,255,255,0.25)" : "action.selected",
                    color: isActive ? "primary.contrastText" : "text.secondary",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              ) : (
                <Box sx={{ height: 18 }} />
              )}
            </Box>
          );
        })}
      </Box>

      <IconButton
        size="small"
        onClick={() => onDateChange(date.add(1, "day"))}
        sx={{ flexShrink: 0 }}
      >
        <ChevronRightOutlined fontSize="small" />
      </IconButton>
    </Stack>
  );
};

export default AppointmentDateStrip;
