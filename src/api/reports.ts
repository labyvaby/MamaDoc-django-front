import { apiRequest } from "./client";

/** Summary-card counts for the selected month. */
export interface ReportSummary {
  apptTotalCount: number;
  apptPaidCount: number;
  apptCancelledCount: number;
  procTotalCount: number;
  procPaidCount: number;
  paidCount: number;
  discountedCount: number;
  discountSum: string;
  waitingCount: number;
  cancelledCount: number;
}

/** Month totals (sum over all daily rows). Monetary values are decimal strings. */
export interface ReportTotals {
  services: string;
  products: string;
  cash: string;
  card: string;
  /**
   * Запасное имя итога безнала. Ответ бэка 19.08.2026 называет итог
   * `totals.cardSum`, а живой ответ теста отдаёт `card` — какое из имён
   * приедет после выкладки, неизвестно, поэтому принимаем оба (см.
   * `normalizeMonthlyReport`).
   */
  cardSum?: string;
  balance: string;
  bonuses: string;
  /** Покрыто страховыми компаниями */
  insurance: string;
  discount: string;
  debt: string;
  appointmentsCount: number;
  proceduresCount: number;
  waitingCount: number;
  dayCount: number;
  nightCount: number;
}

/** A single day in the financial table. Monetary values are decimal strings. */
export interface DailyRow {
  date: string; // YYYY-MM-DD
  servicesSum: string;
  productsSum: string;
  cashSum: string;
  cardSum: string;
  balanceSum: string;
  bonusesSum: string;
  /** Покрыто страховыми компаниями */
  insuranceSum: string;
  discountSum: string;
  debtSum: string;
  appointmentsCount: number;
  proceduresCount: number;
  waitingCount: number;
  dayCount: number;
  nightCount: number;
}

/**
 * Разрез безнала по способам за месяц. Структура намеренно не совпадает с
 * кассовой: в отчёте нет колонок расходов и закупок, поэтому и в разрезе их
 * нет, а сам разрез — за период, не по дням. `cardSum` по массиву сходится
 * с безналичным итогом месяца (бэк назвал его `totals.cardSum`, у нас поле
 * читается как `totals.card` — сверить на живом ответе). Продаж товаров здесь
 * тоже нет: способа у них не существует.
 */
export interface ReportCashlessMethodRow {
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  cardSum: string;
  count: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  organizationId: number | null;
  summary: ReportSummary;
  totals: ReportTotals;
  daily: DailyRow[];
  /** Нет на бэке без этой доработки и пуст за месяц без безнала. */
  byCashlessMethod?: ReportCashlessMethodRow[];
}

export interface ActiveMonths {
  months: string[];
}

/**
 * Итог безнала приходит под именем `card`, но ответ бэка от 19.08.2026
 * ссылается на него как на `totals.cardSum`. Переименование молча обнулило бы
 * колонку «Безнал» во всём отчёте, поэтому берём то из двух, что пришло.
 * Разрез `byCashlessMethod` нормализуем в массив: до выкладки его нет вовсе.
 */
export function normalizeMonthlyReport(raw: MonthlyReport): MonthlyReport {
  const totals = raw.totals ?? ({} as ReportTotals);
  return {
    ...raw,
    totals: { ...totals, card: totals.card ?? totals.cardSum ?? "0.00" },
    byCashlessMethod: Array.isArray(raw.byCashlessMethod) ? raw.byCashlessMethod : [],
  };
}

export interface MonthlyReportParams {
  month?: string; // YYYY-MM
  branchId?: number;
  employeeId?: number;
  organizationId?: number;
}

export function getMonthlyReport(
  params: MonthlyReportParams = {},
  signal?: AbortSignal,
): Promise<MonthlyReport> {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<MonthlyReport>(
    `/reports/monthly/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then(normalizeMonthlyReport);
}

export function getActiveMonths(
  params: { organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<ActiveMonths> {
  const q = new URLSearchParams();
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<ActiveMonths>(
    `/reports/active-months/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
