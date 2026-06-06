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
  status: "active" | "inactive" | "fired";
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
  status: "active" | "inactive" | "fired";
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
  return apiRequest<PaginatedDjangoEmployees>(`/staff/employees/${query}`, { signal });
}

export function getDjangoEmployee(
  employeeId: number,
  signal?: AbortSignal,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/`, { signal });
}

export function updateEmployee(
  employeeId: number,
  payload: UpdateEmployeePayload,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function fireEmployee(
  employeeId: number,
): Promise<DjangoEmployee> {
  return apiRequest<DjangoEmployee>(`/staff/employees/${employeeId}/fire/`, {
    method: "POST",
    body: { confirm: true },
  });
}

export function onboardEmployee(
  payload: OnboardEmployeePayload,
): Promise<OnboardEmployeeResponse> {
  return apiRequest<OnboardEmployeeResponse>("/staff/employees/onboard/", {
    method: "POST",
    body: payload,
  });
}

// ── API functions — Services ──────────────────────────────────────────────────

export function getEmployeeServices(
  employeeId: number,
  signal?: AbortSignal,
): Promise<EmployeeServiceAssignment[]> {
  return apiRequest<EmployeeServiceAssignment[]>(
    `/staff/employees/${employeeId}/services/`,
    { signal },
  );
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
): Promise<DjangoSpecialization[]> {
  return apiRequest<DjangoSpecialization[]>("/staff/specializations/", { signal });
}

export function createSpecialization(
  payload: SpecializationCreatePayload,
): Promise<DjangoSpecialization> {
  return apiRequest<DjangoSpecialization>("/staff/specializations/", {
    method: "POST",
    body: payload,
  });
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
  );
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
