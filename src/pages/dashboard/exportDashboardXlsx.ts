import dayjs from "dayjs";

import { getDayCounts } from "../../api/appointments";
import { getCashboxSummary } from "../../api/cashbox";
import { getMonthlyReport } from "../../api/reports";
import { getReviewStats } from "../../api/reviews";
import { getTasksSummary } from "../../api/tasks";
import { getBranches } from "../../api/organization";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { previousRange, sumDayCounts, type PeriodKey, type PeriodRange } from "./period";

/**
 * Выгрузка сводки в .xlsx.
 *
 * exceljs грузится динамическим import — библиотека около 700 КБ и нужна только
 * в момент выгрузки; в основной бандл её тянуть незачем (тот же приём, что в
 * платёжной ведомости `features/payroll/statement`).
 *
 * Данные запрашиваются заново, а не берутся из кэша экрана: выгрузка должна
 * содержать те же цифры, что видит пользователь, но не зависеть от того, какие
 * блоки он спрятал.
 */

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

export interface DashboardExportInput {
  range: PeriodRange;
  periodKey: PeriodKey;
  scope: ActiveScope;
  organizationName: string;
  branchName?: string;
  /** Что пользователю разрешено видеть — лишние разделы в файл не попадают. */
  allow: {
    money: boolean;
    appointments: boolean;
    reports: boolean;
    tasks: boolean;
    reviews: boolean;
    branches: boolean;
  };
}

type Row = [string, string | number | null, string?];

/** Собирает строки отчёта; вынесено из записи файла, чтобы читалось линейно. */
async function collectRows(input: DashboardExportInput): Promise<Row[]> {
  const { range, periodKey, scope, allow } = input;
  const prev = previousRange(range, periodKey);
  const rows: Row[] = [];

  if (allow.money) {
    const [now, before] = await Promise.all([
      getCashboxSummary({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
      getCashboxSummary({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        dateFrom: prev.dateFrom,
        dateTo: prev.dateTo,
      }),
    ]);

    rows.push(["Деньги", null]);
    rows.push(["Приход за вычетом возвратов", num(now.netIncome), `${prev.label}: ${num(before.netIncome)}`]);
    rows.push(["Наличные", num(now.cashIncome)]);
    rows.push(["Безнал", num(now.cardIncome)]);
    rows.push(["Оплат", now.paymentCount]);
    rows.push([
      "Средний чек",
      now.paymentCount > 0 ? Math.round(num(now.netIncome) / now.paymentCount) : 0,
    ]);
    rows.push(["Возвраты", num(now.refundedTotal), `операций: ${now.refundCount}`]);
    rows.push(["Продажи товаров", num(now.salesTotal)]);
    rows.push(["Расходы", num(now.totalExpenses)]);
    rows.push(["Остаток движения", num(now.netCashFlow)]);
    rows.push([" ", null]);
  }

  if (allow.appointments) {
    const [now, before] = await Promise.all([
      getDayCounts({ dateFrom: range.dateFrom, dateTo: range.dateTo, branchId: scope.branchId }),
      getDayCounts({ dateFrom: prev.dateFrom, dateTo: prev.dateTo, branchId: scope.branchId }),
    ]);
    rows.push(["Записи", null]);
    rows.push(["Всего записей", sumDayCounts(now), `${prev.label}: ${sumDayCounts(before)}`]);
    rows.push([" ", null]);
  }

  if (allow.reports) {
    const report = await getMonthlyReport({
      month: range.month,
      branchId: scope.branchId,
      organizationId: scope.organizationId,
    });
    const s = report.summary;
    rows.push([`Месяц целиком (${dayjs(range.month + "-01").format("MMMM YYYY")})`, null]);
    rows.push(["Приёмов", s.apptTotalCount]);
    rows.push(["Процедур", s.procTotalCount]);
    rows.push(["Оплачено приёмов", s.apptPaidCount]);
    rows.push(["Отменено", s.apptCancelledCount]);
    rows.push(["Скидки", num(s.discountSum), `приёмов со скидкой: ${s.discountedCount}`]);
    rows.push([" ", null]);
  }

  if (allow.tasks) {
    const t = await getTasksSummary(scope.organizationId);
    rows.push(["Задачи (на момент выгрузки)", null]);
    rows.push(["Просрочено", t.overdue]);
    rows.push(["В работе", t.inProgress]);
    rows.push(["Новых", t.new]);
    rows.push([" ", null]);
  }

  if (allow.reviews) {
    const r = await getReviewStats({
      from: range.dateFrom,
      to: range.dateTo,
      organizationId: scope.organizationId,
    });
    rows.push(["Отзывы", null]);
    rows.push(["Запросов отправлено", r.sent]);
    rows.push(["Ответов", r.answered]);
    rows.push(["Средняя оценка", r.sent > 0 ? num(r.avgRating) : null]);
    rows.push(["Негативных", r.negativeCount]);
    rows.push([" ", null]);
  }

  if (allow.branches) {
    const branches = (await getBranches(scope.organizationId)).slice(0, 8);
    if (branches.length > 1) {
      rows.push(["Филиалы", null]);
      const summaries = await Promise.all(
        branches.map((b) =>
          getCashboxSummary({
            organizationId: scope.organizationId,
            branchId: b.id,
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
          }),
        ),
      );
      branches.forEach((b, i) => {
        const s = summaries[i];
        rows.push([b.name, num(s.netIncome), `оплат: ${s.paymentCount}`]);
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
    { key: "label", width: 38 },
    { key: "value", width: 18 },
    { key: "note", width: 42 },
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
