import { apiRequest } from "./client";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PayrollRow {
  employeeId: number;
  fullName: string;
  clinicalRole: string;
  roleName: string;
  appointmentsCount: number;
  distributedAppointments: string;
  createdByCount: number;
  totalCount: number;
  waitingCount: number;
  cancelledCount: number;
  discountedCount: number;
  paidCount: number;
  servicePercentPay: string;
  serviceFixedPay: string;
  appointmentPay: string;
  dayHours: string;
  nightHours: string;
  hourlyPay: string;
  /**
   * One-off bonuses (надбавки) for this employee in the report month.
   * Already included in `earnings`/`netSalary` by the backend.
   * May be absent on older backends — treat undefined as "0.00".
   */
  bonus?: string;
  /**
   * Заработок с товаров, проданных в приёмах сотрудника (% от суммы +
   * фикс-бонус за единицу). Включён в `earnings`/`netSalary`.
   * May be absent on older backends — treat undefined as "0.00".
   */
  productPay?: string;
  earnings: string;
  advances: string;
  netSalary: string;
}

export interface EmployeeDailyDetailRow {
  workDate: string;
  dayHours: string;
  nightHours: string;
  dayHoursSum: string;
  nightHoursSum: string;
  hoursSum: string;
  appointmentsCount: number;
  distributedAppointments: string;
  createdByCount: number;
  percentSum: string;
  expensesSum: string;
  totalSalary: string;
  isWeekend: boolean;
  hasWarning: boolean;
}

export interface PayrollReport {
  year: number;
  month: number;
  organizationId: number;
  /** "draft" (live) | "locked" (frozen snapshots). */
  status: string;
  lockedAt: string | null;
  totalNet: string;
  rows: PayrollRow[];
  settings: any;
}

export interface ServiceRate {
  serviceId: number;
  serviceName: string;
  percent: string;
  fixedAmount: string;
}

export interface ProductRate {
  productId: number;
  productName: string;
  percent: string;
  fixedAmount: string;
}

export interface EmployeeRule {
  employeeId: number;
  employeeFullName: string;
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  /** Процент с товаров, проданных в приёмах сотрудника. */
  productPercent: string;
  /** Фикс-бонус за каждую единицу товара в приёме. */
  productFixedAmount: string;
  isActive: boolean;
  serviceRates: ServiceRate[];
  /** Индивидуальные ставки по конкретным товарам (перекрывают общие поля). */
  productRates: ProductRate[];
}

export interface RuleWriteData {
  appointmentRate?: string | number;
  dayHourlyRate?: string | number;
  nightHourlyRate?: string | number;
  productPercent?: string | number;
  productFixedAmount?: string | number;
  isActive?: boolean;
  serviceRates?: {
    serviceId: number;
    percent: string | number;
    fixedAmount: string | number;
  }[];
  productRates?: {
    productId: number;
    percent: string | number;
    fixedAmount: string | number;
  }[];
}

// ── API functions ─────────────────────────────────────────────────────────────

/** GET /api/payroll/report/ — monthly per-employee salary report.

 * branchId — аналитический срез по филиалу (приёмы и авансы филиала;
 * часы СКУД в срез не входят — у смен нет филиала). Без branchId —
 * полный org-wide расчёт, участвующий в заморозке.
 */
export function getPayrollReport(
  params: {
    year?: number;
    month?: number;
    organizationId?: number;
    branchId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<PayrollReport> {
  const q = new URLSearchParams();
  if (params.year != null) q.set("year", String(params.year));
  if (params.month != null) q.set("month", String(params.month));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<PayrollReport>(`/payroll/report/${qs ? `?${qs}` : ""}`, { signal });
}

/** POST /api/payroll/periods/lock/ — freeze the month into snapshots. */
export function lockPeriod(year: number, month: number): Promise<PayrollReport> {
  return apiRequest<PayrollReport>("/payroll/periods/lock/", {
    method: "POST",
    body: { year, month },
  });
}

/** POST /api/payroll/periods/recalculate/ — recompute a frozen month. */
export function recalculatePeriod(
  year: number,
  month: number,
  reason: string,
): Promise<PayrollReport> {
  return apiRequest<PayrollReport>("/payroll/periods/recalculate/", {
    method: "POST",
    body: { year, month, reason },
  });
}

/** POST /api/payroll/periods/unlock/ — разморозить месяц (отчёт снова живой). */
export function unlockPeriod(year: number, month: number): Promise<PayrollReport> {
  return apiRequest<PayrollReport>("/payroll/periods/unlock/", {
    method: "POST",
    body: { year, month },
  });
}

/** POST /api/payroll/periods/settings/ — save period settings. */
export function updatePeriodSettings(
  year: number,
  month: number,
  settings: any,
  organizationId?: number,
): Promise<PayrollReport> {
  const q = new URLSearchParams();
  if (organizationId != null) {
    q.set("organizationId", String(organizationId));
  }
  const qs = q.toString();
  return apiRequest<PayrollReport>(
    `/payroll/periods/settings/${qs ? `?${qs}` : ""}`,
    {
      method: "POST",
      body: { year, month, settings },
    },
  );
}

/** GET /api/payroll/employees/<id>/rules/ — the employee's salary rule. */
export function getEmployeeRule(
  employeeId: number,
  signal?: AbortSignal,
): Promise<EmployeeRule> {
  return apiRequest<EmployeeRule>(
    `/payroll/employees/${employeeId}/rules/`,
    { signal },
  );
}

/** PUT /api/payroll/employees/<id>/rules/ — replace the employee's rule. */
export function putEmployeeRule(
  employeeId: number,
  data: RuleWriteData,
): Promise<EmployeeRule> {
  return apiRequest<EmployeeRule>(`/payroll/employees/${employeeId}/rules/`, {
    method: "PUT",
    body: data,
  });
}

// ── Bonuses (надбавки) ──────────────────────────────────────────────────────
// One-off fixed salary additions for a specific employee in a specific month
// (e.g. +10 000 for an extra task). Added on top of the calculated earnings.

export interface PayrollBonus {
  id: number;
  employeeId: number;
  employeeFullName: string;
  year: number;
  month: number;
  /** Decimal string, e.g. "10000.00". */
  amount: string;
  reason: string;
  createdAt: string;
  createdByName?: string | null;
}

export interface BonusWriteData {
  employeeId: number;
  year: number;
  month: number;
  amount: string | number;
  reason: string;
}

/** GET /api/payroll/bonuses/ — bonuses for a month (optionally one employee). */
export function getBonuses(
  params: {
    year: number;
    month: number;
    employeeId?: number;
    organizationId?: number;
  },
  signal?: AbortSignal,
): Promise<PayrollBonus[]> {
  const q = new URLSearchParams();
  q.set("year", String(params.year));
  q.set("month", String(params.month));
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  return apiRequest<PayrollBonus[]>(`/payroll/bonuses/?${q.toString()}`, { signal });
}

/** POST /api/payroll/bonuses/ — add a one-off bonus. */
export function createBonus(data: BonusWriteData): Promise<PayrollBonus> {
  return apiRequest<PayrollBonus>("/payroll/bonuses/", {
    method: "POST",
    body: data,
  });
}

/** DELETE /api/payroll/bonuses/<id>/ — remove a bonus. */
export function deleteBonus(id: number): Promise<void> {
  return apiRequest<void>(`/payroll/bonuses/${id}/`, { method: "DELETE" });
}

/** GET /api/payroll/employees/<id>/details/ — employee's per-day breakdown.

 * branchId — тот же филиальный срез, что и в месячном отчёте.
 */
export function getEmployeeDailyDetails(
  employeeId: number,
  params: {
    year?: number;
    month?: number;
    organizationId?: number;
    branchId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<EmployeeDailyDetailRow[]> {
  const q = new URLSearchParams();
  if (params.year != null) q.set("year", String(params.year));
  if (params.month != null) q.set("month", String(params.month));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<EmployeeDailyDetailRow[]>(
    `/payroll/employees/${employeeId}/details/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
