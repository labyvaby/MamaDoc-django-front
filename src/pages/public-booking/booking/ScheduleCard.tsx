import React from "react";
import { Box, ButtonBase, Paper, Skeleton, Stack, Typography } from "@mui/material";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";

import type { AvailableTimeSlot, CalendarDay } from "../../../api/publicBooking";
import {
  BOOKING_RADIUS,
  BOOKING_SHADOW,
  BORDER_HOVER,
  DISABLED_TEXT,
  DIVIDER,
  MUTED,
  THIN_SCROLLBAR,
  TILE_RADIUS,
  dayTone,
  slotTone,
  slotsChipTone,
} from "../theme";
import { formatDayLong, formatSlotsCount } from "../format";
import { useT } from "../../../i18n/VerticalProvider";

// ── Плитка дня ───────────────────────────────────────────────────────────────

/**
 * День календаря: подпись сверху, число, месяц и чип с количеством окон.
 * «Сегодня» и «Завтра» вместо дня недели подсвечены синим — так ближайшие даты
 * находятся взглядом сразу.
 */
const DayTile: React.FC<{ day: CalendarDay; active: boolean; onClick: () => void }> = ({
  day,
  active,
  onClick,
}) => {
  const { t } = useT("publicBooking");
  const value = new Date(`${day.date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((value.getTime() - today.getTime()) / 86_400_000);
  const isSpecial = diffDays === 0 || diffDays === 1;

  const topLabel = isSpecial
    ? diffDays === 0
      ? t("today")
      : t("tomorrow")
    : value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
  const month = value.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");

  const tone = active ? dayTone.picked : day.isAvailable ? dayTone.free : dayTone.empty;
  const chip = active
    ? slotsChipTone.picked
    : day.isAvailable
      ? slotsChipTone.free
      : slotsChipTone.empty;

  return (
    <ButtonBase
      disabled={!day.isAvailable}
      onClick={onClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        scrollSnapAlign: "start",
        width: { xs: 66, md: "auto" },
        height: 88,
        px: 0.5,
        py: 1,
        border: 1,
        borderRadius: TILE_RADIUS,
        borderColor: tone.border,
        bgcolor: tone.bg,
        transition: "all .2s",
        ...(active ? { boxShadow: dayTone.picked.shadow } : null),
        "&:hover:not(.Mui-disabled)": active ? {} : { borderColor: BORDER_HOVER },
        "&.Mui-disabled": { cursor: "not-allowed", pointerEvents: "auto" },
      }}
    >
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 600,
          lineHeight: 1,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          color: active
            ? "rgba(255,255,255,0.85)"
            : !day.isAvailable
              ? DISABLED_TEXT
              : isSpecial
                ? slotTone.picked.bg
                : MUTED,
        }}
      >
        {topLabel}
      </Typography>

      <Typography
        sx={{
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          color: active ? "#FFFFFF" : day.isAvailable ? "text.primary" : DISABLED_TEXT,
        }}
      >
        {value.getDate()}
      </Typography>

      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 500,
          lineHeight: 1,
          color: active
            ? "rgba(255,255,255,0.85)"
            : day.isAvailable
              ? "text.secondary"
              : DISABLED_TEXT,
        }}
      >
        {month}
      </Typography>

      <Box
        sx={{
          px: 0.75,
          py: 0.5,
          borderRadius: 999,
          fontSize: 8,
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: "nowrap",
          bgcolor: chip.bg,
          color: chip.text,
        }}
      >
        {formatSlotsCount(day.slotsCount)}
      </Box>
    </ButtonBase>
  );
};

// ── Карточка расписания ──────────────────────────────────────────────────────

interface ScheduleCardProps {
  calendar: CalendarDay[];
  calendarLoading: boolean;
  selectedDate: string | null;
  onDateChange: (date: string) => void;
  selectedTime: string | null;
  onTimeChange: (time: string) => void;
  slots: AvailableTimeSlot[];
  timesLoading: boolean;
  dateError?: boolean;
  timeError?: boolean;
}

/**
 * Выбор даты и времени. Блок времени появляется только после выбора даты —
 * до этого показывать нечего.
 */
export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  calendar,
  calendarLoading,
  selectedDate,
  onDateChange,
  selectedTime,
  onTimeChange,
  slots,
  timesLoading,
  dateError,
  timeError,
}) => {
  const { t } = useT("publicBooking");
  const hasBusy = slots.some((slot) => slot.busy);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: BOOKING_RADIUS,
        border: "none",
        boxShadow: BOOKING_SHADOW,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* Даты */}
      <Box
        sx={{
          m: -0.5,
          p: 0.5,
          borderRadius: TILE_RADIUS,
          border: 2,
          borderColor: dateError ? "error.light" : "transparent",
          transition: "border-color .2s",
        }}
      >
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography
            sx={{ fontSize: 15, fontWeight: 600, color: dateError ? "error.main" : "text.primary" }}
          >
            {t("chooseDate")}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: MUTED }}>
            {t("nearestDays", { count: calendar.length })}
          </Typography>
        </Stack>

        {calendarLoading ? (
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: { xs: "repeat(4, 1fr)", md: "repeat(6, 1fr)", xl: "repeat(7, 1fr)" },
            }}
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: TILE_RADIUS }} />
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: { xs: "flex", md: "grid" },
              gap: 1,
              // На телефоне даты листаются лентой вбок, на десктопе лежат сеткой
              // с собственной прокруткой — как в эталоне.
              overflowX: { xs: "auto", md: "visible" },
              scrollSnapType: { xs: "x proximity", md: "none" },
              pb: { xs: 0.75, md: 0 },
              gridTemplateColumns: { md: "repeat(6, 1fr)", xl: "repeat(7, 1fr)" },
              maxHeight: { md: 300 },
              overflowY: { md: "auto" },
              pr: { md: 0.5 },
              ...THIN_SCROLLBAR,
            }}
          >
            {calendar.map((day) => (
              <DayTile
                key={day.date}
                day={day}
                active={selectedDate === day.date}
                onClick={() => onDateChange(day.date)}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Время */}
      {selectedDate && (
        <Box
          sx={{
            m: -0.5,
            p: 0.5,
            borderRadius: TILE_RADIUS,
            border: 2,
            borderColor: timeError ? "error.light" : "transparent",
            animation: "bookingFadeUp .3s ease both",
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            sx={{ mb: 0.5, pt: 2, borderTop: `1px solid ${DIVIDER}` }}
          >
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                color: timeError ? "error.main" : "text.primary",
              }}
            >
              {t("chooseTime")}
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: MUTED }}>
              {formatDayLong(selectedDate)}
            </Typography>
          </Stack>

          {/* Легенда нужна только когда часть слотов занята. */}
          {hasBusy && !timesLoading ? (
            <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "#FFFFFF",
                    border: "1px solid #C9CDD4",
                  }}
                />
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{t("slotFree")}</Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#E2E4E9" }} />
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{t("slotBusy")}</Typography>
              </Stack>
            </Stack>
          ) : (
            <Box sx={{ mb: 1 }} />
          )}

          {timesLoading ? (
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: {
                  xs: "repeat(4, 1fr)",
                  sm: "repeat(5, 1fr)",
                  md: "repeat(6, 1fr)",
                },
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={40} sx={{ borderRadius: TILE_RADIUS }} />
              ))}
            </Box>
          ) : slots.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: {
                  xs: "repeat(4, 1fr)",
                  sm: "repeat(5, 1fr)",
                  md: "repeat(6, 1fr)",
                },
              }}
            >
              {slots.map((slot) => {
                const picked = selectedTime === slot.time;
                const tone = slot.busy ? slotTone.busy : picked ? slotTone.picked : slotTone.idle;
                return (
                  <ButtonBase
                    key={slot.time}
                    disabled={slot.busy}
                    onClick={() => onTimeChange(slot.time)}
                    sx={{
                      height: 40,
                      borderRadius: TILE_RADIUS,
                      border: 1,
                      borderColor: tone.border,
                      bgcolor: tone.bg,
                      color: tone.text,
                      fontSize: 14,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      transition: "all .2s",
                      ...(slot.busy ? { textDecoration: "line-through" } : null),
                      ...(picked ? { boxShadow: slotTone.picked.bg && "0 4px 12px rgba(0,123,255,0.3)" } : null),
                      "&:hover:not(.Mui-disabled)": picked
                        ? {}
                        : { borderColor: slotTone.picked.bg, color: slotTone.picked.bg },
                      "&.Mui-disabled": { color: tone.text, cursor: "not-allowed", pointerEvents: "auto" },
                    }}
                  >
                    {slot.time}
                  </ButtonBase>
                );
              })}
            </Box>
          ) : (
            <Stack alignItems="center" spacing={1} sx={{ py: 4, textAlign: "center" }}>
              <ScheduleOutlined sx={{ fontSize: 36, color: DISABLED_TEXT }} />
              <Typography sx={{ fontSize: 14, color: MUTED }}>{t("noTimesForDay")}</Typography>
            </Stack>
          )}
        </Box>
      )}
    </Paper>
  );
};
