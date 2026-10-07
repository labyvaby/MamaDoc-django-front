import { ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Зарплата застройщика (AIVIO, группа «Персонал»): ведомость месяца по
 * табелю, оклад, премии из мотивации, налоги КР, приказ в ЭДО, выплата —
 * `/api/v2/salary`.
 *
 * Контракт — гайд бэка `frontend-hr-ops.md` §3 (05.10.2026).
 * - нет ведомости месяца → `GET /runs/<month>/` = 404, тогда прогноз
 *   `GET /preview/?month=`; месяц по умолчанию — прошлый;
 * - смотреть — `salary.view`; «Рассчитать / Пересчитать / Утвердить / В банк» —
 *   `salary.manage`. ⚠ Открытый вопрос бэка №2: это право есть и у продажника
 *   (от мотивации), поэтому кнопки фронт дополнительно гейтит уровнем
 *   `payroll` ∈ {edit, approve} из `roles-matrix/me` (как просит гайд);
 * - приказ, плановые выплаты и расход в кассе делает сервер.
 *
 * Не МамаДок-расчёт `/api/payroll/report/` (клиника) — другой модуль.
 */

const API = "/v2/salary";

export interface PayrollTotals {
  salary: number;
  base: number;
  bonus: number;
  gross: number;
  tax: number;
  social: number;
  employer: number;
  net: number;
  taxes: number;
  employeesCount: number;
  bonusCount: number;
}

export interface PayrollRow {
  employeeId: number;
  employeeName: string;
  position: string;
  deptName: string;
  salary: number;
  days: number;
  worked: number;
  vac: number;
  sick: number;
  base: number;
  bonus: number;
  gross: number;
  tax: number;
  social: number;
  employer: number;
  net: number;
}

export interface PayrollRun {
  /** `null` — прогноз (ведомости ещё нет). */
  id: number | null;
  month: string;
  monthLabel: string;
  /** `calculated` → `approved` → `paid`; у прогноза — `preview`. */
  status: string;
  statusLabel: string;
  createdAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  orderNumber: string;
  orderDocumentId: number | null;
  timesheetClosed: boolean;
  timesheetClosedAt: string | null;
  totals: PayrollTotals;
  byDepartment: { name: string; amount: number }[];
  rows: PayrollRow[];
}

export interface Payslip extends PayrollRow {
  name: string;
  organizationName: string;
  email: string;
  month: string;
  monthLabel: string;
  /** `payroll` — из ведомости, `preview` — расчёт «на лету». */
  source: string;
  runId: number | null;
  payrollStatus: string;
  orderNumber: string;
  withheld: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);

const fromRawTotals = (raw: any): PayrollTotals => ({
  salary: num(raw?.salary),
  base: num(raw?.base),
  bonus: num(raw?.bonus),
  gross: num(raw?.gross),
  tax: num(raw?.tax),
  social: num(raw?.social),
  employer: num(raw?.employer),
  net: num(raw?.net),
  taxes: num(raw?.taxes),
  employeesCount: num(raw?.employeesCount),
  bonusCount: num(raw?.bonusCount),
});

const fromRawRow = (raw: any): PayrollRow => ({
  employeeId: raw.employeeId,
  employeeName: str(raw.employeeName ?? raw.name),
  position: str(raw.position),
  deptName: str(raw.deptName),
  salary: num(raw.salary),
  days: num(raw.days),
  worked: num(raw.worked),
  vac: num(raw.vac),
  sick: num(raw.sick),
  base: num(raw.base),
  bonus: num(raw.bonus),
  gross: num(raw.gross),
  tax: num(raw.tax),
  social: num(raw.social),
  employer: num(raw.employer),
  net: num(raw.net),
});

export const fromRawRun = (raw: any, preview = false): PayrollRun => ({
  id: preview ? null : (raw?.id ?? raw?.runId ?? null),
  month: str(raw?.month),
  monthLabel: str(raw?.monthLabel),
  status: preview ? "preview" : str(raw?.status),
  statusLabel: str(raw?.statusLabel),
  createdAt: raw?.createdAt ?? null,
  approvedAt: raw?.approvedAt ?? null,
  paidAt: raw?.paidAt ?? null,
  orderNumber: str(raw?.orderNumber),
  orderDocumentId: raw?.orderDocumentId ?? null,
  timesheetClosed: Boolean(raw?.timesheetClosed),
  timesheetClosedAt: raw?.timesheetClosedAt ?? null,
  totals: fromRawTotals(raw?.totals),
  byDepartment: list(raw?.byDepartment).map((d) => ({ name: str(d.name), amount: num(d.amount) })),
  rows: list(raw?.rows).map(fromRawRow),
});

export const fromRawPayslip = (raw: any): Payslip => ({
  ...fromRawRow(raw),
  employeeName: str(raw?.name ?? raw?.employeeName),
  name: str(raw?.name ?? raw?.employeeName),
  organizationName: str(raw?.organizationName),
  email: str(raw?.email),
  month: str(raw?.month),
  monthLabel: str(raw?.monthLabel),
  source: str(raw?.source),
  runId: raw?.runId ?? null,
  payrollStatus: str(raw?.payrollStatus),
  orderNumber: str(raw?.orderNumber),
  withheld: num(raw?.withheld),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const salary = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });

/** Ведомость месяца; нет ведомости (404) — прогноз из `/preview/`. */
export async function getPayroll(month: string, scope?: RealtyScope, signal?: AbortSignal): Promise<PayrollRun> {
  try {
    return fromRawRun(await salary(scope, `/runs/${month}/`, { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return fromRawRun(await salary(scope, `/preview/?month=${month}`, { signal }), true);
    throw error;
  }
}

/** Бейдж «!» в меню: есть рассчитанная или утверждённая, но не выплаченная ведомость. */
export async function hasPendingPayroll(scope?: RealtyScope, signal?: AbortSignal): Promise<boolean> {
  const [calculated, approved] = await Promise.all([salary(scope, "/runs/?status=calculated", { signal }), salary(scope, "/runs/?status=approved", { signal })]);
  return list(calculated).length > 0 || list(approved).length > 0;
}

export async function getPayslip(employeeId: number, month: string, scope?: RealtyScope, signal?: AbortSignal): Promise<Payslip> {
  return fromRawPayslip(await salary(scope, `/payslip/${employeeId}/?month=${month}`, { signal }));
}

export type PayrollAction = "calculate" | "recalculate" | "approve" | "pay";

export async function runPayrollAction(month: string, action: PayrollAction, scope?: RealtyScope): Promise<PayrollRun> {
  const raw = action === "calculate" ? await salary(scope, "/runs/", { method: "POST", body: { month } }) : await salary(scope, `/runs/${month}/${action}/`, { method: "POST", body: {} });
  return fromRawRun(raw);
}

/** Какая кнопка ведомости доступна по статусу (гайд §3 «Действия»). */
export function payrollActions(status: string): PayrollAction[] {
  switch (status) {
    case "preview":
      return ["calculate"];
    case "calculated":
      return ["recalculate", "approve"];
    case "approved":
      return ["pay"];
    default:
      return [];
  }
}

/** Прошлый месяц `YYYY-MM` — месяц ведомости по умолчанию (как в макете). */
export function previousMonth(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const payrollKeys = {
  all: ["django", "salary", "payroll"] as const,
  run: (scope: RealtyScope | undefined, month: string) => [...payrollKeys.all, ...scopeKey(scope), "run", month] as const,
  pending: (scope: RealtyScope | undefined) => [...payrollKeys.all, ...scopeKey(scope), "pending"] as const,
  payslip: (scope: RealtyScope | undefined, employeeId: number, month: string) => [...payrollKeys.all, ...scopeKey(scope), "payslip", employeeId, month] as const,
};
