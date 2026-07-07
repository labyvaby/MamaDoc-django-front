/**
 * Хуки «связанных данных» сотрудника (СКУД / Расходы / ЗП) за выбранный месяц.
 *
 * Используются и плитками на карточке (живые цифры), и модалками с детализацией —
 * queryKey общий (включает месяц), поэтому запрос выполняется один раз и кешируется.
 *
 * Месяц задаётся якорем `monthAnchor` в формате "YYYY-MM-DD" (любой день месяца).
 * По умолчанию — текущий месяц.
 */
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getShifts } from "../../../api/attendance";
import { getExpenses } from "../../../api/expenses";
import { getPayrollReport } from "../../../api/payroll";

/** Якорь текущего месяца в формате "YYYY-MM-DD" — дефолт для хуков. */
export const currentMonthAnchor = () => dayjs().format("YYYY-MM-DD");

const monthStart = (anchor: string) => dayjs(anchor).startOf("month").format("YYYY-MM-DD");
const monthEnd = (anchor: string) => dayjs(anchor).endOf("month").format("YYYY-MM-DD");
/** Ключ месяца "YYYY-MM" — стабильная часть queryKey (не зависит от дня). */
const monthKey = (anchor: string) => dayjs(anchor).format("YYYY-MM");

/** Смены сотрудника за выбранный месяц (СКУД). */
export function useEmployeeShiftsMonth(
  employeeId: number,
  enabled: boolean,
  monthAnchor: string = currentMonthAnchor(),
) {
  return useQuery({
    queryKey: ["django", "attendance", "shifts", employeeId, monthKey(monthAnchor)],
    queryFn: ({ signal }) =>
      getShifts(
        { employeeId, dateFrom: monthStart(monthAnchor), dateTo: monthEnd(monthAnchor) },
        signal,
      ),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Расходы, привязанные к сотруднику, за выбранный месяц. */
export function useEmployeeExpensesMonth(
  employeeId: number,
  organizationId: number | undefined,
  enabled: boolean,
  monthAnchor: string = currentMonthAnchor(),
) {
  return useQuery({
    queryKey: ["django", "expenses", "by-employee", employeeId, monthKey(monthAnchor)],
    queryFn: ({ signal }) =>
      getExpenses(
        {
          employeeId,
          organizationId,
          dateFrom: monthStart(monthAnchor),
          dateTo: monthEnd(monthAnchor),
          pageSize: 100,
        },
        signal,
      ),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Зарплатный отчёт организации за выбранный месяц (строку сотрудника ищет вызывающий).
 *  Отчёт общий по организации — кешируется и переиспользуется между карточками. */
export function usePayrollReportMonth(
  organizationId: number | undefined,
  enabled: boolean,
  monthAnchor: string = currentMonthAnchor(),
) {
  const anchor = dayjs(monthAnchor);
  const year = anchor.year();
  const month = anchor.month() + 1;
  return useQuery({
    queryKey: ["django", "payroll", "report", organizationId ?? null, year, month],
    queryFn: ({ signal }) => getPayrollReport({ year, month, organizationId }, signal),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
