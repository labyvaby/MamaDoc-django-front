import { apiRequest } from "./client";

// ── Organization shape (mirrors OrganizationPayload rename='camel') ──────────

/** Patient registry scope — must match server PatientScope choices. */
export type PatientScope = "shared" | "per_branch";

export interface DjangoOrganization {
  id: number;
  name: string;
  slug: string;
  status: string;
  patientScope: PatientScope;
  createdAt: string;
  updatedAt: string;
}

/** Partial update payload for PATCH /organization/<id>/. */
export interface UpdateOrganizationPayload {
  name?: string;
  slug?: string;
  status?: string;
  patientScope?: PatientScope;
}

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

export function getOrganization(id: number): Promise<DjangoOrganization> {
  return apiRequest<DjangoOrganization>(`/organization/${id}/`);
}

export function updateOrganization(
  id: number,
  payload: UpdateOrganizationPayload,
): Promise<DjangoOrganization> {
  return apiRequest<DjangoOrganization>(`/organization/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function getBranches(): Promise<DjangoBranch[]> {
  return apiRequest<DjangoBranch[]>("/organization/branches/");
}

/** Fields accepted when creating a branch. */
export interface CreateBranchPayload {
  name: string;
  /** Target organization. Required for multi-org superusers (otherwise the
   *  backend infers the wrong organization from the active membership). */
  organizationId?: number;
  address?: string;
  phone?: string;
  timezone?: string;
  isActive?: boolean;
}

/** Partial update payload for PATCH /organization/branches/<id>/. */
export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phone?: string;
  timezone?: string;
  isActive?: boolean;
}

/** POST /organization/branches/ — create a branch in the target organization. */
export function createBranch(payload: CreateBranchPayload): Promise<DjangoBranch> {
  return apiRequest<DjangoBranch>("/organization/branches/", {
    method: "POST",
    body: payload,
  });
}

/** PATCH /organization/branches/<id>/ — update a branch (only sent fields). */
export function updateBranch(
  id: number,
  payload: UpdateBranchPayload,
): Promise<DjangoBranch> {
  return apiRequest<DjangoBranch>(`/organization/branches/${id}/`, {
    method: "PATCH",
    body: payload,
  });
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
