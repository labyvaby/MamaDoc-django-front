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

// ── API functions ─────────────────────────────────────────────────────────────

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
