import dayjs from "dayjs";

import type { CashboxSummary } from "../../api/cashbox";
import type {
  DashboardAppointments,
  DashboardBookings,
  DashboardBranchRow,
  DashboardDeals,
  DashboardLoad,
  DashboardMoney,
  DashboardMoneyScalars,
  DashboardMonth,
  DashboardReviews,
  DashboardReviewsScalars,
  DashboardStaff,
  DashboardTasks,
} from "../../api/dashboard";
import type { DealsSummary } from "../../api/deals";
import type { PayrollReport } from "../../api/payroll";
import type { MonthlyReport } from "../../api/reports";
import type { ReviewStats } from "../../api/reviews";
import type { AvailabilitySummary } from "../../api/scheduling";
import type { TasksSummary } from "../../api/tasks";
import { num } from "./widgetUtils";
import { sumDayCounts, toDailySeries, weekdayBaseline, type PeriodRange } from "./period";

/**
 * Сводка на прежних ручках, приведённая к формату агрегата
 * `/dashboard/summary/` v2.
 *
 * ⚠ Временный слой: на проде 24.09.2026 стоит первая версия агрегата, и пока
 * там не выложат v2, экран собирается из ≈20 запросов, как до агрегата. Блоки
 * пишутся один раз — под формат v2, а метрики, которых прежние ручки не знают
 * (неоплаченные визиты, остаток долга, неявки, повторные, конверсия броней,
 * выручка по услугам и сотрудникам), здесь просто не заполняются, и блоки их
 * не показывают. Нулём их не подставляем: ложный ноль хуже пропуска.
 *
 * Когда v2 появится на проде — файл удаляется вместе с queries.ts.
 */

const moneyScalars = (s: CashboxSummary): DashboardMoneyScalars => ({
  grossIncome: s.grossIncome,
  netIncome: s.netIncome,
  cashIncome: s.cashIncome,
  cardIncome: s.cardIncome,
  cashRefunds: s.cashRefunds,
  cardRefunds: s.cardRefunds,
  refundedTotal: s.refundedTotal,
  balancePayments: s.balancePayments,
  balanceRefunds: s.balanceRefunds,
  insuranceIncome: s.insuranceIncome,
  insuranceRefunds: s.insuranceRefunds,
  paymentCount: s.paymentCount,
  refundCount: s.refundCount,
  salesTotal: s.salesTotal,
  saleCount: s.saleCount,
  totalExpenses: s.totalExpenses,
  expenseCount: s.expenseCount,
  supplyTotal: s.supplyTotal,
  supplyCount: s.supplyCount,
  netCashFlow: s.netCashFlow,
});

export function legacyMoney(current: CashboxSummary, previous?: CashboxSummary): DashboardMoney {
  return { ...moneyScalars(current), baseline: previous ? moneyScalars(previous) : null };
}

/**
 * Темп месяца: выручка с 1-го и прошлый месяц — из кассы, приход по дням — из
 * месячного отчёта (наличные + безнал по дате приёма).
 *
 * ⚠ Кривая из отчёта с цифрой «с 1-го числа» не сходится: отчёт раскладывает
 * оплаты по дате приёма и добавляет продажи POS (ответ бэка 24.09.2026). В
 * агрегате v2 это исправлено — там ряд считается как касса.
 */
export function legacyMonth(
  monthRange: PeriodRange,
  monthCash: CashboxSummary,
  lastMonthCash?: CashboxSummary,
  lastMonthRange?: PeriodRange,
  report?: MonthlyReport,
): DashboardMonth {
  const to = dayjs(monthRange.dateTo);
  // ⚠ Отчёт отдавал daily[] от 31-го к 1-му — порядок ответа не используем,
  // идём по календарю сами.
  const byDate = new Map(
    (report?.daily ?? []).map((d) => [d.date, num(d.cashSum) + num(d.cardSum)]),
  );
  const daily = report
    ? toDailySeries(undefined, monthRange).map(({ date }) => ({
        date,
        netIncome: (byDate.get(date) ?? 0).toFixed(2),
        paymentCount: 0,
      }))
    : [];
  return {
    month: monthRange.month,
    dateFrom: monthRange.dateFrom,
    dateTo: monthRange.dateTo,
    daysInMonth: to.daysInMonth(),
    daysElapsed: to.date(),
    netIncome: monthCash.netIncome,
    previousMonth:
      lastMonthCash && lastMonthRange
        ? {
            month: lastMonthRange.month,
            dateFrom: lastMonthRange.dateFrom,
            dateTo: lastMonthRange.dateTo,
            netIncome: lastMonthCash.netIncome,
          }
        : null,
    daily,
    baseline: null,
  };
}

/**
 * Записи: только общее число и ряды по дням — day-counts не различает статусы.
 * «Обычно в этот день недели» считаем сами из истории на 4 недели.
 */
export function legacyAppointments(
  counts: Record<string, number>,
  prevCounts: Record<string, number> | undefined,
  chartRange: PeriodRange,
  chartCounts: Record<string, number> | undefined,
  history: Record<string, number> | undefined,
): DashboardAppointments {
  const daily = chartCounts ? toDailySeries(chartCounts, chartRange) : undefined;
  return {
    total: sumDayCounts(counts),
    daily,
    weekdayBaseline:
      daily && history
        ? daily.map((d) => ({
            date: d.date,
            average: (weekdayBaseline(history, d.date) ?? 0).toFixed(2),
          }))
        : undefined,
    baseline: prevCounts ? { total: sumDayCounts(prevCounts) } : null,
  };
}

export const legacyBookings = (pending: number, overdue: number): DashboardBookings => ({
  pendingCount: pending,
  overdueCount: overdue,
  baseline: null,
});

export const legacyTasks = (t: TasksSummary): DashboardTasks => ({ ...t, baseline: null });

export const legacyDeals = (d: DealsSummary): DashboardDeals => ({
  branchId: null,
  totalCount: d.totalCount,
  totalAmount: d.totalAmount,
  openCount: d.openCount,
  openAmount: d.openAmount,
  wonCount: d.wonCount,
  wonAmount: d.wonAmount,
  lostCount: d.lostCount,
  todayActionsCount: d.todayActionsCount,
  overdueActionsCount: d.overdueActionsCount,
  baseline: null,
});

const reviewScalars = (r: ReviewStats): DashboardReviewsScalars => ({
  sent: r.sent,
  answered: r.answered,
  averageRating: r.avgRating,
  negative: r.negativeCount,
});

export const legacyReviews = (r: ReviewStats, prev?: ReviewStats): DashboardReviews => ({
  ...reviewScalars(r),
  baseline: prev ? reviewScalars(prev) : null,
});

export const legacyStaff = (p: PayrollReport): DashboardStaff => ({
  payroll: {
    year: p.year,
    month: p.month,
    status: p.status,
    rows: (p.rows ?? []).map((r) => ({
      employeeId: r.employeeId,
      fullName: r.fullName,
      appointmentsCount: r.appointmentsCount,
      paidCount: r.paidCount,
      earnings: r.earnings,
    })),
  },
  baseline: null,
});

export const legacyLoad = (a: AvailabilitySummary): DashboardLoad => ({
  date: a.date,
  overallEmployeeCount: a.overallEmployeeCount,
  overallFreeEmployeeCount: a.overallFreeEmployeeCount,
  // Названий специальностей прежняя ручка не отдаёт; блоки их и не показывают.
  specializations: a.specializations.map((s) => ({
    specializationId: s.specializationId,
    specializationName: "",
    employeeCount: s.employeeCount,
    freeEmployeeCount: s.freeEmployeeCount,
  })),
  baseline: null,
});

export const legacyBranch = (
  branch: { id: number; name: string },
  organizationId: number,
  s: CashboxSummary,
): DashboardBranchRow => ({
  branchId: branch.id,
  organizationId,
  branchName: branch.name,
  money: {
    grossIncome: s.grossIncome,
    netIncome: s.netIncome,
    cashIncome: s.cashIncome,
    cardIncome: s.cardIncome,
    refundedTotal: s.refundedTotal,
    paymentCount: s.paymentCount,
    // Базы по филиалам на прежних ручках нет: это ещё восемь запросов.
    baseline: null,
  },
});
