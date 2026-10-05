import { apiRequest } from "./client";

// ── Types (mirror server/apps/reports/api/payloads.py DoctorProfitPayload) ────

/** Состав начисленной ЗП — как в «Отчёте по ЗП». */
export interface ProfitSalaryParts {
  servicePercent: string;
  serviceFixed: string;
  appointment: string;
  product: string;
  bonus: string;
  hourly: string;
  cleaning: string;
}

export interface ProfitRow {
  /** null — выручка позиций без врача. */
  employeeId: number | null;
  fullName: string;
  scheduleMinutes: number;
  outsideMinutes: number;
  totalMinutes: number;
  /** Графика нет — часы взяты по приёмам. */
  byAppointments: boolean;
  revenueServices: string;
  revenueProducts: string;
  revenue: string;
  /** Справочно, в выручку не входит. */
  debt: string;
  salary: string;
  salaryParts: ProfitSalaryParts;
  costVaccines: string;
  costProducts: string;
  costConsumables: string;
  cost: string;
  profitDirect: string;
  overheadExpenses: string;
  overheadStaff: string;
  overheadFixed: string;
  overhead: string;
  profit: string;
  marginPct: number | null;
}

export interface ProfitTotals {
  revenue: string;
  salary: string;
  cost: string;
  profitDirect: string;
  /** Доли строк + нераспределённое. */
  overhead: string;
  unallocated: string;
  profit: string;
  marginPct: number | null;
}

/** Слагаемое общих расходов: категория, сотрудник или постоянный расход. */
export interface ProfitOverheadItem {
  id: number;
  name: string;
  branchId: number | null;
  branchName: string | null;
  amount: string;
}

export interface ProfitOverhead {
  expenses: ProfitOverheadItem[];
  staff: ProfitOverheadItem[];
  fixed: ProfitOverheadItem[];
}

export interface ProfitWarnings {
  productsWithoutCostCount: number;
  /** До 20 названий. */
  productsWithoutCost: string[];
  salesWithoutCost: string;
  employeesWithoutSchedule: number;
}

export interface DoctorProfit {
  month: string; // YYYY-MM
  organizationId: number;
  branchId: number | null;
  rows: ProfitRow[];
  totals: ProfitTotals;
  overhead: ProfitOverhead;
  warnings: ProfitWarnings;
}

export interface DoctorProfitParams {
  month: string; // YYYY-MM
  branchId?: number;
  organizationId?: number;
}

// ── API ────────────────────────────────────────────────────────────────────────

export function getDoctorProfit(
  params: DoctorProfitParams,
  signal?: AbortSignal,
): Promise<DoctorProfit> {
  const q = new URLSearchParams({ month: params.month });
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<DoctorProfit>(`/reports/doctor-profit/?${q.toString()}`, { signal });
}
