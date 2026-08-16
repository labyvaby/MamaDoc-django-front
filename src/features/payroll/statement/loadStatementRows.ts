import { getEmployeeDailyDetails, type PayrollRow } from "../../../api/payroll";
import { getDjangoEmployee } from "../../../api/staff";
import { countWorkDays } from "./workDays";

/**
 * Данные ведомости собираются из двух источников: отчёт ЗП даёт ФИО и сумму к
 * выплате, а номер карты/счёта живёт только в детали сотрудника
 * (`GET /staff/employees/<id>/`) — в списке сотрудников этого поля нет
 * (проверено на живом API 16.08.2026). Плюс на каждого нужен запрос дневной
 * детализации ради колонки «Рабочих дней». Итого два запроса на человека,
 * поэтому грузим пачками и сообщаем прогресс.
 */

export interface StatementSourceRow {
  employeeId: number;
  fullName: string;
  /** Сумма к выплате из отчёта (netSalary). */
  amount: number;
  /** Пусто, если не заполнен в карточке или нет права staff.private.view. */
  accountNumber: string;
  /** null — детализацию получить не удалось. */
  workDays: number | null;
  /** true — часть данных сотрудника не загрузилась. */
  hasError: boolean;
}

export interface LoadStatementParams {
  rows: PayrollRow[];
  year: number;
  month: number;
  organizationId?: number;
  branchId?: number;
  /**
   * Есть ли право `staff.private.view`. Без него бэк отдаёт `bankAccountNumber`
   * пустой строкой — карточки сотрудников не запрашиваем вовсе, это половина
   * всех запросов впустую.
   */
  withAccounts?: boolean;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

/** Параллелизм: 5 сотрудников за раз — 10 одновременных запросов к API. */
const CHUNK_SIZE = 5;

export async function loadStatementRows({
  rows,
  year,
  month,
  organizationId,
  branchId,
  withAccounts = true,
  signal,
  onProgress,
}: LoadStatementParams): Promise<StatementSourceRow[]> {
  const result: StatementSourceRow[] = [];
  let loaded = 0;
  onProgress?.(0, rows.length);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    const settled = await Promise.all(
      chunk.map(async (row): Promise<StatementSourceRow> => {
        // allSettled: пустой счёт или недоступная детализация одного сотрудника
        // не должны рушить всю ведомость — такую строку просто помечаем.
        const [employee, details] = await Promise.allSettled([
          withAccounts
            ? getDjangoEmployee(row.employeeId, signal)
            : Promise.resolve(null),
          getEmployeeDailyDetails(
            row.employeeId,
            { year, month, organizationId, branchId },
            signal,
          ),
        ]);

        return {
          employeeId: row.employeeId,
          fullName: row.fullName,
          amount: Number.parseFloat(row.netSalary || "0") || 0,
          accountNumber:
            employee.status === "fulfilled" ? employee.value?.bankAccountNumber ?? "" : "",
          workDays: details.status === "fulfilled" ? countWorkDays(details.value) : null,
          hasError: employee.status === "rejected" || details.status === "rejected",
        };
      }),
    );

    result.push(...settled);
    loaded += chunk.length;
    onProgress?.(loaded, rows.length);
  }

  return result;
}
