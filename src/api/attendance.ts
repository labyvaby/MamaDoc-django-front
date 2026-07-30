import { apiRequest } from "./client";

/**
 * Суперпользователю/мультиорг-аккаунту бэк требует явный query-параметр
 * organizationId на всех эндпоинтах attendance (иначе 400 "Суперпользователю
 * необходимо указать organizationId") — тот же контракт, что и у tasks/warehouse.
 */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface WorkShiftRow {
  id: number;
  employeeId: number;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  isNightShift: boolean;
  hasLunch: boolean;
  lunchMinutes: number;
  lunchStart: string | null;
  durationSeconds: number | null;
  dayHours: string;
  nightHours: string;
  isAnomalous: boolean;
  createdAt: string;
}

export interface ActiveShiftResponse {
  shift: WorkShiftRow | null;
}

export interface BranchOfficeIp {
  branchId: number;
  branchName: string;
  officeIp: string;
  updatedAt: string | null;
}

export interface OfficeIp {
  /** Общий IP организации (дефолт, если у филиала нет своего). */
  officeIp: string;
  updatedAt: string | null;
  /** Wi-Fi IP по каждому активному филиалу. */
  branches: BranchOfficeIp[];
}

export interface ShiftWriteData {
  employeeId?: number;
  clockIn: string;
  clockOut?: string | null;
  isNightShift?: boolean | null;
  hasLunch?: boolean;
  lunchStart?: string | null;
}

export interface ShiftListParams {
  employeeId?: number | "me";
  dateFrom?: string;
  dateTo?: string;
}

// ── API functions — shifts ────────────────────────────────────────────────────

/** GET /api/attendance/shifts/ — history (own, or all when caller can manage). */
export function getShifts(
  params: ShiftListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<WorkShiftRow[]> {
  const q = new URLSearchParams();
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  const qs = q.toString();
  return apiRequest<WorkShiftRow[]>(
    withOrg(`/attendance/shifts/${qs ? `?${qs}` : ""}`, organizationId),
    { signal },
  ).then((rows) => (Array.isArray(rows) ? rows : []));
}

/** GET /api/attendance/shifts/active/ — the caller's open shift (or null). */
export function getActiveShift(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<ActiveShiftResponse> {
  return apiRequest<ActiveShiftResponse>(
    withOrg("/attendance/shifts/active/", organizationId),
    { signal },
  );
}

/** POST /api/attendance/shifts/clock-in/ — open the caller's shift. */
export function clockIn(organizationId?: number): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(withOrg("/attendance/shifts/clock-in/", organizationId), {
    method: "POST",
    body: {},
  });
}

/** POST /api/attendance/shifts/clock-out/ — close the caller's shift. */
export function clockOut(organizationId?: number): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(withOrg("/attendance/shifts/clock-out/", organizationId), {
    method: "POST",
    body: {},
  });
}

/** POST /api/attendance/shifts/ — manual shift creation (admin). */
export function createShift(
  data: ShiftWriteData,
  organizationId?: number,
): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(withOrg("/attendance/shifts/", organizationId), {
    method: "POST",
    body: data,
  });
}

/** PATCH /api/attendance/shifts/<id>/ — edit a shift (admin). */
export function updateShift(
  id: number,
  data: ShiftWriteData,
  organizationId?: number,
): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(withOrg(`/attendance/shifts/${id}/`, organizationId), {
    method: "PATCH",
    body: data,
  });
}

/** DELETE /api/attendance/shifts/<id>/ — delete a shift (admin). */
export function deleteShift(id: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/attendance/shifts/${id}/`, organizationId), {
    method: "DELETE",
  });
}

// ── API functions — office IP ──────────────────────────────────────────────────

/** GET /api/attendance/office-ip/ — the org's configured office IP. */
export function getOfficeIp(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<OfficeIp> {
  return apiRequest<OfficeIp>(withOrg("/attendance/office-ip/", organizationId), { signal });
}

/**
 * PATCH /api/attendance/office-ip/ — set an office IP (admin).
 * Без branchId меняется общий IP организации, с branchId — IP филиала.
 */
export function setOfficeIp(
  officeIp: string,
  branchId?: number | null,
  organizationId?: number,
): Promise<OfficeIp> {
  return apiRequest<OfficeIp>(withOrg("/attendance/office-ip/", organizationId), {
    method: "PATCH",
    body: branchId != null ? { officeIp, branchId } : { officeIp },
  });
}
