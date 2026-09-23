import { pluralRu } from "../../utility/amountInWords";
import { formatKGS } from "../../utility/format";

/**
 * Правила блока «Требует внимания» — отдельно от разметки: они и есть суть
 * блока (что считать проблемой и насколько она срочная), и покрыты тестами.
 *
 * Срочность:
 * - `critical` — деньги или люди теряются прямо сейчас (заявке никто не
 *   ответил, а дата прошла; задачи просрочены; расходы больше прихода);
 * - `warning`  — надо разобрать сегодня, иначе станет critical;
 * - `info`     — возможность, а не проблема (свободные окна, касания на сегодня).
 */
export type AttentionSeverity = "critical" | "warning" | "info";

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
  month?: { waitingCount: number; debtSum: number };
  staff?: { total: number; free: number };
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Доля возвратов в приходе, после которой это уже сигнал, а не фон. */
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
        severity: "critical",
        value: String(b.overdue),
        text: `${pluralRu(b.overdue, ["заявка", "заявки", "заявок"])} без ответа — дата визита уже прошла`,
        href: "/bookings",
      });
    }
    const fresh = Math.max(0, b.pending - b.overdue);
    if (fresh > 0) {
      add({
        id: "bookings-pending",
        severity: "warning",
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
      severity: "critical",
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
        severity: "critical",
        value: String(t.overdue),
        text: `${pluralRu(t.overdue, ["задача просрочена", "задачи просрочены", "задач просрочено"])}`,
        href: "/tasks",
      });
    }
    if (t.awaitingApproval > 0) {
      add({
        id: "tasks-approval",
        severity: "warning",
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
      severity: "warning",
      value: String(r.negative),
      text: `${pluralRu(r.negative, ["негативный отзыв", "негативных отзыва", "негативных отзывов"])} ${input.periodLabel} — стоит связаться`,
      href: "/reviews",
    });
  }

  if (c && c.refundedTotal > 0) {
    const share = c.grossIncome > 0 ? c.refundedTotal / c.grossIncome : 1;
    add({
      id: "cash-refunds",
      severity: share >= REFUND_WARNING_SHARE ? "warning" : "info",
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
        severity: "warning",
        value: formatKGS(m.debtSum),
        text: "долгов с начала месяца — по месячному отчёту",
        href: "/reports",
      });
    }
    if (m.waitingCount > 0) {
      add({
        id: "month-waiting",
        severity: "warning",
        value: String(m.waitingCount),
        text: pluralRu(m.waitingCount, [
          "запись с начала месяца так и не оплачена",
          "записи с начала месяца так и не оплачены",
          "записей с начала месяца так и не оплачены",
        ]),
        href: "/reports",
      });
    }
  }

  const d = input.deals;
  if (d) {
    if (d.overdueActions > 0) {
      add({
        id: "deals-overdue",
        severity: "warning",
        value: String(d.overdueActions),
        text: `${pluralRu(d.overdueActions, ["просроченное касание", "просроченных касания", "просроченных касаний"])} в воронке продаж`,
        href: "/deals?action=overdue",
      });
    }
    if (d.todayActions > 0) {
      add({
        id: "deals-today",
        severity: "info",
        value: String(d.todayActions),
        text: `${pluralRu(d.todayActions, ["касание", "касания", "касаний"])} в воронке запланировано на сегодня`,
        href: "/deals?action=today",
      });
    }
  }

  const s = input.staff;
  if (s && s.total > 0 && s.free > 0 && (s.total - s.free) / s.total < LOW_LOAD_SHARE) {
    add({
      id: "staff-free",
      severity: "info",
      value: `${s.free} из ${s.total}`,
      text: "специалистов со свободными окнами сегодня — их можно продать",
      href: "/schedule",
    });
  }

  // sort стабилен: внутри одной срочности порядок — как в правилах выше.
  return items.sort((a, b2) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b2.severity]);
}
