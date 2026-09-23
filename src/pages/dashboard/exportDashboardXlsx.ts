import dayjs from "dayjs";
import type { QueryClient } from "@tanstack/react-query";

import { getPayrollReport } from "../../api/payroll";
import { getBranches } from "../../api/organization";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { buildAttentionItems, ATTENTION_GROUPS } from "./attention";
import { previousRange, resolvePeriod, sumDayCounts, type PeriodKey, type PeriodRange } from "./period";
import { planProgress } from "./revenuePlan";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dayCountsQuery,
  dealsSummaryQuery,
  monthlyReportQuery,
  pendingBookingsQuery,
  reviewStatsQuery,
  tasksSummaryQuery,
} from "./queries";

/**
 * Выгрузка сводки в .xlsx.
 *
 * exceljs грузится динамическим import — библиотека около 700 КБ и нужна только
 * в момент выгрузки; в основной бандл её тянуть незачем (тот же приём, что в
 * платёжной ведомости `features/payroll/statement`).
 *
 * Данные берутся через `queryClient.fetchQuery` с теми же описаниями запросов,
 * что у экрана (`queries.ts`): свежий кэш отдаётся сразу, поэтому в файле ровно
 * те цифры, что на экране, а выгрузка не повторяет два десятка запросов. Состав
 * файла не зависит от того, какие блоки пользователь спрятал — только от прав.
 */

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

export interface DashboardExportInput {
  queryClient: QueryClient;
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
  organizationName: string;
  branchName?: string;
  /** План выручки на текущий месяц для этого скоупа (см. revenuePlan.ts). */
  plan?: number | null;
  /** Что пользователю разрешено видеть — лишние разделы в файл не попадают. */
  allow: {
    money: boolean;
    appointments: boolean;
    reports: boolean;
    tasks: boolean;
    reviews: boolean;
    branches: boolean;
    bookings: boolean;
    deals: boolean;
    schedule: boolean;
    payroll: boolean;
  };
}

type Row = [string, string | number | null, string?];

/** Прошлый календарный месяц целиком — база для темпа. */
function previousFullMonth(now: dayjs.Dayjs): PeriodRange {
  const m = now.subtract(1, "month");
  return {
    dateFrom: m.startOf("month").format("YYYY-MM-DD"),
    dateTo: m.endOf("month").format("YYYY-MM-DD"),
    month: m.format("YYYY-MM"),
    label: m.format("MMMM"),
  };
}

/** Собирает строки отчёта; вынесено из записи файла, чтобы читалось линейно. */
async function collectRows(input: DashboardExportInput): Promise<Row[]> {
  const { queryClient: qc, range, periodKey, scope, allow } = input;
  const prev = previousRange(range, periodKey);
  const monthRange = resolvePeriod("month", dayjs(range.dateTo));
  const lastMonth = previousFullMonth(dayjs(range.dateTo));
  const rows: Row[] = [];
  const blank = () => rows.push([" ", null]);

  // Всё независимое — параллельно: раздел без прав не запрашивается вовсе.
  const skip = Promise.resolve(undefined);
  const [
    cash,
    cashPrev,
    cashMonth,
    cashLastMonth,
    counts,
    countsPrev,
    report,
    tasks,
    reviews,
    bookingsPending,
    bookingsOverdue,
    deals,
    availability,
  ] = await Promise.all([
    allow.money ? qc.fetchQuery(cashboxSummaryQuery(scope, range)) : skip,
    allow.money ? qc.fetchQuery(cashboxSummaryQuery(scope, prev)) : skip,
    allow.money ? qc.fetchQuery(cashboxSummaryQuery(scope, monthRange)) : skip,
    allow.money ? qc.fetchQuery(cashboxSummaryQuery(scope, lastMonth)) : skip,
    allow.appointments ? qc.fetchQuery(dayCountsQuery(scope, range)) : skip,
    allow.appointments ? qc.fetchQuery(dayCountsQuery(scope, prev)) : skip,
    allow.reports ? qc.fetchQuery(monthlyReportQuery(scope, monthRange.month)) : skip,
    allow.tasks ? qc.fetchQuery(tasksSummaryQuery(scope)) : skip,
    allow.reviews ? qc.fetchQuery(reviewStatsQuery(scope, range)) : skip,
    allow.bookings ? qc.fetchQuery(pendingBookingsQuery(scope, "pending")) : skip,
    allow.bookings ? qc.fetchQuery(pendingBookingsQuery(scope, "overdue")) : skip,
    allow.deals ? qc.fetchQuery(dealsSummaryQuery(scope)) : skip,
    allow.schedule ? qc.fetchQuery(availabilityTodayQuery(scope)) : skip,
  ]);

  // ── Требует внимания — первым, как на экране ──
  const attention = buildAttentionItems({
    periodLabel: range.label,
    bookings:
      bookingsPending && bookingsOverdue
        ? { pending: bookingsPending.count ?? 0, overdue: bookingsOverdue.count ?? 0 }
        : undefined,
    tasks: tasks ? { overdue: tasks.overdue, awaitingApproval: tasks.awaitingApproval } : undefined,
    deals: deals
      ? { overdueActions: deals.overdueActionsCount, todayActions: deals.todayActionsCount }
      : undefined,
    reviews: reviews ? { negative: reviews.negativeCount } : undefined,
    cash: cash
      ? {
          netCashFlow: num(cash.netCashFlow),
          grossIncome: num(cash.grossIncome),
          refundedTotal: num(cash.refundedTotal),
          refundCount: cash.refundCount,
        }
      : undefined,
    month: report
      ? {
          debtSum: (report.daily ?? []).reduce((acc, d) => acc + num(d.debtSum), 0),
        }
      : undefined,
    staff: availability
      ? { total: availability.overallEmployeeCount, free: availability.overallFreeEmployeeCount }
      : undefined,
  });
  rows.push(["Требует внимания", null]);
  if (attention.length === 0) rows.push(["Всё под контролем", "—"]);
  for (const g of ATTENTION_GROUPS) {
    for (const item of attention.filter((i) => i.severity === g.severity)) {
      rows.push([`${g.label}: ${item.text}`, item.value]);
    }
  }
  blank();

  // ── Выручка и темп месяца ──
  if (cash && cashPrev && cashMonth) {
    const income = num(cash.netIncome);
    const monthIncome = num(cashMonth.netIncome);
    const day = dayjs(monthRange.dateTo);
    const elapsed = day.date();
    const inMonth = day.daysInMonth();
    const pace = elapsed >= 3 && monthIncome > 0 ? (monthIncome / elapsed) * inMonth : null;

    rows.push(["Выручка", null]);
    rows.push([`Выручка ${range.label}`, income, `${prev.label}: ${num(cashPrev.netIncome)}`]);
    rows.push(["С начала месяца", monthIncome, `день ${elapsed} из ${inMonth}`]);
    if (pace != null) rows.push(["По темпу к концу месяца", Math.round(pace), "линейная оценка"]);
    if (cashLastMonth) rows.push([`${lastMonth.label} целиком`, num(cashLastMonth.netIncome)]);
    if (input.plan) {
      const p = planProgress(input.plan, monthIncome, elapsed, inMonth, pace);
      rows.push(["План на месяц", input.plan, `выполнено ${Math.round(p.done * 100)}%`]);
      rows.push([
        "Нужно в день до конца месяца",
        p.perDayNeeded == null ? "—" : Math.round(p.perDayNeeded),
        p.remaining === 0 ? "план выполнен" : `осталось ${Math.round(p.remaining)}`,
      ]);
    }
    rows.push([
      "Средний чек",
      cash.paymentCount > 0 ? Math.round(income / cash.paymentCount) : 0,
      `оплат: ${cash.paymentCount}`,
    ]);
    blank();

    rows.push([`Движение денег (${range.label})`, null]);
    rows.push(["+ Оплаты", num(cash.grossIncome), `наличные ${num(cash.cashIncome)} · безнал ${num(cash.cardIncome)}`]);
    rows.push(["− Возвраты", num(cash.refundedTotal), `операций: ${cash.refundCount}`]);
    rows.push(["+ Продажи товаров", num(cash.salesTotal), `продаж: ${cash.saleCount}`]);
    rows.push(["− Расходы", num(cash.totalExpenses), `операций: ${cash.expenseCount}`]);
    rows.push(["− Закупки", num(cash.supplyTotal)]);
    rows.push(["= Осталось", num(cash.netCashFlow)]);
    if (num(cash.insuranceIncome) > 0) {
      rows.push(["Страховые (вне итогов)", num(cash.insuranceIncome)]);
    }
    blank();
  }

  // ── Записи ──
  if (counts && countsPrev) {
    rows.push(["Записи", null]);
    rows.push([
      `Всего записей ${range.label}`,
      sumDayCounts(counts),
      `${prev.label}: ${sumDayCounts(countsPrev)}`,
    ]);
    if (availability) {
      const total = availability.overallEmployeeCount;
      const free = availability.overallFreeEmployeeCount;
      rows.push([
        "Загрузка сегодня, %",
        total > 0 ? Math.round(((total - free) / total) * 100) : "—",
        total > 0 ? `свободны ${free} из ${total}` : "график не заполнен",
      ]);
    }
    blank();
  }

  // ── Месяц целиком ──
  if (report) {
    const s = report.summary;
    const debt = (report.daily ?? []).reduce((acc, d) => acc + num(d.debtSum), 0);
    rows.push([`Месяц целиком (${dayjs(monthRange.month + "-01").format("MMMM YYYY")})`, null]);
    rows.push(["Приёмов", s.apptTotalCount]);
    rows.push(["Процедур", s.procTotalCount]);
    rows.push(["Оплачено приёмов", s.apptPaidCount]);
    rows.push(["Отменено", s.apptCancelledCount]);
    rows.push(["Скидки", num(s.discountSum), `приёмов со скидкой: ${s.discountedCount}`]);
    rows.push(["Долги", debt, "сумма колонки «Долг» месячного отчёта"]);
    blank();
  }

  // ── Операционка ──
  if (tasks) {
    rows.push(["Задачи (на момент выгрузки)", null]);
    rows.push(["Просрочено", tasks.overdue]);
    rows.push(["Ждут приёмки", tasks.awaitingApproval]);
    rows.push(["В работе", tasks.inProgress]);
    rows.push(["Новых", tasks.new]);
    blank();
  }

  if (deals) {
    rows.push(["Воронка продаж (на момент выгрузки)", null]);
    rows.push(["Обращений в работе", deals.openCount, `на сумму ${num(deals.openAmount)}`]);
    rows.push(["Касаний просрочено", deals.overdueActionsCount]);
    rows.push(["Касаний на сегодня", deals.todayActionsCount]);
    rows.push(["Выиграно", deals.wonCount, `на сумму ${num(deals.wonAmount)}`]);
    blank();
  }

  if (reviews) {
    rows.push([`Отзывы (${range.label})`, null]);
    rows.push(["Запросов отправлено", reviews.sent]);
    rows.push(["Ответов", reviews.answered]);
    rows.push(["Средняя оценка", reviews.sent > 0 ? num(reviews.avgRating) : "—"]);
    rows.push(["Негативных", reviews.negativeCount]);
    blank();
  }

  // ── Люди ──
  if (allow.payroll) {
    const month = dayjs(monthRange.month + "-01");
    const payroll = await getPayrollReport({
      year: month.year(),
      month: month.month() + 1,
      organizationId: scope.organizationId,
      branchId: scope.branchId,
    });
    const top = [...(payroll.rows ?? [])]
      .filter((r) => r.appointmentsCount > 0)
      .sort((a, b) => b.appointmentsCount - a.appointmentsCount)
      .slice(0, 10);
    if (top.length) {
      rows.push([`Сотрудники — топ по приёмам (${month.format("MMMM")})`, null]);
      for (const r of top) {
        rows.push([r.fullName, r.appointmentsCount, `начислено ${num(r.earnings)}`]);
      }
      blank();
    }
  }

  // ── Филиалы ──
  if (allow.branches && allow.money) {
    const branches = (await getBranches(scope.organizationId)).slice(0, 8);
    if (branches.length > 1) {
      const summaries = await Promise.all(
        branches.map((b) => qc.fetchQuery(cashboxSummaryQuery({ ...scope, branchId: b.id }, range))),
      );
      rows.push([`Филиалы (${range.label})`, null]);
      branches
        .map((b, i) => ({ b, s: summaries[i] }))
        .sort((x, y) => num(y.s.netIncome) - num(x.s.netIncome))
        .forEach(({ b, s }) => {
          rows.push([
            b.name,
            num(s.netIncome),
            `оплат: ${s.paymentCount} · осталось после расходов ${num(s.netCashFlow)}`,
          ]);
        });
    }
  }

  return rows;
}

export async function exportDashboardXlsx(input: DashboardExportInput): Promise<void> {
  const rows = await collectRows(input);

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Сводка");

  ws.columns = [
    { key: "label", width: 60 },
    { key: "value", width: 18 },
    { key: "note", width: 48 },
  ];

  const scopeLine = [input.organizationName, input.branchName].filter(Boolean).join(" · ");
  const title = ws.addRow([`Сводка — ${scopeLine}`]);
  title.font = { bold: true, size: 14 };
  ws.addRow([
    `Период: ${input.range.dateFrom} — ${input.range.dateTo} (${input.range.label})`,
  ]);
  ws.addRow([`Выгружено: ${dayjs().format("DD.MM.YYYY HH:mm")}`]);
  ws.addRow([]);

  for (const [label, value, note] of rows) {
    const row = ws.addRow([label, value, note ?? ""]);
    // Заголовок раздела — строка без значения: выделяем жирным.
    if (value === null && label.trim()) row.font = { bold: true };
    if (typeof value === "number") row.getCell(2).numFmt = "# ##0";
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Сводка ${input.range.dateFrom}—${input.range.dateTo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
