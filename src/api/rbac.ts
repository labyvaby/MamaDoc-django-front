import { apiRequest } from "./client";

// ── Permission ──────────────────────────────────────────────────────────────

/**
 * Mirrors server/apps/rbac/api/payloads.py PermissionPayload (rename='camel').
 */
export interface RbacPermission {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
}

// ── Role ────────────────────────────────────────────────────────────────────

/**
 * Mirrors server/apps/rbac/api/payloads.py RolePayload (rename='camel').
 * `permissions` is a list of active permission codes assigned to this role.
 */
export interface RbacRole {
  id: number;
  organizationId: number;
  name: string;
  code: string;
  description: string;
  isSystem: boolean;
  /** List of active permission codes assigned to this role. */
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors RoleCreatePayload (rename='camel').
 */
export interface RoleCreatePayload {
  name: string;
  code: string;
  organizationId?: number | null;
  description?: string;
  permissionCodes?: string[] | null;
}

/**
 * Mirrors RoleUpdatePayload (rename='camel').
 * All fields optional; permissionCodes omitted means "don't touch",
 * null means "clear all".
 */
export interface RoleUpdatePayload {
  name?: string | null;
  code?: string | null;
  description?: string | null;
  /** Omit to leave permissions unchanged. null clears all. */
  permissionCodes?: string[] | null;
}

// ── Membership ────────────────────────────────────────────────────────────────

/** Compact role embedded in a membership (server RoleShort). */
export interface RbacRoleShort {
  id: number;
  name: string;
  code: string;
}

/** Compact branch embedded in a membership (server BranchShort). */
export interface RbacBranchShort {
  id: number;
  name: string;
}

/**
 * Mirrors server/apps/rbac/api/payloads.py MembershipPayload (rename='camel').
 * `branches` are the branches the user can see in the CRM (UserBranchAccess).
 */
export interface RbacMembership {
  id: number;
  userId: number;
  username: string;
  email: string;
  organizationId: number;
  role: RbacRoleShort | null;
  isOwner: boolean;
  isActive: boolean;
  branches: RbacBranchShort[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors MembershipUpdatePayload (rename='camel').
 * Omit a field to leave it unchanged. For `branchIds`, null clears CRM access.
 */
export interface MembershipUpdatePayload {
  roleId?: number | null;
  isOwner?: boolean;
  isActive?: boolean;
  /** Omit to leave unchanged; null clears all CRM branch access. */
  branchIds?: number[] | null;
}

// ── API functions ───────────────────────────────────────────────────────────

export function getPermissions(): Promise<RbacPermission[]> {
  return apiRequest<RbacPermission[]>("/rbac/permissions/").then((items) =>
    Array.isArray(items) ? items : [],
  );
}

export function getRoles(): Promise<RbacRole[]> {
  return apiRequest<RbacRole[]>("/rbac/roles/").then((items) =>
    Array.isArray(items) ? items : [],
  );
}

export function getRole(id: number): Promise<RbacRole> {
  return apiRequest<RbacRole>(`/rbac/roles/${id}/`);
}

export function createRole(payload: RoleCreatePayload): Promise<RbacRole> {
  return apiRequest<RbacRole>("/rbac/roles/", {
    method: "POST",
    body: payload,
  });
}

export function updateRole(
  id: number,
  payload: RoleUpdatePayload,
): Promise<RbacRole> {
  return apiRequest<RbacRole>(`/rbac/roles/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function getMemberships(): Promise<RbacMembership[]> {
  return apiRequest<RbacMembership[]>("/rbac/memberships/").then((items) =>
    Array.isArray(items) ? items : [],
  );
}

export function updateMembership(
  id: number,
  payload: MembershipUpdatePayload,
): Promise<RbacMembership> {
  return apiRequest<RbacMembership>(`/rbac/memberships/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}
