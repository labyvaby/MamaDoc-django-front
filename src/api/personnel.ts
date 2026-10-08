import { API_BASE, ApiError, apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";
import { fromRawPayslip, type Payslip } from "./salaryPayroll";

/**
 * Кадры застройщика (AIVIO, группа «Персонал»): сотрудники, оргструктура,
 * кадровые события, табель — `/api/v2/personnel`.
 *
 * Контракт — гайд бэка `frontend-hr-ops.md` §1–2 (05.10.2026).
 * - `id` сотрудника тот же, что `staff.Employee.id` (общий с salary и СКУД);
 *   MamaDoc `/api/staff/employees/` для экрана не годится — нет отдела,
 *   должности, оклада и кадровых статусов;
 * - смотреть — `personnel.view`; действия — `personnel.manage`. ⚠ Открытый
 *   вопрос бэка №1: это же право есть у прораба (от табеля), поэтому кнопки
 *   карточки фронт дополнительно гейтит MamaDoc-правом `staff.update` /
 *   `staff.create` (как просит гайд);
 * - филиал режет бэк по филиалу сотрудника; деньги — строки → числа;
 * - штатное расписание и вакансии (`frontend-new-modules.md` §2, 07.10):
 *   «Занято» не вводится — бэк считает по сотрудникам с `staffingPositionId`.
 */

const API = "/v2/personnel";

export const EMPLOYEE_FILTERS = ["working", "probation", "vacation", "sick", "fired", "all"] as const;
export type EmployeeFilter = (typeof EMPLOYEE_FILTERS)[number];

export const VACATION_TYPES = ["annual", "unpaid", "study"] as const;
export type VacationType = (typeof VACATION_TYPES)[number];

/** Отметки табеля по кругу кликов (как в макете). */
export const TIMESHEET_MARKS = ["Я", "В", "О", "Б", "К", "Н"] as const;
export type TimesheetMark = (typeof TIMESHEET_MARKS)[number];

export interface PersonnelSummary {
  employees: number;
  departments: number;
  payrollFund: number;
  hiredThisYear: number;
  fired: number;
  probation: number;
  absentToday: number;
  timesheetFilledPct: number;
  timesheetClosed: boolean;
}

export interface Employee {
  id: number;
  name: string;
  position: string;
  deptId: number | null;
  deptName: string;
  projectId: number | null;
  projectName: string;
  /** `null` у технических учёток без профиля. */
  salary: number | null;
  hired: string | null;
  status: string;
  statusLabel: string;
  phone: string;
  email: string;
  birthday: string | null;
  vacationLeft: number;
  contractNumber: string;
  probationUntil: string | null;
  firedAt: string | null;
  fireReason: string;
  /** Штатная единица (позиция штатного расписания); `null` — не привязан. */
  staffingPositionId: number | null;
}

export interface PersonnelEvent {
  id: number;
  at: string;
  type: string;
  typeLabel: string;
  text: string;
  employeeId: number | null;
  employeeName: string;
}

export interface EmployeeCard {
  employee: Employee;
  headName: string;
  /** Трудовой договор, приказы: у бэка `{name, number, date}`, ссылки и id нет (test2, 08.10). */
  documents: { id: number | null; name: string; number: string; date: string | null; url: string }[];
  events: PersonnelEvent[];
  currentMonth: { month: string; worked: number; workdays: number; vacation: number; sick: number };
}

export interface Department {
  id: number;
  name: string;
  headId: number | null;
  headName: string;
  sortOrder: number;
  count: number;
}

export interface OrgPerson {
  id: number;
  name: string;
  position: string;
  projectName: string;
  isHead: boolean;
}

export interface OrgDepartment {
  id: number;
  name: string;
  count: number;
  head: OrgPerson | null;
  people: OrgPerson[];
}

export interface Birthday {
  id: number;
  name: string;
  position: string;
  date: string;
  daysLeft: number | null;
}

export interface TimesheetRow {
  employeeId: number;
  name: string;
  position: string;
  deptId: number | null;
  /** День месяца (строкой) → отметка. */
  marks: Record<string, string>;
  acsDays: number[];
  worked: number;
  vacation: number;
  sick: number;
  absent: number;
  hours: number;
  acsTimes: Record<string, { checkIn: string | null; checkOut: string | null }>;
}

export interface Timesheet {
  month: string;
  days: number;
  workdays: number;
  filledPct: number;
  filledOn: string | null;
  vacationDays: number;
  sickDays: number;
  absentDays: number;
  closed: boolean;
  closedAt: string | null;
  rows: TimesheetRow[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);

export const fromRawSummary = (raw: any): PersonnelSummary => ({
  employees: num(raw?.employees),
  departments: num(raw?.departments),
  payrollFund: num(raw?.payrollFund),
  hiredThisYear: num(raw?.hiredThisYear),
  fired: num(raw?.fired),
  probation: num(raw?.probation),
  absentToday: num(raw?.absentToday),
  timesheetFilledPct: num(raw?.timesheetFilledPct),
  timesheetClosed: Boolean(raw?.timesheetClosed),
});

export const fromRawEmployee = (raw: any): Employee => ({
  id: raw.id,
  name: str(raw.name),
  position: str(raw.position),
  deptId: raw.deptId ?? null,
  deptName: str(raw.deptName),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  salary: numOrNull(raw.salary),
  hired: raw.hired ?? null,
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  phone: str(raw.phone),
  email: str(raw.email),
  birthday: raw.birthday ?? null,
  vacationLeft: num(raw.vacationLeft),
  contractNumber: str(raw.contractNumber),
  probationUntil: raw.probationUntil ?? null,
  firedAt: raw.firedAt ?? null,
  fireReason: str(raw.fireReason),
  staffingPositionId: numOrNull(raw.staffingPositionId),
});

export const fromRawEvent = (raw: any): PersonnelEvent => ({
  id: raw.id,
  at: str(raw.at),
  type: str(raw.type),
  typeLabel: str(raw.typeLabel),
  text: str(raw.text),
  employeeId: raw.employeeId ?? null,
  employeeName: str(raw.employeeName),
});

export const fromRawCard = (raw: any): EmployeeCard => ({
  employee: fromRawEmployee(raw?.employee ?? raw ?? {}),
  headName: str(raw?.headName),
  documents: list(raw?.documents).map((d) => ({ id: d.id ?? null, name: str(d.name ?? d.title), number: str(d.number), date: d.date ?? null, url: str(d.url ?? d.fileUrl) })),
  events: list(raw?.events).map(fromRawEvent),
  currentMonth: {
    month: str(raw?.currentMonth?.month),
    worked: num(raw?.currentMonth?.worked),
    workdays: num(raw?.currentMonth?.workdays),
    vacation: num(raw?.currentMonth?.vacation),
    sick: num(raw?.currentMonth?.sick),
  },
});

const fromRawOrgPerson = (raw: any): OrgPerson => ({ id: raw.id, name: str(raw.name), position: str(raw.position), projectName: str(raw.projectName), isHead: Boolean(raw.isHead) });

export const fromRawOrg = (raw: any): OrgDepartment => ({
  id: raw.id,
  name: str(raw.name),
  count: num(raw.count),
  head: raw.head ? fromRawOrgPerson(raw.head) : null,
  people: list(raw.people).map(fromRawOrgPerson),
});

export const fromRawTimesheet = (raw: any): Timesheet => ({
  month: str(raw?.month),
  days: num(raw?.days),
  workdays: num(raw?.workdays),
  filledPct: num(raw?.filledPct),
  filledOn: raw?.filledOn ?? null,
  vacationDays: num(raw?.vacationDays),
  sickDays: num(raw?.sickDays),
  absentDays: num(raw?.absentDays),
  closed: Boolean(raw?.closed),
  closedAt: raw?.closedAt ?? null,
  rows: list(raw?.rows).map(fromRawTimesheetRow),
});

export function fromRawTimesheetRow(raw: any): TimesheetRow {
  return {
    employeeId: raw.employeeId,
    name: str(raw.name),
    position: str(raw.position),
    deptId: raw.deptId ?? null,
    marks: raw.marks && typeof raw.marks === "object" ? Object.fromEntries(Object.entries(raw.marks).filter(([, v]) => v != null).map(([k, v]) => [String(k), String(v)])) : {},
    acsDays: list(raw.acsDays).map(Number),
    worked: num(raw.worked),
    vacation: num(raw.vacation),
    sick: num(raw.sick),
    absent: num(raw.absent),
    hours: num(raw.hours),
    acsTimes:
      raw.acsTimes && typeof raw.acsTimes === "object"
        ? Object.fromEntries(Object.entries(raw.acsTimes as Record<string, any>).map(([k, v]) => [String(k), { checkIn: v?.checkIn ?? null, checkOut: v?.checkOut ?? null }]))
        : {},
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

const personnel = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });
const post = <T>(scope: RealtyScope | undefined, path: string, body: unknown = {}) => personnel<T>(scope, path, { method: "POST", body });

function query(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") qs.set(key, String(value));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

export async function getPersonnelSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<PersonnelSummary> {
  return fromRawSummary(await personnel(scope, "/summary/", { signal }));
}

export async function getEmployees(params: { q?: string; deptId?: number | null; status?: EmployeeFilter }, scope?: RealtyScope, signal?: AbortSignal): Promise<Employee[]> {
  const qs = query({ q: params.q?.trim(), deptId: params.deptId, status: params.status && params.status !== "all" ? params.status : null });
  return list(await personnel(scope, `/employees/${qs}`, { signal })).map(fromRawEmployee);
}

export async function getEmployeeCard(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<EmployeeCard> {
  return fromRawCard(await personnel(scope, `/employees/${id}/`, { signal }));
}

/** «Последняя выплата» в карточке: без `month` — последняя ведомость. */
export async function getEmployeePayslip(id: number, month: string | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Payslip> {
  return fromRawPayslip(await personnel(scope, `/employees/${id}/payslip/${query({ month })}`, { signal }));
}

export async function getDepartments(scope?: RealtyScope, signal?: AbortSignal): Promise<Department[]> {
  return list(await personnel(scope, "/departments/", { signal })).map((d) => ({
    id: d.id,
    name: str(d.name),
    headId: d.headId ?? null,
    headName: str(d.headName),
    sortOrder: num(d.sortOrder),
    count: num(d.count ?? d.employeesCount),
  }));
}

export async function getOrgStructure(scope?: RealtyScope, signal?: AbortSignal): Promise<OrgDepartment[]> {
  return list(await personnel(scope, "/org-structure/", { signal })).map(fromRawOrg);
}

export async function getPersonnelEvents(scope?: RealtyScope, signal?: AbortSignal): Promise<PersonnelEvent[]> {
  return list(await personnel(scope, "/events/", { signal })).map(fromRawEvent);
}

export async function getBirthdays(days: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Birthday[]> {
  return list(await personnel(scope, `/birthdays/?days=${days}`, { signal })).map((b) => ({
    id: b.id ?? b.employeeId,
    name: str(b.name),
    position: str(b.position),
    date: str(b.date ?? b.birthday),
    daysLeft: numOrNull(b.daysLeft ?? b.inDays),
  }));
}

export interface EmployeeInput {
  name: string;
  position: string;
  hired: string;
  deptId: number | null;
  projectId: number | null;
  salary: string;
  phone: string;
  email: string;
  birthday: string | null;
  probation: boolean;
  staffingPositionId?: number | null;
}

/** Тело приёма: пустые необязательные поля не шлём. */
export function employeeBody(input: EmployeeInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: input.name.trim(), position: input.position.trim(), hired: input.hired, probation: input.probation };
  if (input.deptId != null) body.deptId = input.deptId;
  if (input.projectId != null) body.projectId = input.projectId;
  if (input.salary.trim()) body.salary = input.salary.trim();
  if (input.phone.trim()) body.phone = input.phone.trim();
  if (input.email.trim()) body.email = input.email.trim();
  if (input.birthday) body.birthday = input.birthday;
  if (input.staffingPositionId != null) body.staffingPositionId = input.staffingPositionId;
  return body;
}

export async function createEmployee(input: EmployeeInput, scope?: RealtyScope): Promise<EmployeeCard> {
  return fromRawCard(await post(scope, "/employees/", employeeBody(input)));
}

export type EmployeePatch = Partial<{
  name: string;
  position: string;
  deptId: number | null;
  projectId: number | null;
  phone: string;
  email: string;
  birthday: string | null;
  hired: string;
  salary: string;
  vacationLeft: number;
  staffingPositionId: number | null;
}>;

export async function updateEmployee(id: number, patch: EmployeePatch, scope?: RealtyScope): Promise<EmployeeCard> {
  return fromRawCard(await personnel(scope, `/employees/${id}/`, { method: "PATCH", body: patch }));
}

export async function raiseEmployee(id: number, body: { position: string; salary: string; date: string; reason: string }, scope?: RealtyScope): Promise<EmployeeCard> {
  return fromRawCard(await post(scope, `/employees/${id}/raise/`, { ...body, position: body.position.trim(), reason: body.reason.trim() }));
}

export type AbsenceKind = "vacation" | "sick" | "trip";

/** Отпуск / больничный / командировка: задевает закрытый месяц табеля — 400. */
export async function registerAbsence(id: number, kind: AbsenceKind, body: { from: string; days: number; type?: VacationType; note?: string }, scope?: RealtyScope): Promise<EmployeeCard> {
  const payload: Record<string, unknown> = { from: body.from, days: body.days };
  if (kind === "vacation") payload.type = body.type ?? "annual";
  else if (body.note?.trim()) payload.note = body.note.trim();
  return fromRawCard(await post(scope, `/employees/${id}/${kind}/`, payload));
}

export async function fireEmployee(id: number, body: { date: string; reason: string }, scope?: RealtyScope): Promise<EmployeeCard> {
  return fromRawCard(await post(scope, `/employees/${id}/fire/`, body));
}

export async function rehireEmployee(id: number, scope?: RealtyScope): Promise<EmployeeCard> {
  return fromRawCard(await post(scope, `/employees/${id}/rehire/`));
}

// Табель

export async function getTimesheet(month: string, deptId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Timesheet> {
  return fromRawTimesheet(await personnel(scope, `/timesheet/${query({ month, deptId })}`, { signal }));
}

/** Ячейка табеля: ответ — одна обновлённая строка. `mark: null` очищает. */
export async function setTimesheetCell(employeeId: number, date: string, mark: string | null, scope?: RealtyScope): Promise<TimesheetRow> {
  return fromRawTimesheetRow(await post(scope, "/timesheet/cell/", { employeeId, date, mark }));
}

export async function fillTimesheet(month: string, source: "schedule" | "acs", scope?: RealtyScope): Promise<{ filled: number }> {
  const raw = await post<{ filled?: number }>(scope, source === "acs" ? "/timesheet/fill-from-acs/" : "/timesheet/autofill/", { month });
  return { filled: num(raw?.filled) };
}

export async function closeTimesheet(month: string, scope?: RealtyScope): Promise<{ closedAt: string | null }> {
  const raw = await post<{ closedAt?: string }>(scope, "/timesheet/close/", { month });
  return { closedAt: raw?.closedAt ?? null };
}

// Штатное расписание и вакансии

export interface StaffingEmployee {
  id: number;
  name: string;
  status: string;
}

export interface StaffingPosition {
  id: number;
  title: string;
  deptId: number | null;
  deptName: string;
  branchId: number | null;
  branchName: string;
  /** Ставок по штату. */
  headcount: number;
  salary: number;
  /** ФОТ по штату = ставки × оклад. */
  fund: number;
  /** Считает бэк: сотрудники с этой штатной единицей. */
  filled: number;
  vacant: number;
  /** Сверх штата. */
  over: number;
  inRecruitment: number;
  employees: StaffingEmployee[];
  note: string;
  sortOrder: number;
}

export interface StaffingDepartment {
  deptId: number | null;
  deptName: string;
  headcount: number;
  filled: number;
  vacant: number;
  fund: number;
  positions: StaffingPosition[];
}

export interface Staffing {
  totals: { positions: number; headcount: number; filled: number; vacant: number; over: number; fund: number; openVacancies: number; unassigned: number };
  departments: StaffingDepartment[];
}

export const VACANCY_STATUSES = ["new", "screening", "interview", "offer", "closed", "cancelled"] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];
/** Этапы открытой вакансии — для смены этапа; closed / cancelled закрывают её. */
export const OPEN_VACANCY_STATUSES: readonly VacancyStatus[] = ["new", "screening", "interview", "offer"];

export interface Vacancy {
  id: number;
  positionId: number | null;
  title: string;
  deptId: number | null;
  deptName: string;
  branchId: number | null;
  branchName: string;
  openings: number;
  hired: number;
  status: string;
  statusLabel: string;
  /** gray / amber / blue / green… */
  tone: string;
  isOpen: boolean;
  candidates: number;
  responses: number;
  /** «4 кандидата» / «11 откликов» — склоняет бэк. */
  countLabel: string;
  salary: number | null;
  note: string;
  openedAt: string | null;
  closedAt: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
export const fromRawStaffingPosition = (raw: any): StaffingPosition => ({
  id: raw.id,
  title: str(raw.title),
  deptId: numOrNull(raw.deptId),
  deptName: str(raw.deptName),
  branchId: numOrNull(raw.branchId),
  branchName: str(raw.branchName),
  headcount: num(raw.headcount),
  salary: num(raw.salary),
  fund: num(raw.fund),
  filled: num(raw.filled),
  vacant: num(raw.vacant),
  over: num(raw.over),
  inRecruitment: num(raw.inRecruitment),
  employees: list(raw.employees).map((e) => ({ id: e.id, name: str(e.name), status: str(e.status) })),
  note: str(raw.note),
  sortOrder: num(raw.sortOrder),
});

export const fromRawStaffing = (raw: any): Staffing => ({
  totals: {
    positions: num(raw?.totals?.positions),
    headcount: num(raw?.totals?.headcount),
    filled: num(raw?.totals?.filled),
    vacant: num(raw?.totals?.vacant),
    over: num(raw?.totals?.over),
    fund: num(raw?.totals?.fund),
    openVacancies: num(raw?.totals?.openVacancies),
    unassigned: num(raw?.totals?.unassigned),
  },
  departments: list(raw?.departments).map((d) => ({
    deptId: numOrNull(d.deptId),
    deptName: str(d.deptName),
    headcount: num(d.headcount),
    filled: num(d.filled),
    vacant: num(d.vacant),
    fund: num(d.fund),
    positions: list(d.positions).map(fromRawStaffingPosition),
  })),
});

export const fromRawVacancy = (raw: any): Vacancy => ({
  id: raw.id,
  positionId: numOrNull(raw.positionId),
  title: str(raw.title),
  deptId: numOrNull(raw.deptId),
  deptName: str(raw.deptName),
  branchId: numOrNull(raw.branchId),
  branchName: str(raw.branchName),
  openings: num(raw.openings),
  hired: num(raw.hired),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  tone: str(raw.tone),
  isOpen: Boolean(raw.isOpen),
  candidates: num(raw.candidates),
  responses: num(raw.responses),
  countLabel: str(raw.countLabel),
  salary: numOrNull(raw.salary),
  note: str(raw.note),
  openedAt: raw.openedAt ?? null,
  closedAt: raw.closedAt ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getStaffing(deptId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Staffing> {
  return fromRawStaffing(await personnel(scope, `/staffing/${query({ deptId })}`, { signal }));
}

/** Позиция штатного: «Занято» не передаётся — его считает бэк. */
export interface StaffingPositionInput {
  title: string;
  deptId: number | null;
  headcount: number;
  salary: string;
  note: string;
}

export async function createStaffingPosition(input: StaffingPositionInput, scope?: RealtyScope): Promise<StaffingPosition> {
  return fromRawStaffingPosition(await post(scope, "/staffing/", { ...input, title: input.title.trim(), note: input.note.trim() }));
}

export async function updateStaffingPosition(id: number, patch: Partial<StaffingPositionInput>, scope?: RealtyScope): Promise<StaffingPosition> {
  return fromRawStaffingPosition(await personnel(scope, `/staffing/${id}/`, { method: "PATCH", body: patch }));
}

export async function deleteStaffingPosition(id: number, scope?: RealtyScope): Promise<void> {
  await personnel(scope, `/staffing/${id}/`, { method: "DELETE" });
}

/** «⇩ Штатное» — CSV (`;`, UTF-8 с BOM) blob-ом: ссылка защищена сессией. */
export async function downloadStaffingCsv(scope?: RealtyScope): Promise<void> {
  const response = await fetch(`${API_BASE}${API}/staffing/export/`, { credentials: "include", headers: realtyHeaders(scope) });
  if (!response.ok) throw new ApiError(`Не удалось выгрузить штатное расписание (${response.status})`, response.status, null);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `staffing-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Без статуса бэк отдаёт все вакансии; `open` — только открытые (new…offer). */
export async function getVacancies(status: "open" | VacancyStatus | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Vacancy[]> {
  return list(await personnel(scope, `/vacancies/${query({ status })}`, { signal })).map(fromRawVacancy);
}

export interface VacancyInput {
  /** Обязательна при создании (иначе 400). */
  positionId: number | null;
  title: string;
  openings: number;
  salary: string;
  candidates: number;
  responses: number;
  note: string;
}

export async function createVacancy(input: VacancyInput, scope?: RealtyScope): Promise<Vacancy> {
  const body: Record<string, unknown> = { title: input.title.trim(), openings: input.openings, candidates: input.candidates, responses: input.responses };
  if (input.positionId != null) body.positionId = input.positionId;
  if (input.salary.trim()) body.salary = input.salary.trim();
  if (input.note.trim()) body.note = input.note.trim();
  return fromRawVacancy(await post(scope, "/vacancies/", body));
}

export async function updateVacancy(id: number, patch: Partial<Omit<VacancyInput, "positionId">> & { status?: VacancyStatus }, scope?: RealtyScope): Promise<Vacancy> {
  return fromRawVacancy(await personnel(scope, `/vacancies/${id}/`, { method: "PATCH", body: patch }));
}

/**
 * «Принять по вакансии» — обычный приём (договор и приказ в ЭДО); закрытая по
 * ставкам вакансия закрывается сама. Ответ — `{vacancy, employee: <карточка>}`
 * (test2, 08.10), не карточка, как у `POST /employees/`.
 */
export async function hireByVacancy(id: number, input: EmployeeInput, scope?: RealtyScope): Promise<{ vacancy: Vacancy | null; card: EmployeeCard }> {
  const raw = await post<{ vacancy?: unknown; employee?: unknown }>(scope, `/vacancies/${id}/hire/`, employeeBody(input));
  return { vacancy: raw?.vacancy ? fromRawVacancy(raw.vacancy) : null, card: fromRawCard(raw?.employee ?? raw) };
}

/** Штатные единицы списком для выбора в карточке сотрудника: «Отдел · Должность». */
export function staffingOptions(staffing: Staffing | undefined): StaffingPosition[] {
  return (staffing?.departments ?? []).flatMap((d) => d.positions);
}

// ─── Хелперы экранов ────────────────────────────────────────────────────────

/** Следующая отметка по кругу Я→В→О→Б→К→Н→Я; пустая ячейка — «Я». */
export function nextMark(current: string | undefined): TimesheetMark {
  const i = TIMESHEET_MARKS.indexOf(current as TimesheetMark);
  return TIMESHEET_MARKS[(i + 1) % TIMESHEET_MARKS.length];
}

/** Стаж от даты приёма: `{ years, months }` (как `tenure()` макета). */
export function tenure(hired: string | null, today = new Date()): { years: number; months: number } | null {
  if (!hired) return null;
  const [y, m, d] = hired.split("-").map(Number);
  if (!y || !m) return null;
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < (d || 1)) months -= 1;
  if (months < 0) return { years: 0, months: 0 };
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Выходной по дню недели (сб, вс) — подсветку сетки табеля бэк не отдаёт. */
export function isWeekend(month: string, day: number): boolean {
  const [y, m] = month.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const personnelKeys = {
  all: ["django", "personnel"] as const,
  scoped: (scope: RealtyScope | undefined) => [...personnelKeys.all, ...scopeKey(scope)] as const,
  summary: (scope: RealtyScope | undefined) => [...personnelKeys.scoped(scope), "summary"] as const,
  employees: (scope: RealtyScope | undefined, params: { q?: string; deptId?: number | null; status?: string }) => [...personnelKeys.scoped(scope), "employees", params] as const,
  card: (scope: RealtyScope | undefined, id: number) => [...personnelKeys.scoped(scope), "card", id] as const,
  payslip: (scope: RealtyScope | undefined, id: number) => [...personnelKeys.scoped(scope), "payslip", id] as const,
  departments: (scope: RealtyScope | undefined) => [...personnelKeys.scoped(scope), "departments"] as const,
  org: (scope: RealtyScope | undefined) => [...personnelKeys.scoped(scope), "org"] as const,
  events: (scope: RealtyScope | undefined) => [...personnelKeys.scoped(scope), "events"] as const,
  birthdays: (scope: RealtyScope | undefined) => [...personnelKeys.scoped(scope), "birthdays"] as const,
  timesheet: (scope: RealtyScope | undefined, month: string, deptId: number | null) => [...personnelKeys.scoped(scope), "timesheet", month, deptId] as const,
  staffing: (scope: RealtyScope | undefined, deptId: number | null) => [...personnelKeys.scoped(scope), "staffing", deptId] as const,
  vacancies: (scope: RealtyScope | undefined, status: string | null) => [...personnelKeys.scoped(scope), "vacancies", status] as const,
};
