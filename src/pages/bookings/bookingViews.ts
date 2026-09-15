/**
 * Чистая логика экрана «Онлайн-запись»: какие брони в какой вкладке, воронка
 * и время реакции. Вынесено из компонентов ради тестов (render-библиотек в
 * проекте нет, только vitest) — см. bookingViews.test.ts.
 */
import dayjs, { type Dayjs } from "dayjs";

import type { BookingDetail, BookingListItem, BookingStatus } from "../../api/bookings";
import { isBookingClosed } from "./meta";

/**
 * Вкладки экрана. Не статусы брони, а рабочие вопросы:
 *   • triage   — «что разобрать»: всё, где нужно действие человека;
 *   • upcoming — «кто придёт»: подтверждённые на сегодня и дальше;
 *   • journal  — все брони периода с фильтром статуса (история);
 *   • analytics — воронка и время реакции.
 */
export type BookingTab = "triage" | "upcoming" | "journal" | "analytics";

export const BOOKING_TABS: readonly BookingTab[] = ["triage", "upcoming", "journal", "analytics"];

export const isBookingTab = (v: string | null): v is BookingTab =>
  v != null && (BOOKING_TABS as readonly string[]).includes(v);

/**
 * Окно дат (по дате визита) для вкладки «Разобрать» — то же, что у бейджа в
 * сайдбаре (30 дней назад … 90 вперёд), иначе число на вкладке и в сайдбаре
 * разойдутся. Назад смотрим намеренно: `pending` на вчера — висяк.
 */
export const TRIAGE_PAST_DAYS = 30;
export const TRIAGE_FUTURE_DAYS = 90;
/** «Предстоящие» смотрят дальше: подтверждённая запись через полгода — законна. */
export const UPCOMING_FUTURE_DAYS = 180;

type TriageSource = Pick<
  BookingListItem,
  "status" | "prepaymentStatus" | "prepaymentExpiresAt" | "prepaymentNeedsAttention"
>;

/**
 * Нужна ли броне рука человека:
 *   • `pending` — ждёт звонка и подтверждения (в т.ч. оплаченная предоплатой);
 *   • деньги пришли, а приёма не будет (`prepaymentNeedsAttention`) — отмена или
 *     неявка с неразобранной предоплатой.
 *
 * `awaiting_payment` сюда не входит: судьбу такой брони решает банк, а
 * подтвердить её нельзя (400). Подтверждённая бронь с приёмом — тоже нет:
 * дальше работа в регистратуре, а не в очереди онлайн-записи.
 */
export function needsTriage(b: TriageSource, now: Dayjs = dayjs()): boolean {
  if (b.prepaymentNeedsAttention) return true;
  return b.status === "pending" && !isBookingClosed(b, now);
}

/**
 * Можно ли подтвердить заявку без человека: ровно одна карта по телефону и хотя
 * бы одна услуга с id каталога. Без услуг бэк подтверждение отклоняет (приём
 * без услуг не собрать) — у броней без услуги и у броней operator.kg (там у
 * услуг нет id) состав выбирают в `ConfirmBookingDialog`.
 *
 * `doctorServiceIds` — услуги, закреплённые за врачом брони в её филиале
 * (матрица `service-assignments`). Если хоть одна услуга заявки врачом там не
 * оказывается, в один клик не подтверждаем: приём с ней не сохранится, а в
 * диалоге регистратор увидит, какую услугу заменить. `null` — матрицы нет
 * (не загрузилась, врач без маппинга), проверку пропускаем.
 */
export function autoConfirmExtras(
  detail: Pick<BookingDetail, "patientMatches" | "services">,
  doctorServiceIds: ReadonlySet<number> | null = null,
): { patientId: number; serviceIds: number[] } | null {
  const matches = detail.patientMatches ?? [];
  const serviceIds = (detail.services ?? [])
    .map((s) => s.id)
    .filter((sid): sid is number => sid != null);
  if (matches.length !== 1 || serviceIds.length === 0) return null;
  if (doctorServiceIds && serviceIds.some((id) => !doctorServiceIds.has(id))) return null;
  return { patientId: matches[0].id, serviceIds };
}

/** Услуги врача из матрицы `service-assignments`; null — проверить не по чему. */
export function doctorServiceIdsOf(
  assignments: { serviceId: number; employeeId: number }[] | null,
  doctorId: number | null,
): Set<number> | null {
  if (!assignments || doctorId == null) return null;
  return new Set(assignments.filter((a) => a.employeeId === doctorId).map((a) => a.serviceId));
}

// ── Воронка ───────────────────────────────────────────────────────────────────

type FunnelSource = Pick<
  BookingListItem,
  | "status"
  | "appointmentId"
  | "date"
  | "time"
  | "prepaymentStatus"
  | "prepaymentExpiresAt"
>;

export interface BookingFunnel {
  /** Заявок, дошедших до регистратуры (без брошенных на оплате). */
  requests: number;
  /** Подтверждено: создан приём (дальше он мог состояться, сорваться или ждать). */
  confirmed: number;
  /** Визит состоялся (бронь `completed`). */
  completed: number;
  /** Ещё не разобраны: `pending`. */
  waiting: number;
  /** Подтверждены, визит впереди. */
  upcoming: number;
  /** Подтверждены, время визита прошло, а бронь не закрыта. */
  unresolved: number;
  /** Отменены до подтверждения (приёма не было). */
  cancelledBefore: number;
  /** Отменены после подтверждения (приём был создан и отменён). */
  cancelledAfter: number;
  noShow: number;
  /** Не оплатили онлайн-предоплату — до регистратуры не дошли. */
  abandonedPayment: number;
  /** Идёт оплата прямо сейчас. */
  inPayment: number;
}

const bookingStartMs = (b: { date: string; time: string }): number =>
  dayjs(`${b.date}T${(b.time || "00:00").slice(0, 5)}`).valueOf();

/**
 * Воронка по броням периода. «Подтверждено» считаем по факту, а не по текущему
 * статусу: неявка и отмена с приёмом тоже прошли через подтверждение.
 */
export function bookingFunnel(rows: FunnelSource[], now: Dayjs = dayjs()): BookingFunnel {
  const f: BookingFunnel = {
    requests: 0,
    confirmed: 0,
    completed: 0,
    waiting: 0,
    upcoming: 0,
    unresolved: 0,
    cancelledBefore: 0,
    cancelledAfter: 0,
    noShow: 0,
    abandonedPayment: 0,
    inPayment: 0,
  };
  const nowMs = now.valueOf();
  for (const b of rows) {
    if (b.status === "awaiting_payment") {
      if (isBookingClosed(b, now)) f.abandonedPayment += 1;
      else f.inPayment += 1;
      continue;
    }
    f.requests += 1;
    switch (b.status) {
      case "pending":
        f.waiting += 1;
        break;
      case "confirmed":
        f.confirmed += 1;
        if (bookingStartMs(b) > nowMs) f.upcoming += 1;
        else f.unresolved += 1;
        break;
      case "completed":
        f.confirmed += 1;
        f.completed += 1;
        break;
      case "no_show":
        f.confirmed += 1;
        f.noShow += 1;
        break;
      case "cancelled":
        if (b.appointmentId != null) {
          f.confirmed += 1;
          f.cancelledAfter += 1;
        } else {
          f.cancelledBefore += 1;
        }
        break;
    }
  }
  return f;
}

export interface FunnelGroupRow {
  key: string;
  label: string;
  funnel: BookingFunnel;
}

/** Воронка в разрезе (врач, источник): крупные группы — сверху. */
export function funnelBy<T extends FunnelSource>(
  rows: T[],
  keyOf: (b: T) => { key: string; label: string },
  now: Dayjs = dayjs(),
): FunnelGroupRow[] {
  const groups = new Map<string, { label: string; rows: T[] }>();
  for (const b of rows) {
    const { key, label } = keyOf(b);
    const g = groups.get(key);
    if (g) g.rows.push(b);
    else groups.set(key, { label, rows: [b] });
  }
  return Array.from(groups, ([key, g]) => ({
    key,
    label: g.label,
    funnel: bookingFunnel(g.rows, now),
  })).sort((a, b) => b.funnel.requests - a.funnel.requests || a.label.localeCompare(b.label));
}

/** Доля в процентах, округлённая; null — делить не на что. */
export const percentOf = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

// ── Время реакции ─────────────────────────────────────────────────────────────

type ReactionSource = Pick<BookingListItem, "status" | "createdAt" | "claimedAt" | "claimedBy">;

export interface ReactionStats {
  /** Сколько заявок взяли в работу (есть и createdAt, и claimedAt). */
  measured: number;
  /** Медиана минут от поступления до «взял в работу». */
  medianMin: number | null;
  /** 90-й перцентиль — «как долго ждут самые невезучие». */
  p90Min: number | null;
  /** Доля взятых в течение 15 минут, %. */
  within15Pct: number | null;
  /** Заявок без отметки (и не брошенных на оплате). */
  unclaimed: number;
  /** Разрез по сотрудникам: кто сколько взял и как быстро. */
  byEmployee: { id: number; name: string; count: number; medianMin: number }[];
  /** Поля `createdAt` нет вовсе — бэк без §8, считать не из чего. */
  unsupported: boolean;
}

const median = (sorted: number[]): number | null => {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

/**
 * Время реакции = `claimedAt − createdAt`. Отметку ставят кнопкой «Взять в
 * работу», а если её не нажали — само подтверждение/отмена из карточки (фронт
 * берёт заявку перед сменой статуса). Отрицательные интервалы (часы сервера,
 * ручные правки) обрезаем до нуля.
 */
export function reactionStats(rows: ReactionSource[]): ReactionStats {
  const all: number[] = [];
  const perEmployee = new Map<number, { name: string; mins: number[] }>();
  let unclaimed = 0;
  let sawCreatedAt = false;

  for (const b of rows) {
    if (b.status === "awaiting_payment") continue;
    if (b.createdAt) sawCreatedAt = true;
    if (!b.claimedAt) {
      unclaimed += 1;
      continue;
    }
    if (!b.createdAt) continue;
    const created = Date.parse(b.createdAt);
    const claimed = Date.parse(b.claimedAt);
    if (!Number.isFinite(created) || !Number.isFinite(claimed)) continue;
    const mins = Math.max(0, (claimed - created) / 60000);
    all.push(mins);
    if (b.claimedBy) {
      const e = perEmployee.get(b.claimedBy.id);
      if (e) e.mins.push(mins);
      else perEmployee.set(b.claimedBy.id, { name: b.claimedBy.fullName, mins: [mins] });
    }
  }

  all.sort((a, b) => a - b);
  return {
    measured: all.length,
    medianMin: median(all),
    p90Min: percentile(all, 90),
    within15Pct: percentOf(all.filter((m) => m <= 15).length, all.length),
    unclaimed,
    byEmployee: Array.from(perEmployee, ([id, e]) => {
      const s = [...e.mins].sort((a, b) => a - b);
      return { id, name: e.name, count: s.length, medianMin: median(s) ?? 0 };
    }).sort((a, b) => b.count - a.count || a.medianMin - b.medianMin),
    unsupported: rows.length > 0 && !sawCreatedAt,
  };
}

/** «7 мин», «2 ч 15 мин», «3 дн.» — длительность для людей. */
export function formatDurationMin(mins: number | null): string {
  if (mins == null) return "—";
  const m = Math.round(mins);
  if (m < 60) return `${m} мин`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} ч ${rest} мин` : `${h} ч`;
  }
  return `${Math.round(m / (24 * 60))} дн.`;
}

// ── Напоминание в WhatsApp ────────────────────────────────────────────────────

/** Только цифры номера — формат, который понимает wa.me. */
export const waDigits = (phone: string): string => phone.replace(/\D/g, "");

/** Ссылка wa.me с заготовленным текстом (пустой текст — просто чат). */
export function whatsappUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${waDigits(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * «сегодня» / «завтра» / «в среду, 17 сентября» — как день визита звучит в
 * сообщении пациенту. Считаем по календарным дням, не по 24 часам.
 */
export function visitDayPhrase(date: string, now: Dayjs = dayjs()): string {
  const d = dayjs(date);
  const diff = d.startOf("day").diff(now.startOf("day"), "day");
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  const weekday = d.locale("ru").format("dddd");
  // «во вторник», но «в среду» — единственный предлог-исключение в неделе.
  const prep = weekday === "вторник" ? "во" : "в";
  const acc = weekday.replace(/а$/, "у"); // среда → среду, пятница → пятницу, суббота → субботу
  return `${prep} ${acc}, ${d.locale("ru").format("D MMMM")}`;
}

/** Статусы, по которым вообще есть смысл напоминать. */
export const canRemind = (status: BookingStatus): boolean =>
  status === "confirmed" || status === "pending";
