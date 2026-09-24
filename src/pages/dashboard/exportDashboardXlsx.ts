import dayjs from "dayjs";

import type { DashboardData } from "./DashboardData";
import { attentionInputFromSections, buildAttentionItems, ATTENTION_GROUPS } from "./attention";
import { planProgress } from "./revenuePlan";

/**
 * Выгрузка сводки в .xlsx.
 *
 * exceljs грузится динамическим import — библиотека около 700 КБ и нужна только
 * в момент выгрузки; в основной бандл её тянуть незачем (тот же приём, что в
 * платёжной ведомости `features/payroll/statement`).
 *
 * Данные — те же, что на экране (`DashboardData`): в файле ровно те цифры, что
 * видит пользователь, и выгрузка не делает ни одного запроса. Состав файла не
 * зависит от того, какие блоки спрятаны — только от того, что отдал сервер
 * (раздел без права он не отдаёт).
 */

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

export interface DashboardExportInput {
  data: DashboardData;
  organizationName: string;
  branchName?: string;
  /** План выручки на текущий месяц для этого скоупа (см. revenuePlan.ts). */
  plan?: number | null;
}

type Row = [string, string | number | null, string?];

/** Собирает строки отчёта; вынесено из записи файла, чтобы читалось линейно. */
export function collectRows(input: DashboardExportInput): Row[] {
  const { data } = input;
  const { range, prev, sections } = data;
  const { money, month, appointments: appts, bookings, tasks, deals, reviews, staff, load } =
    sections;
  const rows: Row[] = [];
  const blank = () => rows.push([" ", null]);

  // ── Требует внимания — первым, как на экране ──
  const attention = buildAttentionItems(attentionInputFromSections(sections, range.label));
  rows.push(["Требует внимания", null]);
  if (attention.length === 0) rows.push(["Всё под контролем", "—"]);
  for (const g of ATTENTION_GROUPS) {
    for (const item of attention.filter((i) => i.severity === g.severity)) {
      rows.push([`${g.label}: ${item.text}`, item.value]);
    }
  }
  blank();

  // ── Выручка и темп месяца ──
  if (money) {
    const income = num(money.netIncome);
    rows.push(["Выручка", null]);
    rows.push([
      `Выручка ${range.label}`,
      income,
      money.baseline ? `${prev.label}: ${num(money.baseline.netIncome)}` : undefined,
    ]);
    if (month) {
      const monthIncome = num(month.netIncome);
      const elapsed = month.daysElapsed;
      const inMonth = month.daysInMonth;
      const pace = elapsed >= 3 && monthIncome > 0 ? (monthIncome / elapsed) * inMonth : null;
      rows.push(["С начала месяца", monthIncome, `день ${elapsed} из ${inMonth}`]);
      if (pace != null) rows.push(["По темпу к концу месяца", Math.round(pace), "линейная оценка"]);
      if (month.previousMonth) {
        rows.push([
          `${dayjs(month.previousMonth.dateFrom).format("MMMM")} целиком`,
          num(month.previousMonth.netIncome),
        ]);
      }
      if (input.plan) {
        const p = planProgress(input.plan, monthIncome, elapsed, inMonth, pace);
        rows.push(["План на месяц", input.plan, `выполнено ${Math.round(p.done * 100)}%`]);
        rows.push([
          "Нужно в день до конца месяца",
          p.perDayNeeded == null ? "—" : Math.round(p.perDayNeeded),
          p.remaining === 0 ? "план выполнен" : `осталось ${Math.round(p.remaining)}`,
        ]);
      }
    }
    rows.push([
      "Средний чек",
      money.paymentCount > 0 ? Math.round(income / money.paymentCount) : 0,
      `оплат: ${money.paymentCount}`,
    ]);
    blank();

    rows.push([`Движение денег (${range.label})`, null]);
    rows.push([
      "+ Оплаты",
      num(money.grossIncome),
      `наличные ${num(money.cashIncome)} · безнал ${num(money.cardIncome)}`,
    ]);
    rows.push(["− Возвраты", num(money.refundedTotal), `операций: ${money.refundCount}`]);
    rows.push(["+ Продажи товаров", num(money.salesTotal), `продаж: ${money.saleCount}`]);
    rows.push(["− Расходы", num(money.totalExpenses), `операций: ${money.expenseCount}`]);
    rows.push(["− Закупки", num(money.supplyTotal)]);
    rows.push(["= Осталось", num(money.netCashFlow)]);
    if (num(money.insuranceIncome) > 0) {
      rows.push(["Страховые (вне итогов)", num(money.insuranceIncome)]);
    }
    if (money.unpaidPastCount != null) {
      rows.push([
        "Не получено за прошедшие визиты",
        num(money.unpaidPastAmount),
        `визитов: ${money.unpaidPastCount}`,
      ]);
    }
    if (money.debtOutstanding != null) {
      rows.push(["Долг пациентов на сейчас", num(money.debtOutstanding), "все прошедшие визиты"]);
    }
    blank();
  }

  // ── Записи ──
  if (appts) {
    const b = appts.baseline;
    rows.push(["Записи", null]);
    rows.push([
      `Всего записей ${range.label}`,
      appts.total,
      b ? `${prev.label}: ${b.total}` : undefined,
    ]);
    if (appts.visits != null) {
      rows.push(["Визитов (без отмен и неявок)", appts.visits, b ? `${prev.label}: ${b.visits}` : undefined]);
      rows.push(["Оплачено", appts.paid ?? 0]);
      const by = appts.canceledBy;
      rows.push([
        "Отмены",
        appts.canceled ?? 0,
        by ? `пациент ${by.patient} · клиника ${by.clinic} · неизвестно ${by.unknown}` : undefined,
      ]);
      rows.push(["Неявки", appts.noShow ?? 0]);
      rows.push(["Повторные визиты, %", num(appts.repeatShare), `визитов: ${appts.repeatVisits ?? 0}`]);
    }
    if (load) {
      const total = load.overallEmployeeCount;
      const free = load.overallFreeEmployeeCount;
      rows.push([
        "Загрузка сегодня, %",
        total > 0 ? Math.round(((total - free) / total) * 100) : "—",
        total > 0 ? `свободны ${free} из ${total}` : "график не заполнен",
      ]);
    }
    blank();
  }

  if (appts?.topServices?.length) {
    rows.push([`Что продаётся — топ услуг по выручке (${range.label})`, null]);
    for (const s of appts.topServices) {
      rows.push([s.serviceName, num(s.amount), `визитов: ${s.count} · доля ${num(s.share)}%`]);
    }
    blank();
  }

  if (bookings) {
    rows.push(["Онлайн-запись", null]);
    rows.push(["Ждут подтверждения (сейчас)", bookings.pendingCount]);
    rows.push(["Из них просрочено", bookings.overdueCount]);
    if (bookings.total != null) {
      rows.push([
        `Брони на даты периода`,
        bookings.total,
        `в приём ${bookings.materialized ?? 0} · оплачено ${bookings.paid ?? 0} · конверсия ${num(bookings.conversionRate)}%`,
      ]);
    }
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
    rows.push(["Средняя оценка", reviews.sent > 0 ? num(reviews.averageRating) : "—"]);
    rows.push(["Негативных", reviews.negative]);
    blank();
  }

  // ── Люди ──
  if (staff?.topByRevenue?.length) {
    rows.push([`Сотрудники — топ по выручке (${range.label})`, null]);
    for (const r of staff.topByRevenue) {
      rows.push([r.employeeName, num(r.amount), `визитов: ${r.count} · доля ${num(r.share)}%`]);
    }
    blank();
  }
  if (staff?.payroll) {
    const top = [...staff.payroll.rows]
      .filter((r) => r.appointmentsCount > 0)
      .sort((a, b) => b.appointmentsCount - a.appointmentsCount)
      .slice(0, 10);
    if (top.length) {
      const m = dayjs(`${staff.payroll.year}-${String(staff.payroll.month).padStart(2, "0")}-01`);
      rows.push([`Сотрудники — топ по приёмам (${m.format("MMMM")})`, null]);
      for (const r of top) {
        rows.push([r.fullName, r.appointmentsCount, `начислено ${num(r.earnings)}`]);
      }
      blank();
    }
  }

  // ── Филиалы ──
  if (data.branches && data.branches.length > 1) {
    rows.push([`Филиалы (${range.label})`, null]);
    [...data.branches]
      .sort((x, y) => num(y.money.netIncome) - num(x.money.netIncome))
      .forEach((b) => {
        const base = b.money.baseline;
        rows.push([
          b.branchName,
          num(b.money.netIncome),
          [
            `оплат: ${b.money.paymentCount}`,
            base ? `${prev.label}: ${num(base.netIncome)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      });
  }

  return rows;
}

export async function exportDashboardXlsx(input: DashboardExportInput): Promise<void> {
  const rows = collectRows(input);

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
    `Период: ${input.data.range.dateFrom} — ${input.data.range.dateTo} (${input.data.range.label})`,
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
  a.download = `Сводка ${input.data.range.dateFrom}—${input.data.range.dateTo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
