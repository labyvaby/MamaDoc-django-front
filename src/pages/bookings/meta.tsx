import React from "react";
import { Box, Chip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import dayjs from "dayjs";

import type { BookingStatus } from "../../api/bookings";
import { subtleBg } from "../../theme/uiHelpers";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; color: ChipColor }
> = {
  pending: { label: "Ожидает", color: "warning" },
  confirmed: { label: "Подтверждена", color: "info" },
  completed: { label: "Завершена", color: "success" },
  cancelled: { label: "Отменена", color: "error" },
  no_show: { label: "Неявка", color: "default" },
};

export const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "pending", label: "Ожидает" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
  { value: "no_show", label: "Неявка" },
];

/** Статусы, из которых бронь уже никуда не переходит. */
export const isTerminalBookingStatus = (status: BookingStatus): boolean =>
  status === "completed" || status === "cancelled" || status === "no_show";

// ── Цвета ─────────────────────────────────────────────────────────────────────

/** Палитра-тон для статуса брони (null — нейтральный). */
export function statusTone(t: Theme, status: BookingStatus) {
  switch (BOOKING_STATUS_META[status]?.color) {
    case "warning":
      return t.palette.warning;
    case "info":
      return t.palette.info;
    case "success":
      return t.palette.success;
    case "error":
      return t.palette.error;
    default:
      return null;
  }
}

/** Тонированный статус-чип в стиле карточек проекта (список + карточка брони). */
export const StatusChip: React.FC<{ status: BookingStatus; size?: "small" | "medium" }> = ({
  status,
  size = "small",
}) => {
  const m = BOOKING_STATUS_META[status];
  if (!m) return <>{status}</>;
  return (
    <Chip
      size="small"
      label={m.label}
      icon={
        <Box
          component="span"
          sx={(t) => {
            const tone = statusTone(t, status);
            return {
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor: tone ? tone.main : t.palette.grey[500],
              ml: 0.75,
            };
          }}
        />
      }
      sx={(t) => {
        const tone = statusTone(t, status);
        return {
          fontWeight: 500,
          height: size === "medium" ? 28 : 24,
          borderRadius: "7px",
          "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
          color: tone
            ? t.palette.mode === "dark"
              ? tone.light
              : tone.dark
            : "text.secondary",
          bgcolor: tone
            ? alpha(tone.main, t.palette.mode === "dark" ? 0.2 : 0.14)
            : subtleBg(t, true),
        };
      }}
    />
  );
};

// ── Время брони ───────────────────────────────────────────────────────────────

/**
 * Начало брони как момент времени. Бэк отдаёт дату и время раздельно
 * (`date: YYYY-MM-DD`, `time: HH:mm`), поэтому склеиваем их сами.
 */
export function bookingStart(date: string, time: string) {
  return dayjs(`${date}T${(time || "00:00").slice(0, 5)}`);
}

/** «10:00 – 10:30» из времени начала и длительности; без длительности — начало. */
export function bookingTimeRange(time: string, durationMin: number | null | undefined): string {
  const start = (time || "").slice(0, 5);
  if (!start || !durationMin) return start || "—";
  const end = dayjs(`2000-01-01T${start}`).add(durationMin, "minute").format("HH:mm");
  return `${start} – ${end}`;
}

export type BookingTimeHint = {
  text: string;
  /** `warning` — требует внимания (просрочена / скоро), `default` — просто справка. */
  tone: "warning" | "default";
};

/**
 * Подсказка «когда»: скоро / сегодня / просрочена. Считается только для живых
 * броней — у завершённой или отменённой напоминать не о чем.
 *
 * Просроченной считаем `pending` с уже прошедшим временем: такая бронь висит
 * необработанной, и это главный повод открыть карточку.
 */
export function bookingTimeHint(
  date: string,
  time: string,
  status: BookingStatus,
): BookingTimeHint | null {
  if (isTerminalBookingStatus(status)) return null;
  const start = bookingStart(date, time);
  if (!start.isValid()) return null;
  const now = dayjs();
  const diffMin = start.diff(now, "minute");

  if (diffMin < 0) {
    if (status === "pending") {
      return {
        text: start.isSame(now, "day") ? "время прошло, не обработана" : "просрочена",
        tone: "warning",
      };
    }
    return { text: start.isSame(now, "day") ? "время прошло" : "прошедшая дата", tone: "default" };
  }
  if (diffMin < 60) return { text: `через ${Math.max(diffMin, 1)} мин`, tone: "warning" };
  if (start.isSame(now, "day")) return { text: `сегодня, через ${Math.round(diffMin / 60)} ч`, tone: "warning" };
  if (start.isSame(now.add(1, "day"), "day")) return { text: "завтра", tone: "default" };
  const days = start.startOf("day").diff(now.startOf("day"), "day");
  if (days <= 7) return { text: `через ${days} дн.`, tone: "default" };
  return null;
}
