import { pluralRu } from "../../utility/amountInWords";
import { formatKGS } from "../../utility/format";

/**
 * Правила блока «Требует внимания» — отдельно от разметки: они и есть суть
 * блока (что считать проблемой и насколько она срочная), и покрыты тестами.
 *
 * Группы (так они и показаны на экране — заголовками, а не иконкой на строке):
 * - `urgent`      «Срочно» — деньги или люди теряются прямо сейчас (заявке
 *   никто не ответил, а дата прошла; задачи просрочены; расходы больше прихода);
 * - `today`       «Сегодня» — надо разобрать сегодня, иначе станет срочным;
 * - `opportunity` «Возможности» — не проблема, а шанс заработать (свободные
 *   окна, касания по сделкам на сегодня).
 */
export type AttentionSeverity = "urgent" | "today" | "opportunity";

export const ATTENTION_GROUPS: { severity: AttentionSeverity; label: string }[] = [
  { severity: "urgent", label: "Срочно" },
  { severity: "today", label: "Сегодня" },
  { severity: "opportunity", label: "Возможности" },
];

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  /** Короткое значение слева: число или сумма. */
  value: string;
  text: string;
  href: string;
}

/**
 * Снимок данных из разных разделов. `undefined` — раздел недоступен по правам
 * или ещё не загрузился: такое правило просто молчит, а не показывает ноль.
 */
export interface AttentionInput {
  periodLabel: string;
  bookings?: { pending: number; overdue: number };
  tasks?: { overdue: number; awaitingApproval: number };
  deals?: { overdueActions: number; todayActions: number };
  reviews?: { negative: number };
  cash?: {
    netCashFlow: number;
    grossIncome: number;
    refundedTotal: number;
    refundCount: number;
  };
  /**
   * ⚠ Числа «ждут оплаты» (`summary.waitingCount`) здесь нет намеренно: на
   * проде статус приёма почти не переходит в «оплачен» при оплате, и отчёт
   * считал «неоплаченными» почти все записи месяца (1585 из 1765 при 1491
   * оплате, 23.09.2026). Надёжный источник — тикет бэку по сводке.
   */
  month?: { debtSum: number };
  staff?: { total: number; free: number };
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { urgent: 0, today: 1, opportunity: 2 };

/** Доля возвратов в приходе, ниже которой это фон, а не сигнал. */
export const REFUND_WARNING_SHARE = 0.05;

/** Загрузка ниже этой доли — много непроданных окон на сегодня. */
export const LOW_LOAD_SHARE = 0.5;

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (item: AttentionItem) => items.push(item);

  const b = input.bookings;
  if (b) {
    if (b.overdue > 0) {
      add({
        id: "bookings-overdue",
        severity: "urgent",
        value: String(b.overdue),
        text: `${pluralRu(b.overdue, ["заявка", "заявки", "заявок"])} без ответа — дата визита уже прошла`,
        href: "/bookings",
      });
    }
    const fresh = Math.max(0, b.pending - b.overdue);
    if (fresh > 0) {
      add({
        id: "bookings-pending",
        severity: "today",
        value: String(fresh),
        text: `${pluralRu(fresh, ["заявка", "заявки", "заявок"])} с онлайн-записи ждут подтверждения`,
        href: "/bookings",
      });
    }
  }

  const c = input.cash;
  if (c && c.netCashFlow < 0) {
    add({
      id: "cash-negative",
      severity: "urgent",
      value: formatKGS(Math.abs(c.netCashFlow)),
      text: `расходы и закупки превысили приход ${input.periodLabel}`,
      href: "/cashbox",
    });
  }

  const t = input.tasks;
  if (t) {
    if (t.overdue > 0) {
      add({
        id: "tasks-overdue",
        severity: "urgent",
        value: String(t.overdue),
        text: `${pluralRu(t.overdue, ["задача просрочена", "задачи просрочены", "задач просрочено"])}`,
        href: "/tasks",
      });
    }
    if (t.awaitingApproval > 0) {
      add({
        id: "tasks-approval",
        severity: "today",
        value: String(t.awaitingApproval),
        text: `${pluralRu(t.awaitingApproval, ["задача ждёт", "задачи ждут", "задач ждут"])} приёмки`,
        href: "/tasks",
      });
    }
  }

  const r = input.reviews;
  if (r && r.negative > 0) {
    add({
      id: "reviews-negative",
      severity: "today",
      value: String(r.negative),
      text: `${pluralRu(r.negative, ["негативный отзыв", "негативных отзыва", "негативных отзывов"])} ${input.periodLabel} — стоит связаться`,
      href: "/reviews",
    });
  }

  // Мелкие возвраты — фон работы, а не повод реагировать: в список не идут.
  // «Возможностью» они тоже не являются, так что третьей группы для них нет.
  const share = c && c.grossIncome > 0 ? c.refundedTotal / c.grossIncome : 1;
  if (c && c.refundedTotal > 0 && share >= REFUND_WARNING_SHARE) {
    add({
      id: "cash-refunds",
      severity: "today",
      value: formatKGS(c.refundedTotal),
      text: `${c.refundCount} ${pluralRu(c.refundCount, ["возврат", "возврата", "возвратов"])} ${input.periodLabel}${
        c.grossIncome > 0 ? ` — ${Math.round(share * 100)}% прихода` : ""
      }`,
      href: "/cashbox",
    });
  }

  const m = input.month;
  if (m) {
    if (m.debtSum > 0) {
      add({
        id: "month-debt",
        severity: "today",
        value: formatKGS(m.debtSum),
        text: "долгов с начала месяца — по месячному отчёту",
        href: "/reports",
      });
    }
  }

  const d = input.deals;
  if (d) {
    if (d.overdueActions > 0) {
      add({
        id: "deals-overdue",
        severity: "today",
        value: String(d.overdueActions),
        text: `${pluralRu(d.overdueActions, ["просроченное касание", "просроченных касания", "просроченных касаний"])} в воронке продаж`,
        href: "/deals?action=overdue",
      });
    }
    if (d.todayActions > 0) {
      add({
        id: "deals-today",
        severity: "opportunity",
        value: String(d.todayActions),
        text: `${pluralRu(d.todayActions, ["касание", "касания", "касаний"])} по сделкам на сегодня`,
        href: "/deals?action=today",
      });
    }
  }

  const s = input.staff;
  if (s && s.total > 0 && s.free > 0 && (s.total - s.free) / s.total < LOW_LOAD_SHARE) {
    add({
      id: "staff-free",
      severity: "opportunity",
      value: String(s.free),
      text: `${pluralRu(s.free, [
        "специалист свободен",
        "специалиста свободны",
        "специалистов свободны",
      ])} сегодня — окна можно продать`,
      href: "/schedule",
    });
  }

  // sort стабилен: внутри одной срочности порядок — как в правилах выше.
  return items.sort((a, b2) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b2.severity]);
}
