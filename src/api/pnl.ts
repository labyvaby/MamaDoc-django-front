/**
 * Отчёт «Прибыли и убытки» — GET /api/v2/pnl/report/ (server/apps/pnl).
 * Деньги приходят строками с двумя знаками; расходные строки — положительными
 * числами, знак задают формулы формы №2 (спека §6).
 */
import { apiRequest } from "./client";

export type PnlLineKind = "group" | "line" | "total";

export interface PnlMonth {
  /** "YYYY-MM" */
  key: string;
  /** Месяц не закончился — зарплата за него появится после выплаты. */
  open: boolean;
}

export interface PnlDetail {
  key: string;
  title: string;
  months: Record<string, string>;
  total: string;
  categoryId: number | null;
  /** "advance" / "salary" — из них собирается столбик «Зарплата и аванс». */
  categoryKind: string | null;
}

export interface PnlLine {
  /** Код строки формы №2: "010" … "200". */
  code: string;
  key: string;
  title: string;
  kind: PnlLineKind;
  months: Record<string, string>;
  total: string;
  children: PnlDetail[];
}

export interface PnlCompare {
  dateFrom: string;
  dateTo: string;
  totals: Record<string, string>;
}

export interface PnlWarning {
  code: "products_without_cost" | "org_level_excluded" | (string & {});
  count: number | null;
  amount: string | null;
}

export interface PnlReport {
  dateFrom: string;
  dateTo: string;
  branchId: number | null;
  months: PnlMonth[];
  lines: PnlLine[];
  compare: PnlCompare | null;
  warnings: PnlWarning[];
}

export interface PnlParams {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  organizationId?: number;
  compare?: boolean;
}

export function buildPnlQuery(params: PnlParams): string {
  const q = new URLSearchParams();
  q.set("dateFrom", params.dateFrom);
  q.set("dateTo", params.dateTo);
  if (params.compare) q.set("compare", "1");
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return q.toString();
}

export function getPnlReport(params: PnlParams, signal?: AbortSignal): Promise<PnlReport> {
  return apiRequest<PnlReport>(`/v2/pnl/report/?${buildPnlQuery(params)}`, { signal });
}
