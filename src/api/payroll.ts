import { apiRequest } from "./client";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PayrollRow {
  employeeId: number;
  fullName: string;
  clinicalRole: string;
  appointmentsCount: number;
  servicePercentPay: string;
  serviceFixedPay: string;
  appointmentPay: string;
  earnings: string;
  advances: string;
  netSalary: string;
}

export interface PayrollReport {
  year: number;
  month: number;
  organizationId: number;
  totalNet: string;
  rows: PayrollRow[];
}

export interface ServiceRate {
  serviceId: number;
  serviceName: string;
  percent: string;
  fixedAmount: string;
}

export interface EmployeeRule {
  employeeId: number;
  employeeFullName: string;
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  isActive: boolean;
  serviceRates: ServiceRate[];
}

export interface RuleWriteData {
  appointmentRate?: string | number;
  dayHourlyRate?: string | number;
  nightHourlyRate?: string | number;
  isActive?: boolean;
  serviceRates?: {
    serviceId: number;
    percent: string | number;
    fixedAmount: string | number;
  }[];
}

// ── API functions ─────────────────────────────────────────────────────────────

/** GET /api/payroll/report/ — monthly per-employee salary report (org-wide). */
export function getPayrollReport(
  params: { year?: number; month?: number; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<PayrollReport> {
  const q = new URLSearchParams();
  if (params.year != null) q.set("year", String(params.year));
  if (params.month != null) q.set("month", String(params.month));
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<PayrollReport>(`/payroll/report/${qs ? `?${qs}` : ""}`, { signal });
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
