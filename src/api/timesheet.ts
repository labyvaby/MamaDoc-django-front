import { apiRequest } from "./client";

/**
 * Табель — /api/v2/attendance/timesheet/…
 *
 * Ячейка считается на бэке: смена СКУД → «Я» с часами, выходной по графику →
 * «В», отпуск из расписания → «О», праздник → «П»; ручная отметка перекрывает
 * всё это. Пустые поля ячейки бэк не присылает (omit_defaults), поэтому все
 * поля ячейки, кроме `day`, опциональны.
 *
 * Организация запроса — заголовком `X-Organization-Id`, филиал — из сессии
 * (в режиме «вся организация» можно сузить `branchId`).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type TimesheetCategory = "work" | "rest" | "leave" | "absence";
export type TimesheetCellSource = "manual" | "skud" | "appointments" | "schedule" | "holiday";
export type TimesheetCellState = "missing" | "pending" | "planned";
export type TimesheetCellFlag = "holiday" | "open" | "anomalous" | "comment" | "request" | "visits_outside";

/** Приёмы сотрудника за день: первый, последний и сколько (без отмен и неявок). */
export interface TimesheetCellVisits {
  start: string;
  end: string;
  count: number;
}
export type TimesheetRequestStatus = "pending" | "approved" | "rejected" | "canceled";

export interface TimesheetAccess {
  viewAll: boolean;
  viewOwn: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  fillSchedule: boolean;
  approve: boolean;
  close: boolean;
  reopen: boolean;
  export: boolean;
  settings: boolean;
}

export interface TimesheetCode {
  /** `presence` / `day_off` / … или `custom:<id>` для своих отметок. */
  key: string;
  letter: string;
  name: string;
  color: string;
  category: TimesheetCategory;
  isPaid: boolean;
  blocksBooking: boolean;
  isSystem: boolean;
  /** false — код выводится сам (праздник), вручную его не ставят. */
  markable: boolean;
  isActive: boolean;
  id: number | null;
}

export interface TimesheetHoliday {
  id: number;
  date: string;
  name: string;
}

export interface TimesheetSettings {
  holidayPayPercent: number;
  toleranceMinutes: number;
}

export interface TimesheetDay {
  date: string;
  day: number;
  /** 0 = понедельник … 6 = воскресенье. */
  weekday: number;
  isWeekend: boolean;
  isToday: boolean;
  holiday?: string | null;
}

export interface TimesheetCell {
  day: number;
  code?: string | null;
  source?: TimesheetCellSource | null;
  state?: TimesheetCellState | null;
  hours?: string | null;
  nightHours?: string | null;
  plannedHours?: string | null;
  skudHours?: string | null;
  overtimeMinutes?: number;
  earlyMinutes?: number;
  flags?: TimesheetCellFlag[];
  visits?: TimesheetCellVisits | null;
}

export interface TimesheetTotals {
  workedDays: number;
  hours: string;
  nightHours: string;
  overtimeHours: string;
  earlyLeaves: number;
  vacationDays: number;
  sickDays: number;
  tripDays: number;
  leaveDays: number;
  absenceDays: number;
  restDays: number;
  missingDays: number;
  plannedDays: number;
  plannedHours: string;
  holidayHours: string;
  codes: Record<string, number>;
}

export interface TimesheetEmployee {
  id: number;
  fullName: string;
  photoUrl: string | null;
  roleName: string;
  specializations: string[];
  branchId: number | null;
  branchName: string | null;
  status: string;
  writeBranchId: number | null;
  locked: boolean;
}

export interface TimesheetRow {
  employee: TimesheetEmployee;
  cells: TimesheetCell[];
  totals: TimesheetTotals;
}

export interface TimesheetDayStat {
  day: number;
  present: number;
  onShift: number;
  leave: number;
  absent: number;
  missing: number;
  planned: number;
  hours: string;
}

export interface TimesheetSummary {
  employees: number;
  workedDays: number;
  hours: string;
  nightHours: string;
  overtimeHours: string;
  earlyLeaves: number;
  vacationDays: number;
  sickDays: number;
  tripDays: number;
  leaveDays: number;
  absenceDays: number;
  missingDays: number;
  plannedDays: number;
  filledPercent: number;
  holidayHours: string;
  today: { present: number; onShift: number; expected: number; leave: number } | null;
}

export interface TimesheetClosure {
  branchId: number | null;
  branchName: string | null;
  closedAt: string;
  closedByName: string;
}

export interface TimesheetGrid {
  month: string;
  today: string;
  scope: {
    organizationId: number;
    branchId: number | null;
    branchName: string | null;
    callerEmployeeId: number | null;
  };
  access: TimesheetAccess;
  settings: TimesheetSettings;
  codes: TimesheetCode[];
  holidays: TimesheetHoliday[];
  days: TimesheetDay[];
  rows: TimesheetRow[];
  daily: TimesheetDayStat[];
  summary: TimesheetSummary;
  closures: TimesheetClosure[];
  closed: boolean;
  pendingRequests: number;
  total: number;
  limit: number;
  offset: number;
}

export interface TimesheetShift {
  id: number;
  clockIn: string;
  clockOut: string | null;
  dayHours: string;
  nightHours: string;
  branchId: number | null;
  branchName: string | null;
  hasLunch: boolean;
  isAnomalous: boolean;
}

export interface TimesheetMark {
  code: string;
  dayHours: string;
  nightHours: string;
  comment: string;
  source: "manual" | "schedule" | "request";
  branchId: number | null;
  closesBooking: boolean;
  updatedAt: string;
}

export interface TimesheetRevision {
  id: number;
  action: "created" | "updated" | "deleted";
  source: "manual" | "schedule" | "request";
  before: Record<string, string> | null;
  after: Record<string, string> | null;
  actorName: string;
  createdAt: string;
}

export interface TimesheetRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  code: string;
  startTime: string | null;
  endTime: string | null;
  requestedHours: string;
  reason: string;
  status: TimesheetRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string;
  reviewComment: string;
}

export interface TimesheetCellDetail {
  employee: TimesheetEmployee;
  date: string;
  cell: TimesheetCell;
  shifts: TimesheetShift[];
  plan: { start: string; end: string }[];
  plannedHours: string;
  plannedDayHours: string;
  plannedNightHours: string;
  holiday: string | null;
  mark: TimesheetMark | null;
  revisions: TimesheetRevision[];
  requests: TimesheetRequest[];
  locked: boolean;
}

export interface TimesheetMy {
  month: string;
  today: string;
  access: TimesheetAccess;
  codes: TimesheetCode[];
  holidays: TimesheetHoliday[];
  days: TimesheetDay[];
  row: TimesheetRow | null;
  recent: { date: string; cell: TimesheetCell }[];
  requests: TimesheetRequest[];
  locked: boolean;
}

export interface TimesheetCellRef {
  employeeId: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface TimesheetMarkItem extends TimesheetCellRef {
  code: string;
  /** Не передано — бэк возьмёт часы сам (СКУД → график для «Я», иначе 0). */
  dayHours?: number | string | null;
  nightHours?: number | string | null;
  comment?: string | null;
}

export interface TimesheetMarksResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  skippedClosed: number;
  /** Ячейки, где отметка закрыла запись клиентов (О/Б/К и свои с флагом). */
  bookingClosed: TimesheetCellRef[];
  /** Пересчитанные строки затронутых сотрудников. */
  rows: TimesheetRow[];
}

export interface TimesheetClosuresResult {
  month: string;
  closures: TimesheetClosure[];
  closed: boolean;
}

export interface TimesheetGridParams {
  /** YYYY-MM */
  month: string;
  search?: string;
  specializationId?: number | null;
  roleId?: number | null;
  branchId?: number | null;
  limit?: number;
  offset?: number;
}

export interface TimesheetCodeWrite {
  letter?: string;
  name?: string;
  color?: string | null;
  category?: TimesheetCategory;
  isPaid?: boolean;
  blocksBooking?: boolean;
  isActive?: boolean;
  position?: number;
}

/** Коды ошибок табеля — ветвиться только по ним. */
export const TIMESHEET_ERROR = {
  closed: "TIMESHEET_CLOSED",
  requestExists: "REQUEST_EXISTS",
  requestNotPending: "REQUEST_NOT_PENDING",
  selfApproval: "SELF_APPROVAL",
  codeInUse: "CODE_IN_USE",
} as const;

/** Права страницы — по одному на действие (backend: timesheet/access.py). */
export const TIMESHEET_PERMISSIONS = {
  viewOwn: "timesheet.view_own",
  view: "timesheet.view",
  create: "timesheet.create",
  update: "timesheet.update",
  delete: "timesheet.delete",
  fillSchedule: "timesheet.fill_schedule",
  approve: "timesheet.approve",
  close: "timesheet.close",
  reopen: "timesheet.reopen",
  export: "timesheet.export",
  settings: "timesheet.settings.manage",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

const BASE = "/v2/attendance/timesheet";

const orgHeaders = (organizationId?: number | null): Record<string, string> =>
  organizationId != null ? { "X-Organization-Id": String(organizationId) } : {};

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

// ── Grid ────────────────────────────────────────────────────────────────────

/** GET /timesheet/ — сетка месяца: ячейки, итоги, статистика по дням. */
export function getTimesheet(
  params: TimesheetGridParams,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<TimesheetGrid> {
  return apiRequest<TimesheetGrid>(
    `${BASE}/${query({
      month: params.month,
      search: params.search?.trim(),
      specializationId: params.specializationId,
      roleId: params.roleId,
      branchId: params.branchId,
      limit: params.limit,
      offset: params.offset,
    })}`,
    { headers: orgHeaders(organizationId), signal },
  );
}

/** GET /timesheet/export/ — весь месяц без пагинации (журналируется). */
export function exportTimesheet(
  params: Omit<TimesheetGridParams, "limit" | "offset">,
  organizationId?: number | null,
): Promise<TimesheetGrid> {
  return apiRequest<TimesheetGrid>(
    `${BASE}/export/${query({
      month: params.month,
      search: params.search?.trim(),
      specializationId: params.specializationId,
      roleId: params.roleId,
      branchId: params.branchId,
    })}`,
    { headers: orgHeaders(organizationId) },
  );
}

/** GET /timesheet/my/ — свой месяц, полоса последних 30 дней, свои заявки. */
export function getMyTimesheet(
  month: string,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<TimesheetMy> {
  return apiRequest<TimesheetMy>(`${BASE}/my/${query({ month })}`, {
    headers: orgHeaders(organizationId),
    signal,
  });
}

/** GET /timesheet/cell/ — смены, план, отметка, история и заявки ячейки. */
export function getTimesheetCell(
  ref: TimesheetCellRef,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<TimesheetCellDetail> {
  return apiRequest<TimesheetCellDetail>(
    `${BASE}/cell/${query({ employeeId: ref.employeeId, date: ref.date })}`,
    { headers: orgHeaders(organizationId), signal },
  );
}

// ── Marks ───────────────────────────────────────────────────────────────────

/** POST /timesheet/marks/ — до 1000 ячеек одного месяца за раз. */
export function setTimesheetMarks(
  items: TimesheetMarkItem[],
  organizationId?: number | null,
): Promise<TimesheetMarksResult> {
  return apiRequest<TimesheetMarksResult>(`${BASE}/marks/`, {
    method: "POST",
    body: { items },
    headers: orgHeaders(organizationId),
  });
}

/** POST /timesheet/marks/clear/ — ячейки снова считаются автоматически. */
export function clearTimesheetMarks(
  cells: TimesheetCellRef[],
  organizationId?: number | null,
): Promise<TimesheetMarksResult> {
  return apiRequest<TimesheetMarksResult>(`${BASE}/marks/clear/`, {
    method: "POST",
    body: { cells },
    headers: orgHeaders(organizationId),
  });
}

/** POST /timesheet/fill-schedule/ — «Я» по графику там, где пусто. */
export function fillTimesheetBySchedule(
  body: { month: string; dateFrom?: string; dateTo?: string; employeeIds?: number[] },
  organizationId?: number | null,
): Promise<TimesheetMarksResult> {
  return apiRequest<TimesheetMarksResult>(`${BASE}/fill-schedule/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

// ── Month lock ──────────────────────────────────────────────────────────────

export function closeTimesheetMonth(
  month: string,
  organizationId?: number | null,
  branchId?: number | null,
): Promise<TimesheetClosuresResult> {
  return apiRequest<TimesheetClosuresResult>(`${BASE}/close/`, {
    method: "POST",
    body: branchId != null ? { month, branchId } : { month },
    headers: orgHeaders(organizationId),
  });
}

export function reopenTimesheetMonth(
  month: string,
  organizationId?: number | null,
  branchId?: number | null,
): Promise<TimesheetClosuresResult> {
  return apiRequest<TimesheetClosuresResult>(`${BASE}/reopen/`, {
    method: "POST",
    body: branchId != null ? { month, branchId } : { month },
    headers: orgHeaders(organizationId),
  });
}

// ── Correction requests ─────────────────────────────────────────────────────

export function getTimesheetRequests(
  params: { status?: TimesheetRequestStatus; month?: string },
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<{ items: TimesheetRequest[]; pending: number }> {
  return apiRequest<{ items: TimesheetRequest[]; pending: number }>(
    `${BASE}/requests/${query({ status: params.status, month: params.month })}`,
    { headers: orgHeaders(organizationId), signal },
  );
}

export function createTimesheetRequest(
  body: {
    date: string;
    reason: string;
    code?: string;
    startTime?: string | null;
    endTime?: string | null;
  },
  organizationId?: number | null,
): Promise<TimesheetRequest> {
  return apiRequest<TimesheetRequest>(`${BASE}/requests/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function approveTimesheetRequest(
  id: number,
  body: { comment?: string; dayHours?: number | string | null; nightHours?: number | string | null },
  organizationId?: number | null,
): Promise<TimesheetRequest> {
  return apiRequest<TimesheetRequest>(`${BASE}/requests/${id}/approve/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function rejectTimesheetRequest(
  id: number,
  comment: string,
  organizationId?: number | null,
): Promise<TimesheetRequest> {
  return apiRequest<TimesheetRequest>(`${BASE}/requests/${id}/reject/`, {
    method: "POST",
    body: { comment },
    headers: orgHeaders(organizationId),
  });
}

export function cancelTimesheetRequest(
  id: number,
  organizationId?: number | null,
): Promise<TimesheetRequest> {
  return apiRequest<TimesheetRequest>(`${BASE}/requests/${id}/cancel/`, {
    method: "POST",
    body: {},
    headers: orgHeaders(organizationId),
  });
}

// ── Organization codes ──────────────────────────────────────────────────────

export function getTimesheetCodes(
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<{ items: TimesheetCode[] }> {
  return apiRequest<{ items: TimesheetCode[] }>(`${BASE}/codes/`, {
    headers: orgHeaders(organizationId),
    signal,
  });
}

export function createTimesheetCode(
  body: TimesheetCodeWrite & { letter: string; name: string },
  organizationId?: number | null,
): Promise<TimesheetCode> {
  return apiRequest<TimesheetCode>(`${BASE}/codes/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function updateTimesheetCode(
  id: number,
  body: TimesheetCodeWrite,
  organizationId?: number | null,
): Promise<TimesheetCode> {
  return apiRequest<TimesheetCode>(`${BASE}/codes/${id}/`, {
    method: "PATCH",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function deleteTimesheetCode(
  id: number,
  organizationId?: number | null,
): Promise<void> {
  return apiRequest<void>(`${BASE}/codes/${id}/`, {
    method: "DELETE",
    headers: orgHeaders(organizationId),
  });
}

// ── Holidays ────────────────────────────────────────────────────────────────

export function getTimesheetHolidays(
  year: number,
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<{ year: number; items: TimesheetHoliday[] }> {
  return apiRequest<{ year: number; items: TimesheetHoliday[] }>(
    `${BASE}/holidays/${query({ year })}`,
    { headers: orgHeaders(organizationId), signal },
  );
}

export function createTimesheetHoliday(
  body: { date: string; name: string },
  organizationId?: number | null,
): Promise<TimesheetHoliday> {
  return apiRequest<TimesheetHoliday>(`${BASE}/holidays/`, {
    method: "POST",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function updateTimesheetHoliday(
  id: number,
  body: { date?: string; name?: string },
  organizationId?: number | null,
): Promise<TimesheetHoliday> {
  return apiRequest<TimesheetHoliday>(`${BASE}/holidays/${id}/`, {
    method: "PATCH",
    body,
    headers: orgHeaders(organizationId),
  });
}

export function deleteTimesheetHoliday(
  id: number,
  organizationId?: number | null,
): Promise<void> {
  return apiRequest<void>(`${BASE}/holidays/${id}/`, {
    method: "DELETE",
    headers: orgHeaders(organizationId),
  });
}

/** POST /timesheet/holidays/preset/ — праздники КР с фиксированной датой. */
export function applyKgHolidayPreset(
  year: number,
  organizationId?: number | null,
): Promise<{ year: number; items: TimesheetHoliday[] }> {
  return apiRequest<{ year: number; items: TimesheetHoliday[] }>(
    `${BASE}/holidays/preset/`,
    { method: "POST", body: { year }, headers: orgHeaders(organizationId) },
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

export function getTimesheetSettings(
  organizationId?: number | null,
  signal?: AbortSignal,
): Promise<TimesheetSettings> {
  return apiRequest<TimesheetSettings>(`${BASE}/settings/`, {
    headers: orgHeaders(organizationId),
    signal,
  });
}

export function updateTimesheetSettings(
  body: Partial<TimesheetSettings>,
  organizationId?: number | null,
): Promise<TimesheetSettings> {
  return apiRequest<TimesheetSettings>(`${BASE}/settings/`, {
    method: "PATCH",
    body,
    headers: orgHeaders(organizationId),
  });
}
