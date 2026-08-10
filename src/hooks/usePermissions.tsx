import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, switchAuthContext } from "../api";
import type { MeResponse, RbacMembership, RbacOrganization, RbacBranch, ActiveEmployee, SwitchContextPayload } from "../api/auth";
import { ApiError } from "../api/client";
import type { Role, Permission, UserPermissions, RoleName, PermissionCheck, AuthStatus } from "../types/rbac";
import { getModuleCodeForPermission } from "../utils/moduleMapping";

type GlobalState = {
  role: Role | null;
  employee: any | null;
  permissions: Permission[];
  loading: boolean;
  loaded: boolean;
  lastFetchedAt: number;
  employeeId?: string | null;
  memberships: RbacMembership[];
  activeMembership: RbacMembership | null;
  activeOrganization: RbacOrganization | null;
  activeBranch: RbacBranch | null;
  activeEmployee: ActiveEmployee;
  switching: boolean;
  enabledModules: string[];
  authStatus: AuthStatus;
  authError: string | null;
};

let globalState: GlobalState = {
  role: null, employee: null, permissions: [], loading: true, loaded: false,
  lastFetchedAt: 0, employeeId: null, memberships: [], activeMembership: null,
  activeOrganization: null, activeBranch: null, activeEmployee: null,
  switching: false, enabledModules: [], authStatus: "loading", authError: null,
};
let inFlight: Promise<void> | null = null;
const listeners = new Set<(state: GlobalState) => void>();
const COOLDOWN_MS = 10_000;
let authEpoch = 0;
const notify = () => listeners.forEach((listener) => listener(globalState));
const setGlobal = (patch: Partial<GlobalState>) => { globalState = { ...globalState, ...patch }; notify(); };

function buildStateFromMe(meData: MeResponse): Partial<GlobalState> {
  const { user, activeMembership } = meData;
  const memberships = (meData.memberships ?? []).map((membership) => ({
    ...membership,
    branches: Array.isArray(membership.branches) ? membership.branches : [],
    permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
  }));
  const normalizedMembership = activeMembership ? {
    ...activeMembership,
    branches: Array.isArray(activeMembership.branches) ? activeMembership.branches : [],
    permissions: Array.isArray(activeMembership.permissions) ? activeMembership.permissions : [],
  } : null;
  const roleName: RoleName = user.isSuperuser ? "superadmin" : normalizedMembership?.isOwner ? "owner" : (normalizedMembership?.role?.code as RoleName | undefined) ?? (user.isStaff ? "admin" : "registrator");
  const role: Role = {
    id: String(normalizedMembership?.id ?? user.id), name: roleName,
    display_name: normalizedMembership?.role?.name ?? roleName,
    description: "Django RBAC user", created_at: "", updated_at: "",
  };
  const permissions: Permission[] = (meData.permissions ?? []).map((code) => ({
    id: code, name: code, display_name: code, description: "",
    resource: code.split(".")[0] ?? code, action: code.split(".")[1] ?? "",
    created_at: "",
  }));
  return {
    role,
    employee: meData.activeEmployee ? { ...meData.activeEmployee, roles: role } : { id: user.id, fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username, email: user.email, roles: role },
    permissions, loaded: true, loading: false, employeeId: String(user.id),
    memberships, activeMembership: normalizedMembership,
    activeOrganization: meData.activeOrganization ?? null, activeBranch: meData.activeBranch ?? null,
    activeEmployee: meData.activeEmployee ?? null,
    enabledModules: meData.enabledModules ?? [], authStatus: "authenticated" as AuthStatus, authError: null,
  };
}

export function applyMeResponse(meData: MeResponse): void {
  authEpoch += 1;
  setGlobal({ ...buildStateFromMe(meData), lastFetchedAt: Date.now() });
}

async function fetchPermissions(options: { force?: boolean; fresh?: boolean } = {}): Promise<void> {
  const { force = false, fresh = false } = options;
  if (inFlight) {
    if (!fresh) return inFlight;
    await inFlight.catch(() => undefined);
  }
  const now = Date.now();
  if (!force && globalState.loaded && now - globalState.lastFetchedAt < COOLDOWN_MS) return;
  const epoch = authEpoch;
  inFlight = (async () => {
    try {
      setGlobal({ loading: !globalState.loaded, lastFetchedAt: Date.now() });
      const meData = await getCurrentUser();
      if (epoch !== authEpoch) return;
      if (!meData?.user) {
        setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true, authStatus: "unauthenticated", authError: null });
      } else {
        setGlobal({ ...buildStateFromMe(meData), lastFetchedAt: Date.now() });
      }
    } catch (error) {
      if (epoch !== authEpoch) return;
      const status = error instanceof ApiError ? error.status : -1;
      if (status === 401) {
        setGlobal({ role: null, employee: null, permissions: [], memberships: [], activeMembership: null, activeOrganization: null, activeBranch: null, activeEmployee: null, enabledModules: [], loading: false, loaded: true, authStatus: "unauthenticated", authError: null });
      } else {
        const message = error instanceof ApiError ? `Сервер недоступен (${status || "сеть"})` : "Сетевая ошибка";
        const authenticated = globalState.authStatus === "authenticated";
        setGlobal({ loading: false, authStatus: authenticated ? "authenticated" : "unavailable", authError: authenticated ? null : message });
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function refreshAuthContext(): Promise<void> {
  const snapshot = globalState;
  await fetchPermissions({ force: true, fresh: true });
  // A real 401 means the session cookie was not accepted (or has expired).
  // Do not restore the optimistic login state in that case; otherwise the app
  // navigates into a protected page and only fails on its first API request.
  // Temporary network/server failures remain recoverable and keep the context
  // received from the successful login response.
  if (
    snapshot.authStatus === "authenticated" &&
    globalState.authStatus === "unavailable"
  ) {
    authEpoch += 1;
    globalState = { ...snapshot, loading: false, lastFetchedAt: Date.now() };
    notify();
  }
}

export async function switchContext(payload: SwitchContextPayload): Promise<MeResponse> {
  setGlobal({ switching: true });
  try {
    const meData = await switchAuthContext(payload);
    authEpoch += 1;
    setGlobal({ ...buildStateFromMe(meData), switching: false, lastFetchedAt: Date.now() });
    window.dispatchEvent(new Event("mamadoc:django-context-switched"));
    return meData;
  } catch (error) {
    setGlobal({ switching: false });
    throw error;
  }
}

export function retryAuth(): void {
  globalState = { ...globalState, lastFetchedAt: 0 };
  void fetchPermissions({ force: true });
}

if (typeof window !== "undefined") {
  const refetch = () => { if (globalState.authStatus === "authenticated") void fetchPermissions(); };
  window.addEventListener("mamadoc:api-unauthorized", () => void fetchPermissions({ force: true }));
  window.addEventListener("mamadoc:api-forbidden", refetch);
  window.addEventListener("mamadoc:rbac-changed", () => void fetchPermissions({ force: true }));
  window.addEventListener("focus", refetch);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refetch(); });
}

export const usePermissions = (): UserPermissions & PermissionCheck => {
  const [state, setState] = useState<GlobalState>(globalState);
  useEffect(() => {
    listeners.add(setState);
    if (!globalState.loaded) void fetchPermissions();
    return () => { listeners.delete(setState); };
  }, []);
  const hasPermission = useCallback((permission: string | string[]) => {
    if (state.loading || !state.permissions.length) return false;
    if (state.role?.name === "superadmin") return true;
    const requested = Array.isArray(permission) ? permission : [permission];
    return requested.some((code) => state.permissions.some((item) => item.name === code));
  }, [state.loading, state.permissions, state.role]);
  const hasAnyPermission = useCallback((permissions: string[]) => permissions.some(hasPermission), [hasPermission]);
  const hasAllPermissions = useCallback((permissions: string[]) => permissions.every(hasPermission), [hasPermission]);
  const hasRole = useCallback((roleName: RoleName | RoleName[]) => {
    if (state.loading || !state.role) return false;
    const names = [state.role.name, state.activeMembership?.role?.code].filter(Boolean).map((name) => String(name).toLowerCase());
    const requested = Array.isArray(roleName) ? roleName : [roleName];
    return requested.some((name) => names.includes(name.toLowerCase()));
  }, [state.loading, state.role, state.activeMembership]);
  const isSuperAdmin = useCallback(() => state.role?.name === "superadmin", [state.role]);
  const isAdmin = useCallback(() => hasRole(["superadmin", "admin", "administrator"]), [hasRole]);
  const isRegistrator = useCallback(() => hasRole(["receptionist", "registrator"]), [hasRole]);
  const isDoctor = useCallback(() => hasRole("doctor"), [hasRole]);
  const hasModule = useCallback((code: string) => state.role?.name === "superadmin" || state.enabledModules.includes(code), [state.enabledModules, state.role]);
  const canAccess = useCallback((code: string) => {
    if (state.role?.name === "superadmin") return true;
    if (!hasPermission(code)) return false;
    const module = getModuleCodeForPermission(code);
    return module === null || state.enabledModules.includes(module);
  }, [hasPermission, state.enabledModules, state.role]);
  const canManageEmployees = useCallback(() => canAccess("staff.update"), [canAccess]);
  const canManageExpenses = useCallback(() => canAccess("finance.expense.manage"), [canAccess]);
  return {
    role: state.role, permissions: state.permissions, loading: state.loading, employeeId: state.employeeId,
    hasPermission, hasAnyPermission, hasAllPermissions, hasRole, isSuperAdmin, isAdmin, isRegistrator, isDoctor,
    isNurse: useCallback(() => hasRole("nurse"), [hasRole]), canManageEmployees, canManageExpenses,
    employee: state.employee, memberships: state.memberships, activeMembership: state.activeMembership,
    activeOrganization: state.activeOrganization, activeBranch: state.activeBranch, activeEmployee: state.activeEmployee,
    switching: state.switching, switchContext, enabledModules: state.enabledModules, hasModule, canAccess,
    authStatus: state.authStatus, authError: state.authError, retryAuth,
  };
};

export const useHasPermission = (permission: string | string[]) => usePermissions().hasPermission(permission);
export const useHasRole = (roleName: RoleName | RoleName[]) => usePermissions().hasRole(roleName);
