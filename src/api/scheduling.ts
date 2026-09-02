import { apiRequest } from "./client";

// ── Types (mirror server/apps/scheduling/api/payloads.py) ─────────────────────

export type ScheduleExceptionKind = "day_off" | "vacation" | "extra" | "override";

export interface ScheduleRule {
  id: number;
  employeeId: number;
  employeeName: string;
  branchId: number | null;
  branchName: string | null;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  weekdays: number[]; // 0=Пн … 6=Вс
  startTime: string; // HH:MM
  endTime: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  comment: string;
  isActive: boolean;
}

export interface ScheduleRuleWrite {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  branchId?: number | null;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  comment?: string;
  organizationId?: number | null;
}

export interface ScheduleRulePatch {
  dateFrom?: string;
  dateTo?: string;
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
  lunchStart?: string;
  lunchEnd?: string;
  clearLunch?: boolean;
  branchId?: number;
  clearBranch?: boolean;
  comment?: string;
  isActive?: boolean;
}

export interface ScheduleException {
  id: number;
  employeeId: number;
  employeeName: string;
  branchId: number | null;
  branchName: string | null;
  date: string;
  kind: ScheduleExceptionKind;
  startTime: string | null;
  endTime: string | null;
  comment: string;
}

export interface ScheduleExceptionWrite {
  employeeId: number;
  date: string;
  kind: ScheduleExceptionKind;
  startTime?: string | null;
  endTime?: string | null;
  comment?: string;
  branchId?: number | null;
  organizationId?: number | null;
}

export interface ScheduleExceptionPatch {
  date?: string;
  kind?: ScheduleExceptionKind;
  startTime?: string;
  endTime?: string;
  comment?: string;
  branchId?: number;
}

export interface AvailabilitySlot {
  start: string; // HH:MM
  end: string;
  free: boolean;
  appointmentId: number | null;
  /**
   * Филиал занявшего слот приёма; у свободного слота — null (занимать нечем).
   *
   * Поле диагностическое: после серверного скоупа (21.08.2026) оно равно
   * запрошенному branchId, но позволяет увидеть расхождение прямо в ответе.
   */
  branchId: number | null;
  /** Название филиала смены; приходит вместе с branchId (ветка бэка 02.09.2026). */
  branchName?: string | null;
  patientName: string | null;
  /**
   * Слот закрыт приёмом сотрудника в ДРУГОМ филиале (ответ бэка 02.09.2026).
   *
   * Приходит с `free: false` и без данных чужого приёма: ни appointmentId, ни
   * пациента, ни названия филиала. Записать в него нельзя — проверка
   * пересечений с этой же выкладки идёт по сотруднику, а не по филиалу, так
   * что сохранение вернуло бы отказ. Отличить от прошедшего окна (у того тоже
   * `free: false` и `appointmentId: null`) можно только этим полем.
   */
  busyElsewhere?: boolean;
}

/**
 * Занятое время дня — ФАКТИЧЕСКИЙ приём, а не слот сетки.
 *
 * Сетка режется шагом от начала смены, поэтому приём 11:45–12:15 попадает
 * сразу в два слота (11:30 и 12:00) и ни один из них не показывает его
 * настоящее время. Время занятой строки берём отсюда.
 */
export interface AvailabilityAppointment {
  id: number;
  /**
   * Филиал приёма — обязателен. При запросе с branchId здесь всегда он же
   * (чужих приёмов в выдаче нет с 21.08.2026); поле по-настоящему работает в
   * org-wide режиме суперпользователя, где филиалы разные.
   */
  branchId: number;
  branchName: string;
  start: string; // HH:MM
  end: string;
  patientName: string;
  status: string;
}

export interface AvailabilityDay {
  date: string;
  scheduled: boolean;
  dayOff: boolean;
  freeCount: number;
  slots: AvailabilitySlot[];
  appointments: AvailabilityAppointment[];
}

export interface EmployeeAvailability {
  employeeId: number;
  fullName: string;
  nearestFree: { date: string; start: string } | null;
  days: AvailabilityDay[];
}

export interface Availability {
  dateFrom: string;
  dateTo: string;
  durationMinutes: number;
  employees: EmployeeAvailability[];
}

export interface SpecializationAvailabilitySummary {
  specializationId: number;
  employeeCount: number;
  freeEmployeeCount: number;
}

export interface AvailabilitySummary {
  date: string;
  specializations: SpecializationAvailabilitySummary[];
  overallEmployeeCount: number;
  overallFreeEmployeeCount: number;
}

export interface AvailabilityParams {
  employeeId?: number;
  specializationId?: number;
  /** Опционально: задаёт длину окна. Без него бэкенд режет сетку по 30 мин. */
  serviceId?: number;
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  organizationId?: number;
}

export interface AvailabilitySummaryParams {
  /** Дата для бейджей доступности; по умолчанию — сегодня. */
  date?: string;
  branchId?: number;
  organizationId?: number;
}

// ── API ────────────────────────────────────────────────────────────────────────

export function getScheduleRules(
  params: {
    employeeId?: number;
    includeInactive?: boolean;
    branchId?: number;
    organizationId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ScheduleRule[]> {
  const q = new URLSearchParams();
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.includeInactive) q.set("includeInactive", "1");
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<ScheduleRule[]>(`/scheduling/rules/${qs ? `?${qs}` : ""}`, { signal });
}

export function createScheduleRule(payload: ScheduleRuleWrite): Promise<ScheduleRule> {
  return apiRequest<ScheduleRule>("/scheduling/rules/", { method: "POST", body: payload });
}

export function updateScheduleRule(
  ruleId: number,
  payload: ScheduleRulePatch,
): Promise<ScheduleRule> {
  return apiRequest<ScheduleRule>(`/scheduling/rules/${ruleId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteScheduleRule(ruleId: number): Promise<void> {
  return apiRequest<void>(`/scheduling/rules/${ruleId}/`, { method: "DELETE" });
}

export function getScheduleExceptions(
  params: {
    employeeId?: number;
    dateFrom?: string;
    dateTo?: string;
    branchId?: number;
    organizationId?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ScheduleException[]> {
  const q = new URLSearchParams();
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<ScheduleException[]>(`/scheduling/exceptions/${qs ? `?${qs}` : ""}`, {
    signal,
  });
}

export function createScheduleException(
  payload: ScheduleExceptionWrite,
): Promise<ScheduleException> {
  return apiRequest<ScheduleException>("/scheduling/exceptions/", {
    method: "POST",
    body: payload,
  });
}

export function updateScheduleException(
  exceptionId: number,
  payload: ScheduleExceptionPatch,
): Promise<ScheduleException> {
  return apiRequest<ScheduleException>(`/scheduling/exceptions/${exceptionId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function deleteScheduleException(exceptionId: number): Promise<void> {
  return apiRequest<void>(`/scheduling/exceptions/${exceptionId}/`, { method: "DELETE" });
}

export function getAvailability(
  params: AvailabilityParams,
  signal?: AbortSignal,
): Promise<Availability> {
  const q = new URLSearchParams();
  if (params.employeeId != null) q.set("employeeId", String(params.employeeId));
  if (params.specializationId != null) {
    q.set("specializationId", String(params.specializationId));
  }
  if (params.serviceId != null) q.set("serviceId", String(params.serviceId));
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<Availability>(`/scheduling/availability/?${q.toString()}`, { signal });
}

/** Один агрегированный запрос для бейджей «свободны сегодня N/M». */
export function getAvailabilitySummary(
  params: AvailabilitySummaryParams = {},
  signal?: AbortSignal,
): Promise<AvailabilitySummary> {
  const q = new URLSearchParams();
  if (params.date) q.set("date", params.date);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<AvailabilitySummary>(
    `/scheduling/availability/summary/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
