import { apiRequest } from "./client";

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
  /** Публичный IP текущего пользователя, определённый нашим сервером. */
  currentIp: string;
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
  organizationId?: number;
}

export interface AttendanceScope {
  organizationId?: number;
}

export interface OfficeIpWriteOptions extends AttendanceScope {
  branchId?: number | null;
}

function withOrganizationId(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}organizationId=${encodeURIComponent(String(organizationId))}`;
}

// ── API functions — shifts ────────────────────────────────────────────────────

/** GET /api/attendance/shifts/ — history (own, or all when caller can manage). */
export function getShifts(
  params: ShiftListParams = {},
  signal?: AbortSignal,
): Promise<WorkShiftRow[]> {
  const q = new URLSearchParams();
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.organizationId != null) {
    q.set("organizationId", String(params.organizationId));
  }
  const qs = q.toString();
  return apiRequest<WorkShiftRow[]>(
    `/attendance/shifts/${qs ? `?${qs}` : ""}`,
    { signal },
  ).then((rows) => (Array.isArray(rows) ? rows : []));
}

/** GET /api/attendance/shifts/active/ — the caller's open shift (or null). */
export function getActiveShift(
  scope: AttendanceScope = {},
  signal?: AbortSignal,
): Promise<ActiveShiftResponse> {
  return apiRequest<ActiveShiftResponse>(
    withOrganizationId("/attendance/shifts/active/", scope.organizationId),
    { signal },
  );
}

/** POST /api/attendance/shifts/clock-in/ — open the caller's shift. */
export function clockIn(scope: AttendanceScope = {}): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(
    withOrganizationId("/attendance/shifts/clock-in/", scope.organizationId),
    {
      method: "POST",
      body: {},
    },
  );
}

/** POST /api/attendance/shifts/clock-out/ — close the caller's shift. */
export function clockOut(scope: AttendanceScope = {}): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(
    withOrganizationId("/attendance/shifts/clock-out/", scope.organizationId),
    {
      method: "POST",
      body: {},
    },
  );
}

/** POST /api/attendance/shifts/ — manual shift creation (admin). */
export function createShift(
  data: ShiftWriteData,
  scope: AttendanceScope = {},
): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(
    withOrganizationId("/attendance/shifts/", scope.organizationId),
    {
      method: "POST",
      body: data,
    },
  );
}

/** PATCH /api/attendance/shifts/<id>/ — edit a shift (admin). */
export function updateShift(
  id: number,
  data: ShiftWriteData,
  scope: AttendanceScope = {},
): Promise<WorkShiftRow> {
  return apiRequest<WorkShiftRow>(
    withOrganizationId(`/attendance/shifts/${id}/`, scope.organizationId),
    {
      method: "PATCH",
      body: data,
    },
  );
}

/** DELETE /api/attendance/shifts/<id>/ — delete a shift (admin). */
export function deleteShift(
  id: number,
  scope: AttendanceScope = {},
): Promise<void> {
  return apiRequest<void>(
    withOrganizationId(`/attendance/shifts/${id}/`, scope.organizationId),
    { method: "DELETE" },
  );
}

// ── API functions — office IP ──────────────────────────────────────────────────

/** GET /api/attendance/office-ip/ — the org's configured office IP. */
export function getOfficeIp(
  scope: AttendanceScope = {},
  signal?: AbortSignal,
): Promise<OfficeIp> {
  return apiRequest<OfficeIp>(
    withOrganizationId("/attendance/office-ip/", scope.organizationId),
    { signal },
  );
}

/**
 * PATCH /api/attendance/office-ip/ — set an office IP (admin).
 * Без branchId меняется общий IP организации, с branchId — IP филиала.
 */
export function setOfficeIp(
  officeIp: string,
  options: OfficeIpWriteOptions = {},
): Promise<OfficeIp> {
  return apiRequest<OfficeIp>(
    withOrganizationId("/attendance/office-ip/", options.organizationId),
    {
      method: "PATCH",
      body:
        options.branchId != null
          ? { officeIp, branchId: options.branchId }
          : { officeIp },
    },
  );
}
