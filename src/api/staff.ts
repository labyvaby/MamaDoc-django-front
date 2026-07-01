import { apiRequest } from "./client";

// ── Nested helpers ───────────────────────────────────────────────────────────

export interface DjangoEmployeeBranch {
  id: number;
  name: string;
}

export interface DjangoRoleShort {
  id: number;
  name: string;
  code: string;
}

export interface DjangoSpecializationShort {
  id: number;
  name: string;
}

// ── Clinical role ────────────────────────────────────────────────────────────

/** Professional type of employee — NOT an RBAC role. */
export type ClinicalRole = "doctor" | "nurse" | "other";

// ── Employee shapes ──────────────────────────────────────────────────────────

/** Full employee (GET /employees/<id>/, POST, PATCH) */
export interface DjangoEmployee {
  id: number;
  organizationId: number;
  branch: DjangoEmployeeBranch | null;
  authUserId: number | null;
  fullName: string;
  phone: string;
  email: string;
  nickname: string;
  notes: string;
  birthDate: string | null;
  telegramId: string;
  /** Empty string when caller lacks staff.private.view */
  bankAccountNumber: string;
  /** Empty string when caller lacks staff.private.view */
  inn: string;
  /** Банк расчётного счёта. Пусто без staff.private.view */
  bank: string;
  /** БИК. Пусто без staff.private.view */
  bik: string;
  /** URL файла elQR. null без staff.private.view */
  elqrUrl: string | null;
  status: "active" | "inactive" | "fired";
  clinicalRole: ClinicalRole;
  photoUrl: string | null;
  role: DjangoRoleShort | null;
  specializations: DjangoSpecializationShort[];
  operationalBranches: DjangoEmployeeBranch[];
  createdAt: string;
  updatedAt: string;
}

/** Compact list item (GET /employees/) */
export interface DjangoEmployeeListItem {
  id: number;
  organizationId: number;
  branch: DjangoEmployeeBranch | null;
  authUserId: number | null;
  fullName: string;
  phone: string;
  email: string;
  nickname: string;
  status: "active" | "inactive" | "fired";
  clinicalRole: ClinicalRole;
  photoUrl: string | null;
  role: DjangoRoleShort | null;
  specializations: DjangoSpecializationShort[];
  operationalBranches: DjangoEmployeeBranch[];
}

export interface PaginatedDjangoEmployees {
  count: number;
  nextPage: number | null;
  results: DjangoEmployeeListItem[];
}

// ── Create employee payload (without account) ─────────────────────────────────

export interface CreateEmployeePayload {
  fullName: string;
  branchId?: number | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status?: "active" | "inactive" | "fired";
  clinicalRole?: ClinicalRole;
  organizationId?: number | null;
}

export function createEmployee(
  payload: CreateEmployeePayload,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>("/staff/employees/", {
    method: "POST",
    body: payload,
  });
}

// ── Onboard payload ──────────────────────────────────────────────────────────

export interface OnboardEmployeePayload {
  fullName: string;
  roleId: number;
  employeeBranchIds: number[];
  clinicalRole?: ClinicalRole;

  organizationId?: number | null;

  userId?: number | null;
  email?: string;
  phone?: string;
  username?: string | null;
  password?: string | null;
  firstName?: string;
  lastName?: string;

  userBranchAccessIds?: number[] | null;
  branchId?: number | null;

  status?: "active" | "inactive" | "fired";
  specializationIds?: number[] | null;
  notes?: string;
  nickname?: string | null;
  birthDate?: string | null;
  telegramId?: string | null;
  bankAccountNumber?: string | null;
  inn?: string | null;
  bank?: string | null;
  bik?: string | null;
}

// ── Update payload ────────────────────────────────────────────────────────────

export interface UpdateEmployeePayload {
  fullName?: string | null;
  branchId?: number | null;
  status?: "active" | "inactive" | "fired" | null;
  phone?: string | null;
  email?: string | null;
  nickname?: string | null;
  notes?: string | null;
  birthDate?: string | null;
  telegramId?: string | null;
  bankAccountNumber?: string | null;
  inn?: string | null;
  bank?: string | null;
  bik?: string | null;
  clinicalRole?: ClinicalRole;
}

// ── Onboard response ─────────────────────────────────────────────────────────

export interface OnboardUserShort {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface OnboardRoleShort {
  id: number;
  name: string;
  code: string;
}

export interface OnboardMembershipShort {
  id: number;
  organizationId: number;
  role: OnboardRoleShort | null;
  isOwner: boolean;
  isActive: boolean;
}

export interface OnboardEmployeeResponse {
  employee: DjangoEmployee;
  user: OnboardUserShort;
  membership: OnboardMembershipShort;
  employeeBranches: DjangoEmployeeBranch[];
  userBranches: DjangoEmployeeBranch[];
}

// ── EmployeeService shapes ────────────────────────────────────────────────────

export interface EmployeeServiceShort {
  id: number;
  name: string;
  slug: string;
}

export interface EmployeeServiceAssignment {
  id: number;
  employeeId: number;
  service: EmployeeServiceShort;
  branch: DjangoEmployeeBranch | null;
  isActive: boolean;
  priceOverride: string | null;
  durationOverrideMinutes: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeServiceCreatePayload {
  serviceId: number;
  branchId?: number | null;
  isActive?: boolean;
  priceOverride?: string | number | null;
  durationOverrideMinutes?: number | null;
  notes?: string;
}

export interface EmployeeServiceUpdatePayload {
  isActive?: boolean | null;
  priceOverride?: string | number | null;
  durationOverrideMinutes?: number | null;
  notes?: string | null;
}

// ── Specialization shapes ─────────────────────────────────────────────────────

export interface DjangoSpecialization {
  id: number;
  organizationId: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpecializationCreatePayload {
  name: string;
  organizationId?: number | null;
}

export interface SpecializationUpdatePayload {
  name?: string;
  isActive?: boolean;
}

// ── Document shapes ───────────────────────────────────────────────────────────

export interface EmployeeDocumentItem {
  id: number;
  employeeId: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
}

// ── API functions — Employees ─────────────────────────────────────────────────

export interface GetEmployeesParams {
  search?: string;
  status?: "active" | "inactive" | "fired";
  branchId?: number;
  page?: number;
  pageSize?: number;
}

function normalizeEmployeeListItem(item: DjangoEmployeeListItem): DjangoEmployeeListItem {
  return {
    ...item,
    specializations: Array.isArray(item.specializations) ? item.specializations : [],
    operationalBranches: Array.isArray(item.operationalBranches) ? item.operationalBranches : [],
  };
}

function normalizeEmployee(employee: DjangoEmployee): DjangoEmployee {
  return {
    ...employee,
    specializations: Array.isArray(employee.specializations) ? employee.specializations : [],
    operationalBranches: Array.isArray(employee.operationalBranches)
      ? employee.operationalBranches
      : [],
  };
}

export function getDjangoEmployees(
  params?: GetEmployeesParams,
  signal?: AbortSignal,
): Promise<PaginatedDjangoEmployees> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.branchId != null) qs.set("branchId", String(params.branchId));
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiRequest<PaginatedDjangoEmployees>(`/staff/employees/${query}`, { signal }).then(
    (payload) => ({
      count: Number(payload?.count ?? 0),
      nextPage: payload?.nextPage ?? null,
      results: Array.isArray(payload?.results)
        ? payload.results.map(normalizeEmployeeListItem)
        : [],
    }),
  );
}

export function getDjangoEmployee(
  employeeId: number,
  signal?: AbortSignal,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/`, { signal }).then(
    normalizeEmployee,
  );
}

export function updateEmployee(
  employeeId: number,
  payload: UpdateEmployeePayload,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/`, {
    method: "PATCH",
    body: payload,
  }).then(normalizeEmployee);
}

export function fireEmployee(
  employeeId: number,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/fire/`, {
    method: "POST",
    body: { confirm: true },
  }).then(normalizeEmployee);
}

export function onboardEmployee(
  payload: OnboardEmployeePayload,
): Promise<OnboardEmployeeResponse> {
  return apiRequest<OnboardEmployeeResponse>("/staff/employees/onboard/", {
    method: "POST",
    body: payload,
  }).then((response) => ({
    ...response,
    employee: normalizeEmployee(response.employee),
    employeeBranches: Array.isArray(response.employeeBranches) ? response.employeeBranches : [],
    userBranches: Array.isArray(response.userBranches) ? response.userBranches : [],
  }));
}

// ── API functions — Photo ─────────────────────────────────────────────────────

export function uploadEmployeePhoto(
  employeeId: number,
  file: File,
): Promise<DjangoEmployee> {
  const formData = new FormData();
  formData.append("photo", file);
  return apiRequest<DjangoEmployee>(
    `/staff/employees/${employeeId}/photo/`,
    { method: "PUT", formData },
  ).then(normalizeEmployee);
}

export function deleteEmployeePhoto(employeeId: number): Promise<void> {
  return apiRequest<void>(`/staff/employees/${employeeId}/photo/`, {
    method: "DELETE",
  });
}

// ── API functions — elQR ──────────────────────────────────────────────────────

export function uploadEmployeeElqr(
  employeeId: number,
  file: File,
): Promise<DjangoEmployee> {
  const formData = new FormData();
  formData.append("elqr", file);
  return apiRequest<DjangoEmployee>(
    `/staff/employees/${employeeId}/elqr/`,
    { method: "PUT", formData },
  ).then(normalizeEmployee);
}

export function deleteEmployeeElqr(employeeId: number): Promise<void> {
  return apiRequest<void>(`/staff/employees/${employeeId}/elqr/`, {
    method: "DELETE",
  });
}

// ── API functions — Services ──────────────────────────────────────────────────

export function getEmployeeServices(
  employeeId: number,
  signal?: AbortSignal,
  options?: { includeInactive?: boolean },
): Promise<EmployeeServiceAssignment[]> {
  const query = options?.includeInactive ? "?includeInactive=true" : "";
  return apiRequest<EmployeeServiceAssignment[]>(
    `/staff/employees/${employeeId}/services/${query}`,
    { signal },
  ).then((items) => (Array.isArray(items) ? items : []));
}

export function assignEmployeeService(
  employeeId: number,
  payload: EmployeeServiceCreatePayload,
): Promise<EmployeeServiceAssignment> {
  return apiRequest<EmployeeServiceAssignment>(
    `/staff/employees/${employeeId}/services/`,
    { method: "POST", body: payload },
  );
}

export function updateEmployeeService(
  employeeId: number,
  assignmentId: number,
  payload: EmployeeServiceUpdatePayload,
): Promise<EmployeeServiceAssignment> {
  return apiRequest<EmployeeServiceAssignment>(
    `/staff/employees/${employeeId}/services/${assignmentId}/`,
    { method: "PATCH", body: payload },
  );
}

// ── API functions — Specializations ──────────────────────────────────────────

export function getSpecializations(
  signal?: AbortSignal,
  options?: { includeInactive?: boolean },
): Promise<DjangoSpecialization[]> {
  const query = options?.includeInactive ? "?includeInactive=1" : "";
  return apiRequest<DjangoSpecialization[]>(`/staff/specializations/${query}`, { signal }).then(
    (items) => (Array.isArray(items) ? items : []),
  );
}

export function createSpecialization(
  payload: SpecializationCreatePayload,
): Promise<DjangoSpecialization> {
  return apiRequest<DjangoSpecialization>("/staff/specializations/", {
    method: "POST",
    body: payload,
  });
}

export function updateSpecialization(
  specializationId: number,
  payload: SpecializationUpdatePayload,
): Promise<DjangoSpecialization> {
  return apiRequest<DjangoSpecialization>(
    `/staff/specializations/${specializationId}/`,
    { method: "PATCH", body: payload },
  );
}

export function linkSpecializationToEmployee(
  employeeId: number,
  specializationId: number,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(
    `/staff/employees/${employeeId}/specializations/${specializationId}/`,
    { method: "POST", body: { specializationId } },
  );
}

export function unlinkSpecializationFromEmployee(
  employeeId: number,
  specializationId: number,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(
    `/staff/employees/${employeeId}/specializations/${specializationId}/`,
    { method: "DELETE" },
  );
}

// ── API functions — Documents ─────────────────────────────────────────────────

export function getEmployeeDocuments(
  employeeId: number,
  signal?: AbortSignal,
): Promise<EmployeeDocumentItem[]> {
  return apiRequest<EmployeeDocumentItem[]>(
    `/staff/employees/${employeeId}/documents/`,
    { signal },
  ).then((items) => (Array.isArray(items) ? items : []));
}

export function uploadEmployeeDocument(
  employeeId: number,
  file: File,
  title: string,
): Promise<EmployeeDocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  return apiRequest<EmployeeDocumentItem>(
    `/staff/employees/${employeeId}/documents/`,
    { method: "POST", formData },
  );
}

export function renameEmployeeDocument(
  employeeId: number,
  documentId: number,
  title: string,
): Promise<EmployeeDocumentItem> {
  return apiRequest<EmployeeDocumentItem>(
    `/staff/employees/${employeeId}/documents/${documentId}/`,
    { method: "PATCH", body: { title } },
  );
}

export function deleteEmployeeDocument(
  employeeId: number,
  documentId: number,
): Promise<void> {
  return apiRequest<void>(
    `/staff/employees/${employeeId}/documents/${documentId}/`,
    { method: "DELETE" },
  );
}
