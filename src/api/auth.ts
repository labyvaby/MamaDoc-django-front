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
  /** URL логотипа организации. Опционально: бэкенд добавит поле в селектор
   *  /auth/me/ по тикету MamaDoc/backend_ticket_organization_logo.md;
   *  до этого поле отсутствует и UI показывает иконку-заглушку. */
  logoUrl?: string | null;
};

export type RbacBranch = {
  id: number;
  name: string;
  timezone: string;
  isActive: boolean;
  /** URL логотипа филиала. Опционально: бэкенд добавит поле в селектор
   *  /auth/me/ по тикету MamaDoc/backend_tickets_2026-07-13/backend_ticket_branch_logo.md;
   *  до этого поле отсутствует и UI показывает иконку-заглушку. */
  logoUrl?: string | null;
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

/**
 * Set a new password for the current user. The current password is not
 * required (employees are created without one — login is by email/phone),
 * so this also works for the first-time password set. The backend validates
 * the new password and refreshes the session so the user stays logged in.
 */
export function changePassword(newPassword: string) {
  return apiRequest<{ ok: true }>("/auth/change-password/", {
    method: "POST",
    body: { newPassword },
  });
}

/** Self-service profile fields a user may edit about themselves. */
export type ProfileUpdatePayload = {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  nickname?: string | null;
  birthDate?: string | null;
  telegramId?: string | null;
  bankAccountNumber?: string | null;
  inn?: string | null;
};

/** Returns the current user's own Employee profile (active organization). */
export function getProfile() {
  return apiRequest<{ profile: ActiveEmployee }>("/auth/profile/");
}

/** Updates the current user's own Employee profile (active organization). */
export function updateProfile(payload: ProfileUpdatePayload) {
  return apiRequest<{ profile: ActiveEmployee }>("/auth/profile/", {
    method: "PATCH",
    body: payload,
  });
}

/** A document attached to the current user's own Employee profile. */
export type ProfileDocument = {
  id: number;
  employeeId: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  updatedAt: string;
};

/** List the current user's own profile documents. */
export function getProfileDocuments() {
  return apiRequest<{ documents: ProfileDocument[] }>(
    "/auth/profile/documents/",
  );
}

/** Upload a document to the current user's own profile (self-service). */
export function uploadProfileDocument(file: File, title: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  return apiRequest<{ document: ProfileDocument }>(
    "/auth/profile/documents/",
    { method: "POST", formData: form },
  );
}

/** Delete a document from the current user's own profile. */
export function deleteProfileDocument(documentId: number) {
  return apiRequest<void>(`/auth/profile/documents/${documentId}/`, {
    method: "DELETE",
  });
}

/**
 * Request a one-time SMS login code for a phone number.
 * Always resolves to `{ ok: true }` — the backend never reveals whether the
 * phone belongs to a real account (no enumeration).
 */
export function requestOtp(phone: string) {
  return apiRequest<{ ok: true }>("/auth/otp/request/", {
    method: "POST",
    body: { phone },
  });
}

/**
 * Verify an SMS login code. On success the backend opens a session and
 * returns the same shape as /auth/login/ (the user; full context is then
 * loaded via /auth/me/, mirroring the password login flow).
 */
export function verifyOtp(phone: string, code: string) {
  return apiRequest<MeResponse>("/auth/otp/verify/", {
    method: "POST",
    body: { phone, code },
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
