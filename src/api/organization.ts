import { apiRequest } from "./client";

// ── Branch shape (mirrors BranchPayload rename='camel') ──────────────────────

export interface DjangoBranch {
  id: number;
  organizationId: number;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export function getBranches(): Promise<DjangoBranch[]> {
  return apiRequest<DjangoBranch[]>("/organization/branches/");
}

/**
 * Soft-delete (archive) an organization regardless of related data.
 * Backend marks status=archived; nothing is physically removed. Returns 204.
 */
export function deleteOrganization(id: number): Promise<void> {
  return apiRequest<void>(`/organization/${id}/`, { method: "DELETE" });
}

/**
 * Soft-delete (deactivate) a branch regardless of related data.
 * Backend marks is_active=false; nothing is physically removed. Returns 204.
 */
export function deleteBranch(id: number): Promise<void> {
  return apiRequest<void>(`/organization/branches/${id}/`, {
    method: "DELETE",
  });
}
