import { apiRequest } from "./client";
import type { PayrollMonthSettings } from "../features/payroll/types";

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
   * Заработок с личных товарных продаж: в приёмах и POS (% от суммы +
   * фикс-бонус за единицу). Включён в `earnings`/`netSalary`.
   * May be absent on older backends — treat undefined as "0.00".
   */
  productPay?: string;
  /**
   * Заработок с подтверждённых уборок за месяц (Σ ставок типов). Включён в
   * `earnings`/`netSalary` (контракт cleaning, guide §5). Отдельно дёргать не
   * нужно. May be absent on older backends — treat undefined as "0.00".
   */
  cleaningEarnings?: string;
  /**
   * Карточка ЗП (05.10.2026): комиссия за выигранные сделки, свои поля
   * организации и налоги. Всё уже внутри `earnings`/`netSalary`:
   * «на руки» = начислено − ПН − Соцфонд работника − удержания − авансы.
   * Соцфонд работодателя — сверху, из «на руки» не вычитается.
   * May be absent on older backends — treat undefined as "0.00".
   */
  dealPay?: string;
  dealsWonCount?: number;
  dealsWonAmount?: string;
  customAccruals?: string;
  customDeductions?: string;
  /** "" — профиля нет; иначе employment | civil | patent | unofficial. */
  taxRegime?: string;
  taxBase?: string;
  incomeTax?: string;
  socialFundEmployee?: string;
  socialFundEmployer?: string;
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
  /**
   * Доля распределённых приёмов за этот день (дробная: приём делится между
   * регистраторами смены). С 05.08.2026 бэк раскладывает месячную
   * распределяемую часть по датам — раньше здесь всегда лежал "0.00"; сумма по
   * дням сходится с месячным отчётом с точностью до округления.
   */
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
  settings: PayrollMonthSettings;
}

export interface PayrollActiveMonths {
  /** Newest-first month keys that contain payroll activity. */
  months: string[];
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
  /** Процент с личных товарных продаж: в приёмах и POS. */
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

 * branchId — аналитический срез по филиалу, включая смены, привязанные к
 * этому филиалу. Без branchId — полный org-wide расчёт, участвующий в
 * заморозке.
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

/** GET /api/payroll/active-months/ — months with actual payroll activity. */
export function getPayrollActiveMonths(
  params: {
    organizationId?: number;
    branchId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<PayrollActiveMonths> {
  const q = new URLSearchParams();
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  const qs = q.toString();
  return apiRequest<PayrollActiveMonths>(
    `/payroll/active-months/${qs ? `?${qs}` : ""}`,
    { signal },
  );
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
  settings: PayrollMonthSettings,
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
  branchId: number | null;
  branchName: string | null;
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
  branchId: number;
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
    branchId?: number;
  },
  signal?: AbortSignal,
): Promise<PayrollBonus[]> {
  const q = new URLSearchParams();
  q.set("year", String(params.year));
  q.set("month", String(params.month));
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.branchId != null) q.set("branchId", String(params.branchId));
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

// ── Карточка ЗП сотрудника (v2) ─────────────────────────────────────────────
// Надмножество v1-правил: ставки + сделки + налоги + свои поля организации.
// Сохраняется по разделам (PATCH), у каждого раздела своё право; что можно
// менять, бэк отдаёт в `access`, а по своим полям — в `fields[].canEdit`.

export type TaxRegime = "unofficial" | "employment" | "civil" | "patent";
export type TaxBaseMode = "official" | "earnings";
export type PayrollFieldKind = "accrual" | "deduction";
export type PayrollFieldValueType = "amount" | "percent";

export interface DealRate {
  pipelineId: number;
  pipelineName: string;
  percent: string;
  fixedAmount: string;
}

export interface SalaryCardRates {
  appointmentRate: string;
  dayHourlyRate: string;
  nightHourlyRate: string;
  productPercent: string;
  productFixedAmount: string;
  dealPercent: string;
  dealFixedAmount: string;
  serviceRates: ServiceRate[];
  productRates: ProductRate[];
  dealRates: DealRate[];
}

export interface SalaryCardTax {
  regime: TaxRegime;
  taxBase: TaxBaseMode;
  officialSalary: string;
}

export interface SalaryCardField {
  id: number;
  name: string;
  kind: PayrollFieldKind;
  valueType: PayrollFieldValueType;
  value: string;
  canEdit: boolean;
}

export interface TaxRates {
  incomeTax: string;
  socialEmployee: string;
  socialEmployer: string;
}

export interface TaxSettings {
  standardDeduction: string;
  employment: TaxRates;
  civil: TaxRates;
}

export interface SalaryCardAccess {
  /** Своя карточка по payroll.view_own — только просмотр. */
  readOnly: boolean;
  canEditRates: boolean;
  canEditTax: boolean;
  canManageFields: boolean;
  canManageTaxSettings: boolean;
}

export interface SalaryCard {
  employeeId: number;
  employeeFullName: string;
  rates: SalaryCardRates;
  tax: SalaryCardTax;
  fields: SalaryCardField[];
  taxSettings: TaxSettings;
  pipelines: { id: number; name: string }[];
  access: SalaryCardAccess;
}

type RateLineWrite = {
  percent: string | number;
  fixedAmount: string | number;
  serviceId?: number;
  productId?: number;
  pipelineId?: number;
};

export interface SalaryCardPatch {
  rates?: {
    appointmentRate: string | number;
    dayHourlyRate: string | number;
    nightHourlyRate: string | number;
    productPercent: string | number;
    productFixedAmount: string | number;
    dealPercent: string | number;
    dealFixedAmount: string | number;
    serviceRates: RateLineWrite[];
    productRates: RateLineWrite[];
    dealRates: RateLineWrite[];
  };
  tax?: {
    regime: TaxRegime;
    taxBase: TaxBaseMode;
    officialSalary: string | number;
  };
  fieldValues?: { fieldId: number; value: string | number }[];
}

export interface PayrollCustomField {
  id: number;
  name: string;
  kind: PayrollFieldKind;
  valueType: PayrollFieldValueType;
  viewRoleIds: number[];
  editRoleIds: number[];
  sortOrder: number;
  /** У скольких сотрудников заполнено — для подтверждения удаления. */
  valuesCount: number;
}

export interface PayrollFieldsResponse {
  fields: PayrollCustomField[];
  roles: { id: number; name: string }[];
}

export interface PayrollFieldWrite {
  name?: string;
  kind?: PayrollFieldKind;
  valueType?: PayrollFieldValueType;
  viewRoleIds?: number[];
  editRoleIds?: number[];
  sortOrder?: number;
}

const PAYROLL_V2 = "/v2/payroll";

const orgHeaders = (organizationId?: number | null): Record<string, string> =>
  organizationId != null ? { "X-Organization-Id": String(organizationId) } : {};

/** GET /api/v2/payroll/employees/<id>/salary-card/ */
export function getSalaryCard(
  employeeId: number,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<SalaryCard> {
  return apiRequest<SalaryCard>(
    `${PAYROLL_V2}/employees/${employeeId}/salary-card/`,
    { headers: orgHeaders(organizationId), signal },
  );
}

/** PATCH /api/v2/payroll/employees/<id>/salary-card/ — только присланные разделы. */
export function patchSalaryCard(
  employeeId: number,
  body: SalaryCardPatch,
  organizationId?: number | null,
): Promise<SalaryCard> {
  return apiRequest<SalaryCard>(
    `${PAYROLL_V2}/employees/${employeeId}/salary-card/`,
    { method: "PATCH", body, headers: orgHeaders(organizationId) },
  );
}

/** PATCH /api/v2/payroll/tax-settings/ — ставки налогов организации. */
export function patchTaxSettings(
  body: Partial<TaxSettings>,
  organizationId?: number | null,
): Promise<TaxSettings> {
  return apiRequest<TaxSettings>(`${PAYROLL_V2}/tax-settings/`, {
    method: "PATCH",
    body,
    headers: orgHeaders(organizationId),
  });
}

/** GET /api/v2/payroll/fields/ — свои поля + роли организации (payroll.fields.manage). */
export function getPayrollFields(
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<PayrollFieldsResponse> {
  return apiRequest<PayrollFieldsResponse>(`${PAYROLL_V2}/fields/`, {
    headers: orgHeaders(organizationId),
    signal,
  });
}

export function createPayrollField(
  body: PayrollFieldWrite,
  organizationId?: number | null,
): Promise<PayrollCustomField> {
  return apiRequest<PayrollCustomField>(`${PAYROLL_V2}/fields/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

/** PATCH — вид и тип значения после создания не меняются. */
export function updatePayrollField(
  id: number,
  body: Omit<PayrollFieldWrite, "kind" | "valueType">,
  organizationId?: number | null,
): Promise<PayrollCustomField> {
  return apiRequest<PayrollCustomField>(`${PAYROLL_V2}/fields/${id}/`, {
    method: "PATCH",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function deletePayrollField(
  id: number,
  organizationId?: number | null,
): Promise<void> {
  return apiRequest<void>(`${PAYROLL_V2}/fields/${id}/`, {
    method: "DELETE",
    headers: orgHeaders(organizationId),
  });
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
