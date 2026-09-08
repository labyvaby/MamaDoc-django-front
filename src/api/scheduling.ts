import { ApiError, apiRequest } from "./client";

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
  /** Подтверждение пересечения смен после 409 — см. ShiftOverlapConflict. */
  allowOverlap?: boolean;
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
  /** Подтверждение пересечения смен после 409 — см. ShiftOverlapConflict. */
  allowOverlap?: boolean;
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
  /**
   * Общий идентификатор пачки, созданной одним `POST exceptions/period/`.
   * У точечного исключения — `null`; на окружении без выкладки поля нет вовсе.
   */
  groupId?: string | null;
}

export interface ScheduleExceptionWrite {
  employeeId: number;
  /** Подтверждение пересечения смен после 409 — см. ShiftOverlapConflict. */
  allowOverlap?: boolean;
  date: string;
  kind: ScheduleExceptionKind;
  startTime?: string | null;
  endTime?: string | null;
  comment?: string;
  branchId?: number | null;
  organizationId?: number | null;
}

export interface ScheduleExceptionPatch {
  /** Подтверждение пересечения смен после 409 — см. ShiftOverlapConflict. */
  allowOverlap?: boolean;
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
  /**
   * Явный режим «все филиалы организации». До 02.09.2026 availability этот
   * параметр не читала вовсе, и org-wide получался сам собой — просто не
   * передавали branchId. Теперь режим назван своим именем и побеждает branchId,
   * если пришли оба.
   */
  allBranches?: boolean;
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
  /** См. AvailabilityParams.allBranches. */
  allBranches?: boolean;
  branchId?: number;
  organizationId?: number;
}

// ── Пересечение смен одного сотрудника (HTTP 409) ─────────────────────────────

/**
 * Одна пересекающаяся смена того же сотрудника — правило или рабочее исключение.
 *
 * Филиал приходит с названием, в отличие от конфликта приёмов: скрывать нечего,
 * это график того же человека, а без адреса предупреждение бесполезно.
 */
export interface ShiftOverlap {
  kind: "rule" | "exception";
  /** Заполнено при kind = "rule". */
  ruleId: number | null;
  /** Заполнено при kind = "exception". */
  exceptionId: number | null;
  branchId: number | null;
  branchName: string | null;
  /** Конфликт в другом филиале — человек один, а не «две колонки». */
  otherBranch?: boolean;
  /** Конкретный день пересечения, YYYY-MM-DD. */
  date: string;
  start: string; // HH:MM
  end: string;
}

/**
 * Тело 409 при сохранении смены в режиме организации `warn`
 * (тот же тумблер appointment_overlap_mode, что у приёмов; ветка бэка
 * feature/multi-branch-schedule, 02.09.2026).
 *
 * В режиме `forbid` пересечение отдаётся плоским 400 с текстом в поле
 * startTime — подтверждать там нечего, диалог не нужен.
 */
export interface ShiftOverlapConflict {
  code: "schedule_shift_overlap";
  message: string;
  employeeId: number;
  /** Не больше 10 — диалогу нужна причина, а не весь календарь. */
  overlaps: ShiftOverlap[];
}

/**
 * Распознаём пересечение смен: 409 с машинным кодом `schedule_shift_overlap`.
 * Ключимся на код, не на текст. Любая другая ошибка — null, её показывает
 * обычный разбор.
 */
export function parseShiftOverlapConflict(err: unknown): ShiftOverlapConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const p = err.payload as Record<string, unknown> | undefined;
  if (p && typeof p === "object" && p.code === "schedule_shift_overlap") {
    return p as unknown as ShiftOverlapConflict;
  }
  return null;
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

// ── Исключение графика периодом ──────────────────────────────────────────────

/**
 * Отпуск/больничный одним запросом. Бэк разворачивает период в N однодневных
 * исключений с общим `groupUuid` — выборка доступности ищет по конкретной дате.
 * Создание атомарное: либо все дни, либо ни одного. Потолок — 366 дней.
 */
export interface ScheduleExceptionPeriodWrite {
  employeeId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  kind: ScheduleExceptionKind;
  /** Не передан — исключение «в любом филиале». */
  branchId?: number | null;
  comment?: string;
  organizationId?: number | null;
}

export interface ScheduleExceptionPeriodResult {
  groupId: string;
  count: number;
  items: ScheduleException[];
}

export function createScheduleExceptionPeriod(
  payload: ScheduleExceptionPeriodWrite,
): Promise<ScheduleExceptionPeriodResult> {
  return apiRequest<ScheduleExceptionPeriodResult>("/scheduling/exceptions/period/", {
    method: "POST",
    body: payload,
  });
}

/** Снимает всю пачку целиком — по `groupId` из ответа создания или из GET. */
export function deleteScheduleExceptionPeriod(groupId: string): Promise<void> {
  return apiRequest<void>(`/scheduling/exceptions/period/${groupId}/`, {
    method: "DELETE",
  });
}

// ── Конфликты отсутствия ─────────────────────────────────────────────────────

/**
 * Приём, попадающий под отсутствие сотрудника.
 *
 * Это НЕ объект приёма из `/appointments/`: ручка отдаёт свою плоскую сводку
 * (пациент строкой, услуги — массивом названий) — проверено живым запросом на
 * test 03.09.2026. Всё, что нужно экрану разбора, здесь есть; за деталями
 * приёма ходить в `/appointments/<id>/`.
 */
export interface ScheduleConflictAppointment {
  id: number;
  startsAt: string;
  endsAt: string;
  /** Только незакрытые: `scheduled` | `confirmed` | `arrived`. */
  status: string;
  branchId: number | null;
  branchName: string | null;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  /** Названия услуг приёма, без цен и исполнителей. */
  services: string[];
  /** decimal-строка; > 0 — по приёму уже есть деньги (предоплата). */
  paidTotal: string;
  /** true — отсутствующий «врач приёма», false — исполнитель одной из строк. */
  isPerformerPrimary: boolean;
}

/** Ответ ручки — объект-обёртка с эхом параметров запроса. */
export interface ScheduleConflictsResponse {
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  appointments: ScheduleConflictAppointment[];
}

/**
 * Приёмы сотрудника за период в статусах `scheduled`, `confirmed`, `arrived`.
 *
 * Скоуп — все филиалы, доступные вызывающему, а не активный филиал сессии:
 * исключение ставится на один филиал, а предупреждать надо пациентов всех
 * (ответ бэка §8). Право — `appointments.view`.
 */
export function getScheduleConflicts(
  params: {
    employeeId: number;
    dateFrom: string;
    dateTo: string;
    organizationId?: number | null;
  },
  signal?: AbortSignal,
): Promise<ScheduleConflictAppointment[]> {
  const q = new URLSearchParams();
  q.set("employeeId", String(params.employeeId));
  q.set("dateFrom", params.dateFrom);
  q.set("dateTo", params.dateTo);
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  return apiRequest<ScheduleConflictsResponse>(
    `/scheduling/exceptions/conflicts/?${q.toString()}`,
    { signal },
  ).then((data) => (Array.isArray(data?.appointments) ? data.appointments : []));
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
  if (params.allBranches) q.set("allBranches", "1");
  else if (params.branchId != null) q.set("branchId", String(params.branchId));
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
  if (params.allBranches) q.set("allBranches", "1");
  else if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  const qs = q.toString();
  return apiRequest<AvailabilitySummary>(
    `/scheduling/availability/summary/${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
