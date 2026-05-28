import { apiRequest } from "./client";

// ── Employee shapes ──────────────────────────────────────────────────────────

export interface DjangoEmployeeBranch {
  id: number;
  name: string;
}

export interface DjangoEmployee {
  id: number;
  organizationId: number;
  branch: DjangoEmployeeBranch | null;
  authUserId: number | null;
  fullName: string;
  phone: string;
  email: string;
  nickname: string;
  birthDate: string | null;
  telegramId: string;
  bankAccountNumber: string;
  inn: string;
  status: "active" | "inactive" | "fired";
  createdAt: string;
  updatedAt: string;
}

// ── Onboard payload (mirrors EmployeeOnboardPayload rename='camel') ───────────

export interface OnboardEmployeePayload {
  fullName: string;
  roleId: number;
  employeeBranchIds: number[];

  organizationId?: number | null;

  // user fields
  userId?: number | null;
  email?: string;
  phone?: string;
  username?: string | null;
  password?: string | null;
  firstName?: string;
  lastName?: string;

  // branch access overrides
  userBranchAccessIds?: number[] | null;
  branchId?: number | null;

  // employee extras
  status?: "active" | "inactive" | "fired";
  specializationIds?: number[] | null;
  notes?: string;
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

// ── EmployeeService shapes (mirrors staff/api/payloads.py) ───────────────────

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

// ── API functions ─────────────────────────────────────────────────────────────

export function getEmployeeServices(
  employeeId: number,
): Promise<EmployeeServiceAssignment[]> {
  return apiRequest<EmployeeServiceAssignment[]>(
    `/staff/employees/${employeeId}/services/`,
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

export function onboardEmployee(
  payload: OnboardEmployeePayload,
): Promise<OnboardEmployeeResponse> {
  return apiRequest<OnboardEmployeeResponse>("/staff/employees/onboard/", {
    method: "POST",
    body: payload,
  });
}

export function getDjangoEmployees(): Promise<DjangoEmployee[]> {
  return apiRequest<DjangoEmployee[]>("/staff/employees/");
}
