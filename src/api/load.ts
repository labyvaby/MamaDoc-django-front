import { apiRequest } from "./client";

// ── Types (mirror server/apps/reports/api/payloads.py LoadAnalyticsPayload) ────

export interface HourPoint {
  hour: number; // 0..23
  count: number;
  scheduleMinutes: number; // shift minutes in this hour of day (all days, all staff)
  busyMinutes: number; // busy minutes inside those shifts
  outsideMinutes: number; // busy minutes outside shifts (staff with shifts in the period)
  scheduleSlots: number; // booking-grid slots of the shifts, as in «Окна»
  busySlots: number; // of them taken by appointments
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  count: number;
  scheduleMinutes: number;
  busyMinutes: number;
  outsideMinutes: number;
  scheduleSlots: number;
  busySlots: number;
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
  scheduleMinutes: number; // shift minutes by schedule
  busyMinutes: number; // busy minutes inside shifts
  outsideMinutes: number; // busy minutes outside shifts
  scheduleSlots: number;
  busySlots: number;
  utilizationPct: number | null; // 0..100, null without schedule
  attendanceUtilizationPct: number | null; // busy inside attendance ÷ worked, null without attendance
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
  scheduleMinutes: number;
  busyMinutes: number;
  outsideMinutes: number; // only staff who have shifts in the period
  scheduleSlots: number;
  busySlots: number;
  utilizationPct: number | null;
  attendanceUtilizationPct: number | null;
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
  /** Earliest shift start / latest shift end, minutes from local midnight; null — no shifts. */
  scheduleSpan?: { startMinute: number; endMinute: number } | null;
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
