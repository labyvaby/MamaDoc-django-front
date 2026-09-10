import React from "react";
import { Box, Chip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import dayjs, { type Dayjs } from "dayjs";

import type { BookingPrepaymentStatus, BookingStatus } from "../../api/bookings";
import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; color: ChipColor }
> = {
  // Ещё не заявка: бронь держит слот и ждёт подтверждения оплаты банком,
  // администратору с ней делать нечего — тёплый тон, потому что слот занят и
  // висит на таймере (см. StatusChip: рядом тикает обратный отсчёт 15 минут).
  awaiting_payment: { label: "Идёт оплата", color: "warning" },
  pending: { label: "Ожидает", color: "warning" },
  confirmed: { label: "Подтверждена", color: "info" },
  completed: { label: "Завершена", color: "success" },
  cancelled: { label: "Отменена", color: "error" },
  no_show: { label: "Неявка", color: "default" },
};

/**
 * Тикающее «сейчас» — держит обратный отсчёт оплаты живым без опроса бэка.
 * `active=false` (например, в выборке вообще нет предоплаты) — таймер не
 * заводим, `now` останется одним и тем же значением на весь рендер страницы.
 */
export function useTickingClock(intervalMs = 15000, active = true): Dayjs {
  const [now, setNow] = React.useState(() => dayjs());
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(dayjs()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/**
 * Обратный отсчёт до истечения ссылки на оплату (15 минут от создания брони).
 * `urgent` — последние 2 минуты: чип на грани истечения красим тревожнее.
 */
function awaitingPaymentCountdown(
  expiresAt: string | null | undefined,
  now: Dayjs,
): { text: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const end = dayjs(expiresAt);
  if (!end.isValid()) return null;
  const totalSeconds = end.diff(now, "second");
  if (totalSeconds <= 0) return { text: "истекает", urgent: true };
  const minutes = Math.ceil(totalSeconds / 60);
  return { text: `${minutes} мин`, urgent: minutes <= 2 };
}

export const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "awaiting_payment", label: "Идёт оплата" },
  { value: "pending", label: "Ожидает" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
  { value: "no_show", label: "Неявка" },
];

/** Статусы, из которых бронь уже никуда не переходит. */
export const isTerminalBookingStatus = (status: BookingStatus): boolean =>
  status === "completed" || status === "cancelled" || status === "no_show";

/**
 * «Закрытая» бронь — та, по которой персоналу делать нечего: отменённая,
 * неявка и **просроченная оплата**.
 *
 * Просроченная `awaiting_payment` формально ещё «в процессе», но фактически
 * мертва: ссылка банка живёт 15 минут, слот такая бронь уже не держит,
 * заплатить по ней нельзя, а подтвердить её нельзя тем более (бэк отвечает
 * 400). Её должен снять поллер бэка — но делает он это с задержкой (Celery
 * нет, это management-команда по расписанию), и всё это время список забит
 * записями, которые никогда не станут приёмами.
 *
 * Основной признак — `prepaymentStatus: "expired"`: с §9.2 контракта броней
 * (10.09.2026) бэк выводит его при чтении, не дожидаясь поллера, так что
 * читать статус достаточно. Проверено на тесте: все 12 просроченных приходят
 * `expired`, а бронь с истёкшей ссылкой, по которой деньги всё-таки пришли,
 * остаётся `paid` — то есть статус точнее часов браузера.
 *
 * ⚠ Сравнение с часами оставлено фолбэком: на проде §9 на 10.09.2026 не
 * выложен, там просроченные брони всё ещё приходят `pending`. Как приедет —
 * ветку с `prepaymentExpiresAt` можно снять.
 *
 * `awaiting_payment` без срока и без статуса закрытой не считаем: срок
 * неизвестен, а скрывать то, о чём нечего утверждать, нельзя.
 *
 * `completed` сюда не входит: выполненная бронь — законная история приёма.
 */
export function isBookingClosed(
  b: {
    status: BookingStatus;
    prepaymentStatus?: BookingPrepaymentStatus | null;
    prepaymentExpiresAt?: string | null;
  },
  now: Dayjs = dayjs(),
): boolean {
  if (b.status === "cancelled" || b.status === "no_show") return true;
  if (b.status !== "awaiting_payment") return false;
  if (b.prepaymentStatus === "expired") return true;
  // Деньги дошли — бронь живая, сколько бы ни показывали часы браузера: ссылка
  // могла истечь уже после оплаты (на тесте такая бронь есть).
  if (b.prepaymentStatus === "paid") return false;
  if (!b.prepaymentExpiresAt) return false;
  const end = dayjs(b.prepaymentExpiresAt);
  return end.isValid() && end.isBefore(now);
}

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

/**
 * Тонированный статус-чип в стиле карточек проекта (список + карточка брони).
 *
 * `expiresAt`/`now` — только для `awaiting_payment`: рядом с меткой тикает
 * обратный отсчёт («Идёт оплата · 12 мин»), последние 2 минуты — тревожным
 * (error) тоном вместо обычного warning. Без `now` (вызовы, которым таймер не
 * нужен) статус просто показывается без отсчёта — как раньше.
 */
export const StatusChip: React.FC<{
  status: BookingStatus;
  size?: "small" | "medium";
  expiresAt?: string | null;
  now?: Dayjs;
}> = ({ status, size = "small", expiresAt, now }) => {
  const m = BOOKING_STATUS_META[status];
  if (!m) return <>{status}</>;

  const countdown =
    status === "awaiting_payment" && now ? awaitingPaymentCountdown(expiresAt, now) : null;
  const label = countdown ? `${m.label} · ${countdown.text}` : m.label;
  const urgentTone = countdown?.urgent ?? false;

  return (
    <Chip
      size="small"
      label={label}
      icon={
        <Box
          component="span"
          sx={(t) => {
            const tone = urgentTone ? t.palette.error : statusTone(t, status);
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
        const tone = urgentTone ? t.palette.error : statusTone(t, status);
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
 *
 * `awaitingConfirmation` — деньги пришли (`paid`), а бронь ещё висит
 * `pending`: администратор её не подтвердил. Без этого «Оплачена» читалась
 * одинаково и для уже подтверждённой, и для висящей брони — а это ровно тот
 * случай, который положено видеть в первую очередь.
 */
export const PrepaymentChip: React.FC<{
  status: BookingPrepaymentStatus;
  amount?: string | null;
  needsAttention?: boolean;
  awaitingConfirmation?: boolean;
}> = ({ status, amount, needsAttention, awaitingConfirmation }) => {
  const m = BOOKING_PREPAYMENT_META[status];
  if (!m) return <>{status}</>;
  const baseLabel =
    status === "paid" && awaitingConfirmation ? "Оплачено, не подтверждено" : m.label;
  const label = amount ? `${baseLabel} · ${formatKGS(amount)}` : baseLabel;
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

/** «Ожидает», время которой уже прошло — висит необработанной. */
export function isBookingOverdue(b: {
  date: string;
  time: string;
  status: BookingStatus;
}): boolean {
  if (b.status !== "pending") return false;
  const start = bookingStart(b.date, b.time);
  return start.isValid() && start.isBefore(dayjs());
}

/**
 * Приоритет разбора для сортировки списка: деньги пришли, а приёма не будет —
 * самое горящее (`prepaymentNeedsAttention`); дальше — оплаченные (ждут
 * подтверждения администратором) и просроченные «Ожидает»; остальное — как
 * раньше, по времени начала.
 */
function bookingPriority(b: {
  date: string;
  time: string;
  status: BookingStatus;
  prepaymentStatus?: BookingPrepaymentStatus | null;
  prepaymentNeedsAttention?: boolean;
}): number {
  if (b.prepaymentNeedsAttention) return 0;
  if (b.prepaymentStatus === "paid") return 1;
  if (isBookingOverdue(b)) return 2;
  return 3;
}

/**
 * Сортирует «то, что горит» наверх. Работает только в пределах уже
 * загруженной страницы — сервер пагинирует по своему порядку, приоритетной
 * сортировки на бэке нет.
 */
export function sortBookingsByPriority<
  T extends {
    date: string;
    time: string;
    status: BookingStatus;
    prepaymentStatus?: BookingPrepaymentStatus | null;
    prepaymentNeedsAttention?: boolean;
  },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = bookingPriority(a);
    const pb = bookingPriority(b);
    if (pa !== pb) return pa - pb;
    return bookingStart(a.date, a.time).valueOf() - bookingStart(b.date, b.time).valueOf();
  });
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
