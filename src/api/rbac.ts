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

// ── API functions ───────────────────────────────────────────────────────────

export function getPermissions(): Promise<RbacPermission[]> {
  return apiRequest<RbacPermission[]>("/rbac/permissions/");
}

export function getRoles(): Promise<RbacRole[]> {
  return apiRequest<RbacRole[]>("/rbac/roles/");
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
