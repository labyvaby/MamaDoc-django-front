import { apiRequest } from "./client";

// ── Types (mirror server/apps/reports/api/payloads.py LoadAnalyticsPayload) ────

export interface HourPoint {
  hour: number; // 0..23
  count: number;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface HeatCell {
  weekday: number; // Mon=0 .. Sun=6
  hour: number;
  count: number;
}

export interface EmployeeLoad {
  employeeId: number;
  fullName: string;
  appointments: number;
  hours: string; // decimal-safe string (worked hours from attendance)
}

export interface LoadKpi {
  total: number;
  peakHour: number | null;
  peakCount: number;
  avgDaily: number;
  busiestWeekday: number | null;
  busiestWeekdayAvg: number;
  prevTotal: number;
  deltaPct: number | null;
}

export interface LoadAnalytics {
  dateFrom: string;
  dateTo: string;
  organizationId: number | null;
  hourly: HourPoint[];
  daily: DayPoint[];
  heatmap: HeatCell[];
  byEmployee: EmployeeLoad[];
  kpi: LoadKpi;
}

export interface LoadParams {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  branchId?: number;
  employeeIds?: number[];
  organizationId?: number;
}

// ── API ────────────────────────────────────────────────────────────────────────

export function getLoadAnalytics(
  params: LoadParams = {},
  signal?: AbortSignal,
): Promise<LoadAnalytics> {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.employeeIds && params.employeeIds.length > 0) {
    q.set("employeeIds", params.employeeIds.join(","));
  }
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<LoadAnalytics>(`/reports/load/${qs ? `?${qs}` : ""}`, { signal });
}
