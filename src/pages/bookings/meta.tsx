import React from "react";
import { Box, Chip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import dayjs from "dayjs";

import type { BookingPrepaymentStatus, BookingStatus } from "../../api/bookings";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; color: ChipColor }
> = {
  // Ещё не заявка: бронь держит слот и ждёт подтверждения оплаты банком,
  // администратору с ней делать нечего — потому нейтральный тон.
  awaiting_payment: { label: "Ждёт оплаты", color: "default" },
  pending: { label: "Ожидает", color: "warning" },
  confirmed: { label: "Подтверждена", color: "info" },
  completed: { label: "Завершена", color: "success" },
  cancelled: { label: "Отменена", color: "error" },
  no_show: { label: "Неявка", color: "default" },
};

export const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "awaiting_payment", label: "Ждёт оплаты" },
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

// ── Онлайн-предоплата ─────────────────────────────────────────────────────────

export const BOOKING_PREPAYMENT_META: Record<
  BookingPrepaymentStatus,
  { label: string; color: ChipColor }
> = {
  pending: { label: "Ждём оплату", color: "warning" },
  paid: { label: "Оплачена", color: "success" },
  expired: { label: "Ссылка истекла", color: "default" },
  failed: { label: "Оплата не прошла", color: "error" },
};

/**
 * Сколько осталось у ссылки банка (15 минут от создания). Это ответ на вопрос
 * «почему бронь исчезла»: по истечении её снимает поллер. У оплаченной брони
 * таймер уже не важен — деньги пришли, дальше решает администратор.
 */
export function prepaymentExpiryText(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const end = dayjs(expiresAt);
  if (!end.isValid()) return null;
  const minutes = end.diff(dayjs(), "minute");
  if (minutes < 0) return "ссылка истекла";
  return `ссылка действует ещё ${Math.max(minutes, 1)} мин`;
}

/** Есть ли у брони онлайн-предоплата вообще (у врача без неё поле null). */
export function hasPrepayment(b: {
  prepaymentStatus?: BookingPrepaymentStatus | null;
}): boolean {
  return b.prepaymentStatus != null;
}

/**
 * Статус оплаты рядом со статусом брони: оплаченная должна отличаться от
 * неоплаченной — её администратор подтверждает в первую очередь.
 * `prepaymentNeedsAttention` (деньги есть, приёма не будет) выделяем отдельно:
 * такие брони обязаны быть на виду.
 */
export const PrepaymentChip: React.FC<{
  status: BookingPrepaymentStatus;
  amount?: string | null;
  needsAttention?: boolean;
}> = ({ status, amount, needsAttention }) => {
  const m = BOOKING_PREPAYMENT_META[status];
  if (!m) return <>{status}</>;
  const label = amount ? `${m.label} · ${formatKGS(amount)}` : m.label;
  return (
    <Chip
      size="small"
      label={needsAttention ? `⚠ ${label}` : label}
      sx={(t) => {
        const tone = needsAttention
          ? t.palette.error
          : m.color === "success"
            ? t.palette.success
            : m.color === "warning"
              ? t.palette.warning
              : m.color === "error"
                ? t.palette.error
                : null;
        return {
          fontWeight: 500,
          height: 24,
          borderRadius: "7px",
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
  // Бронь, ждущая оплаты, администратора не касается: её судьбу решает банк, а
  // не обработка — по истечении ссылки её снимет поллер.
  if (status === "awaiting_payment") return null;
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
