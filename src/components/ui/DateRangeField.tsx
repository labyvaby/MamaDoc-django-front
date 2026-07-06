import React from "react";
import {
  Box,
  Button,
  Divider,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, type PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Dayjs;
  to: Dayjs;
}

export interface DateRangePreset {
  key: string;
  label: string;
  /** Inclusive [from, to]; component normalises to startOf/endOf day. */
  range: () => [Dayjs, Dayjs];
}

export interface DateRangeFieldProps {
  value: DateRange;
  onChange: (range: DateRange, presetKey: string | null) => void;
  /** Preset list (left column). Pass [] to hide presets (plain range). */
  presets?: DateRangePreset[];
  fullWidth?: boolean;
  minWidth?: number;
  disabled?: boolean;
}

// ── Default presets ──────────────────────────────────────────────────────────────

export const DEFAULT_RANGE_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Сегодня", range: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  { key: "7d", label: "Последние 7 дней", range: () => [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "30d", label: "Последние 30 дней", range: () => [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "month", label: "Этот месяц", range: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
  {
    key: "prevMonth",
    label: "Прошлый месяц",
    range: () => [
      dayjs().subtract(1, "month").startOf("month"),
      dayjs().subtract(1, "month").endOf("month"),
    ],
  },
];

// ── Range day cell ───────────────────────────────────────────────────────────────

type RangeDayProps = PickersDayProps & {
  from?: Dayjs;
  to?: Dayjs;
  pendingStart?: Dayjs | null;
};

function RangeDay(props: RangeDayProps) {
  const { day, outsideCurrentMonth, from, to, pendingStart, ...other } = props;
  const theme = useTheme();

  if (outsideCurrentMonth || !from || !to) {
    return <PickersDay {...other} day={day} outsideCurrentMonth={outsideCurrentMonth} disableMargin />;
  }

  // While picking, only the pending start is highlighted (as a single point).
  const start = pendingStart ?? from;
  const end = pendingStart ?? to;
  const isStart = day.isSame(start, "day");
  const isEnd = day.isSame(end, "day");
  const single = start.isSame(end, "day");
  const inRange = !single && day.isAfter(start, "day") && day.isBefore(end, "day");
  const isEndpoint = isStart || isEnd;

  const endpointRadius = single
    ? "50%"
    : isStart
      ? "50% 0 0 50%"
      : isEnd
        ? "0 50% 50% 0"
        : "0";

  return (
    <PickersDay
      {...other}
      day={day}
      outsideCurrentMonth={outsideCurrentMonth}
      disableMargin
      sx={{
        ...(inRange && {
          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.22 : 0.12),
          borderRadius: 0,
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.28) },
        }),
        ...(isEndpoint && {
          bgcolor: "primary.main",
          color: "primary.contrastText",
          borderRadius: endpointRadius,
          "&:hover, &:focus": { bgcolor: "primary.dark" },
        }),
      }}
    />
  );
}

// ── Label formatting ─────────────────────────────────────────────────────────────

function formatRange(from: Dayjs, to: Dayjs): string {
  const f = from.locale("ru");
  const t = to.locale("ru");
  if (f.isSame(t, "day")) return f.format("D MMM YYYY");
  if (f.isSame(t, "year")) {
    return f.isSame(t, "month")
      ? `${f.format("D")} – ${t.format("D MMM YYYY")}`
      : `${f.format("D MMM")} – ${t.format("D MMM YYYY")}`;
  }
  return `${f.format("D MMM YYYY")} – ${t.format("D MMM YYYY")}`;
}

function matchPreset(value: DateRange, presets: DateRangePreset[]): string | null {
  for (const p of presets) {
    const [f, t] = p.range();
    if (value.from.isSame(f, "day") && value.to.isSame(t, "day")) return p.key;
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────────

export const DateRangeField: React.FC<DateRangeFieldProps> = ({
  value,
  onChange,
  presets = DEFAULT_RANGE_PRESETS,
  fullWidth = false,
  minWidth,
  disabled = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [pendingStart, setPendingStart] = React.useState<Dayjs | null>(null);

  const open = Boolean(anchorEl);
  const activePreset = matchPreset(value, presets);
  const label = activePreset
    ? presets.find((p) => p.key === activePreset)!.label
    : formatRange(value.from, value.to);

  const close = () => {
    setAnchorEl(null);
    setPendingStart(null);
  };

  const applyPreset = (p: DateRangePreset) => {
    const [f, t] = p.range();
    onChange({ from: f.startOf("day"), to: t.endOf("day") }, p.key);
    close();
  };

  const handleDayClick = (day: Dayjs | null) => {
    if (!day) return;
    if (pendingStart == null) {
      setPendingStart(day.startOf("day"));
      return;
    }
    let from = pendingStart;
    let to = day;
    if (to.isBefore(from, "day")) [from, to] = [to, from];
    onChange({ from: from.startOf("day"), to: to.endOf("day") }, null);
    close();
  };

  return (
    <>
      <Box
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => !disabled && setAnchorEl(e.currentTarget)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setAnchorEl(e.currentTarget as HTMLElement);
          }
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          height: 40,
          px: 1.5,
          width: fullWidth ? "100%" : "auto",
          minWidth,
          borderRadius: "10px",
          border: "1px solid",
          borderColor: open ? "primary.main" : "divider",
          boxShadow: open ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.16)}` : "none",
          bgcolor: "background.paper",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "border-color .15s ease, box-shadow .15s ease",
          "&:hover": { borderColor: disabled ? "divider" : alpha(theme.palette.primary.main, 0.4) },
        }}
      >
        <CalendarMonthOutlined sx={{ fontSize: 20, color: "primary.onSurface", flexShrink: 0 }} />
        <Typography variant="body2" fontWeight={500} noWrap sx={{ flex: 1 }}>
          {label}
        </Typography>
        <ExpandMoreOutlined
          sx={{
            fontSize: 20,
            color: "text.secondary",
            flexShrink: 0,
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: "14px", overflow: "hidden" } } }}
      >
        <Stack direction={{ xs: "column", sm: "row" }}>
          {presets.length > 0 && (
            <Stack
              sx={{
                p: 0.75,
                minWidth: { sm: 160 },
                borderRight: { sm: "1px solid" },
                borderBottom: { xs: "1px solid", sm: "none" },
                borderColor: { xs: "divider", sm: "divider" },
                flexDirection: { xs: "row", sm: "column" },
                flexWrap: { xs: "wrap", sm: "nowrap" },
                gap: { xs: 0.5, sm: 0 },
              }}
            >
              {presets.map((p) => {
                const selected = p.key === activePreset;
                return (
                  <Button
                    key={p.key}
                    size="small"
                    onClick={() => applyPreset(p)}
                    sx={{
                      justifyContent: { xs: "center", sm: "flex-start" },
                      textTransform: "none",
                      fontWeight: selected ? 600 : 400,
                      color: selected ? "primary.onSurface" : "text.secondary",
                      bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                      "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                    }}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </Stack>
          )}

          <Box sx={{ p: 0.5 }}>
            <DateCalendar
              value={null}
              referenceDate={value.from}
              onChange={handleDayClick}
              views={["day"]}
              slots={{ day: RangeDay as unknown as React.ComponentType<PickersDayProps> }}
              slotProps={{
                day: { from: value.from, to: value.to, pendingStart } as Partial<RangeDayProps>,
              }}
              sx={{ width: isMobile ? 300 : 320 }}
            />
            {pendingStart && (
              <>
                <Divider />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", px: 1.5, py: 0.75 }}
                >
                  Начало: {pendingStart.locale("ru").format("D MMM")} — выберите конец периода
                </Typography>
              </>
            )}
          </Box>
        </Stack>
      </Popover>
    </>
  );
};

export default DateRangeField;
