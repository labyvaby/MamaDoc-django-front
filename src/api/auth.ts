import { apiRequest } from "./client";

// ── User ──────────────────────────────────────────────────────────────────────

export type DjangoUser = {
  id: number;
  username: string;
  email: string;
  /** camelCase since backend update */
  firstName: string;
  lastName: string;
  isStaff: boolean;
  isSuperuser: boolean;
};

// ── RBAC shapes (mirrors server/apps/rbac/selectors.py) ───────────────────────

export type RbacOrganization = {
  id: number;
  name: string;
  slug: string;
  status: string;
};

export type RbacBranch = {
  id: number;
  name: string;
  timezone: string;
  isActive: boolean;
};

export type RbacRole = {
  id: number;
  name: string;
  code: string;
} | null;

export type RbacMembership = {
  id: number;
  organization: RbacOrganization;
  role: RbacRole;
  isOwner: boolean;
  isActive: boolean;
  branches: RbacBranch[];
  /** Permission codes for this membership (via its role) */
  permissions: string[];
};

/**
 * Active Employee shape (mirrors server/apps/staff/selectors.py).
 * Backend may return null when current user has no Employee bound to the
 * active organization/branch.
 */
export type ActiveEmployee = {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  nickname: string;
  birthDate: string | null;
  photoUrl: string | null;
  telegramId: string;
  bankAccountNumber: string;
  inn: string;
  status: string;
  branch: { id: number; name: string } | null;
} | null;

/**
 * Full response shape for GET /api/auth/me/ and /api/auth/context/.
 */
export type MeResponse = {
  user: DjangoUser;
  memberships: RbacMembership[];
  activeMembership: RbacMembership | null;
  activeOrganization: RbacOrganization | null;
  activeBranch: RbacBranch | null;
  /** Employee record attached to the currently active org/branch (if any). */
  activeEmployee?: ActiveEmployee;
  /** Flat deduplicated permissions across all memberships.
   *  Superuser → all active permission codes from the database. */
  permissions: string[];
  /** Module codes enabled for the active organization (e.g. "patients", "finance"). */
  enabledModules: string[];
};

/** Payload accepted by POST /api/auth/context/. */
export type SwitchContextPayload = {
  membershipId: number;
  branchId?: number | null;
};

// ── API functions ─────────────────────────────────────────────────────────────

export function login(loginValue: string, password: string) {
  return apiRequest<MeResponse>("/auth/login/", {
    method: "POST",
    body: {
      login: loginValue,
      password,
    },
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/auth/logout/", {
    method: "POST",
  });
}

export function getCurrentUser() {
  return apiRequest<MeResponse>("/auth/me/");
}

/**
 * Returns the currently selected active context for this Django session.
 * Same shape as /api/auth/me/.
 */
export function getAuthContext() {
  return apiRequest<MeResponse>("/auth/context/");
}

/**
 * Switches active membership/branch in the Django session.
 * Backend re-validates that the membership belongs to the caller and that
 * the branch is reachable (active + accessible). Returns the same shape as
 * /api/auth/me/.
 */
export function switchAuthContext(payload: SwitchContextPayload) {
  return apiRequest<MeResponse>("/auth/context/", {
    method: "POST",
    body: {
      membershipId: payload.membershipId,
      branchId: payload.branchId ?? null,
    },
  });
}
