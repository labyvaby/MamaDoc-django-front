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
  balance: string;
  bonuses: string;
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
  discountSum: string;
  debtSum: string;
  appointmentsCount: number;
  proceduresCount: number;
  waitingCount: number;
  dayCount: number;
  nightCount: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  organizationId: number | null;
  summary: ReportSummary;
  totals: ReportTotals;
  daily: DailyRow[];
}

export interface ActiveMonths {
  months: string[];
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
  );
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
