import dayjs from "dayjs";

import { ApiError } from "../../api/client";
import type { ToneName } from "../../components/ui/TonedChip";
import { tt } from "../../i18n/t";
import type {
  WaitlistContactResult,
  WaitlistEntry,
  WaitlistPriority,
  WaitlistSource,
  WaitlistStatus,
} from "../../api/waitlist";

/** Фоновое обновление списка: очередь разбирают несколько регистраторов сразу. */
export const WAITLIST_REFRESH_MS = 60_000;

/**
 * Канал витрины `/book` («Сообщить, когда освободится»).
 *
 * ⚠ Выключен: `POST /api/v1/waitlist/` бэком не реализован (тикет
 * `backend_ticket_waitlist_module.md` §5). Пока флаг false, гость видит
 * привычный текст «окон нет» без формы — иначе заявка уходила бы в никуда.
 */
export const WAITLIST_PUBLIC_CHANNEL_ENABLED = false;

/** Палитра-тон статусных плашек — общий тип с `TonedChip`. */
export type { ToneName } from "../../components/ui/TonedChip";

/**
 * Метки статусов — ленивые геттеры: карта-константа с текстом, вычисленная на
 * импорте, застынет до инициализации i18n и переживёт смену вертикали.
 */
export const WAITLIST_STATUS_META: Record<
  WaitlistStatus,
  { readonly label: string; color: ToneName }
> = {
  waiting: {
    get label() {
      return tt("waitlist:status.waiting");
    },
    color: "info",
  },
  offered: {
    get label() {
      return tt("waitlist:status.offered");
    },
    color: "warning",
  },
  scheduled: {
    get label() {
      return tt("waitlist:status.scheduled");
    },
    color: "success",
  },
  cancelled: {
    get label() {
      return tt("waitlist:status.cancelled");
    },
    color: null,
  },
  expired: {
    get label() {
      return tt("waitlist:status.expired");
    },
    color: "error",
  },
};

export const WAITLIST_PRIORITY_META: Record<
  WaitlistPriority,
  { readonly label: string; color: ToneName }
> = {
  normal: {
    get label() {
      return tt("waitlist:priority.normal");
    },
    color: null,
  },
  urgent: {
    get label() {
      return tt("waitlist:priority.urgent");
    },
    color: "error",
  },
};

export const WAITLIST_SOURCE_META: Record<WaitlistSource, { readonly label: string }> = {
  staff: {
    get label() {
      return tt("waitlist:source.staff");
    },
  },
  public: {
    get label() {
      return tt("waitlist:source.public");
    },
  },
};

export const WAITLIST_CONTACT_RESULT_META: Record<
  WaitlistContactResult,
  { readonly label: string; color: ToneName }
> = {
  no_answer: {
    get label() {
      return tt("waitlist:contactResult.no_answer");
    },
    color: "warning",
  },
  refused: {
    get label() {
      return tt("waitlist:contactResult.refused");
    },
    color: "error",
  },
  agreed: {
    get label() {
      return tt("waitlist:contactResult.agreed");
    },
    color: "success",
  },
  callback_later: {
    get label() {
      return tt("waitlist:contactResult.callback_later");
    },
    color: "info",
  },
};

export const WAITLIST_STATUS_OPTIONS = (Object.keys(WAITLIST_STATUS_META) as WaitlistStatus[]).map(
  (value) => ({ value, get label() {
    return WAITLIST_STATUS_META[value].label;
  } }),
);

/** Дни недели ISO 1–7 для формы «когда удобно». */
export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

/** Сколько дней человек уже в очереди. */
export function waitingDays(entry: WaitlistEntry): number {
  return Math.max(0, dayjs().startOf("day").diff(dayjs(entry.createdAt).startOf("day"), "day"));
}

/** Имя, которое показываем: карта пациента приоритетнее «как назвался». */
export function displayName(entry: WaitlistEntry): string {
  return entry.patientName || entry.contactName;
}

/** «Иванова М. П.» / «Любой педиатр» / «—». */
export function waitingForLabel(entry: WaitlistEntry): string {
  if (entry.employeeName) return entry.employeeName;
  if (entry.specializationName) {
    return `${tt("waitlist:anySpecialist")} · ${entry.specializationName}`;
  }
  return tt("waitlist:anySpecialist");
}

/** «02.09 — 10.09» / «с 02.09» / «до 10.09» / «Когда угодно». */
export function periodLabel(entry: WaitlistEntry): string {
  const fmt = (iso: string) => dayjs(iso).format("DD.MM");
  const { desiredDateFrom: from, desiredDateTo: to } = entry;
  if (from && to) return `${fmt(from)} — ${fmt(to)}`;
  if (from) return tt("waitlist:periodFrom", { date: fmt(from) });
  if (to) return tt("waitlist:periodTo", { date: fmt(to) });
  return tt("waitlist:anyPeriod");
}

/** «с 15:00 до 19:00» / «после 15:00» / «» — окно внутри дня. */
export function timeRangeLabel(entry: WaitlistEntry): string {
  const { desiredTimeFrom: from, desiredTimeTo: to } = entry;
  if (from && to) return tt("waitlist:timeRange", { from, to });
  if (from) return tt("waitlist:timeFrom", { from });
  if (to) return tt("waitlist:timeTo", { to });
  return "";
}

/**
 * Человеческий текст ошибки действия. 400 бэк объясняет сам — показываем его
 * текст; технические коды переводим, чтобы регистратор понял, что делать.
 */
export function waitlistErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "Недостаточно прав для этого действия";
    if (e.status === 404) return "Запись не найдена — возможно, её уже сняли";
    if (e.status === 405) return "Сервер пока не поддерживает это действие";
    if (e.status === 400 && e.message) return e.message;
  }
  return (e instanceof Error && e.message) || fallback;
}
