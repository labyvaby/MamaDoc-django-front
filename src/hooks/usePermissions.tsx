import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, switchAuthContext, userHasPassword } from "../api";
import type { MeResponse, RbacMembership, RbacOrganization, RbacBranch, ActiveEmployee, SwitchContextPayload } from "../api/auth";
import { ApiError } from "../api/client";
import type { Role, Permission, UserPermissions, RoleName, PermissionCheck, AuthStatus } from "../types/rbac";
import { getModuleCodeForPermission } from "../utils/moduleMapping";
import { keepsClinicView, visibleModules } from "../config/moduleView";

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
  /** Есть ли у пользователя пароль (из /auth/me/); null — бэк не прислал поле. */
  hasPassword: boolean | null;
  /** Суперпользователь платформы (user.isSuperuser из /auth/me/). Не путать с
   *  ролью «superadmin» внутри организации: модули переключает только он. */
  isPlatformAdmin: boolean;
  /** Модули организации из /auth/me/ (organizationModules); null — бэк не прислал. */
  organizationModules: string[] | null;
  /** Режим «Меню как у клиники» (только суперпользователь). Живёт в памяти
   *  вкладки: /auth/me/ и смена организации его не трогают. */
  viewAsOrganization: boolean;
};

let globalState: GlobalState = {
  role: null, employee: null, permissions: [], loading: true, loaded: false,
  lastFetchedAt: 0, employeeId: null, memberships: [], activeMembership: null,
  activeOrganization: null, activeBranch: null, activeEmployee: null,
  switching: false, enabledModules: [], authStatus: "loading", authError: null, hasPassword: null,
  isPlatformAdmin: false, organizationModules: null, viewAsOrganization: false,
};
let inFlight: Promise<void> | null = null;
const listeners = new Set<(state: GlobalState) => void>();
const COOLDOWN_MS = 10_000;
let authEpoch = 0;
const notify = () => listeners.forEach((listener) => listener(globalState));
const setGlobal = (patch: Partial<GlobalState>) => { globalState = { ...globalState, ...patch }; notify(); };

export function buildStateFromMe(meData: MeResponse): Partial<GlobalState> {
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
    hasPassword: userHasPassword(user),
    isPlatformAdmin: Boolean(user.isSuperuser),
    organizationModules: meData.organizationModules ?? null,
  };
}

export function applyMeResponse(meData: MeResponse): void {
  authEpoch += 1;
  // Вход — новая сессия: режим «Меню как у клиники» не наследуется.
  setGlobal({ ...buildStateFromMe(meData), viewAsOrganization: false, lastFetchedAt: Date.now() });
}

/** Пароль только что установлен (форма в профиле): убрать кнопку в шапке
 *  сразу, не дожидаясь повторного /auth/me/. */
export function markPasswordSet(): void {
  setGlobal({ hasPassword: true });
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
        setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true, authStatus: "unauthenticated", authError: null, hasPassword: null, isPlatformAdmin: false, organizationModules: null, viewAsOrganization: false });
      } else {
        setGlobal({
          ...buildStateFromMe(meData),
          viewAsOrganization: keepsClinicView(globalState.viewAsOrganization, globalState.employeeId, meData),
          lastFetchedAt: Date.now(),
        });
      }
    } catch (error) {
      if (epoch !== authEpoch) return;
      const status = error instanceof ApiError ? error.status : -1;
      if (status === 401) {
        setGlobal({ role: null, employee: null, permissions: [], memberships: [], activeMembership: null, activeOrganization: null, activeBranch: null, activeEmployee: null, enabledModules: [], loading: false, loaded: true, authStatus: "unauthenticated", authError: null, hasPassword: null, isPlatformAdmin: false, organizationModules: null, viewAsOrganization: false });
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
    setGlobal({
      ...buildStateFromMe(meData),
      viewAsOrganization: keepsClinicView(globalState.viewAsOrganization, globalState.employeeId, meData),
      switching: false,
      lastFetchedAt: Date.now(),
    });
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

/** Включить/выключить «Меню как у клиники» (страница «Модули»). */
export function setViewAsOrganization(on: boolean): void {
  setGlobal({ viewAsOrganization: on });
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
  // Django-суперпользователь получает от /auth/me все активные модули, чтобы
  // видеть новые возможности для настройки. Защищённая роль superadmin без
  // глобального флага по-прежнему ограничивается модулями своей организации.
  // В режиме «Меню как у клиники» суперпользователь видит модули выбранной
  // организации (visibleModules) — все гейты ниже идут через `modules`.
  const modules = visibleModules(state);
  const hasModule = useCallback((code: string) => modules.includes(code), [modules]);
  const canAccess = useCallback((code: string) => {
    const module = getModuleCodeForPermission(code);
    if (module !== null && !modules.includes(module)) return false;
    return hasPermission(code);
  }, [hasPermission, modules]);
  const canManageEmployees = useCallback(() => canAccess("staff.update"), [canAccess]);
  const canManageExpenses = useCallback(() => canAccess("finance.expense.manage"), [canAccess]);
  return {
    role: state.role, permissions: state.permissions, loading: state.loading, employeeId: state.employeeId,
    hasPermission, hasAnyPermission, hasAllPermissions, hasRole, isSuperAdmin, isAdmin, isRegistrator, isDoctor,
    isNurse: useCallback(() => hasRole("nurse"), [hasRole]), canManageEmployees, canManageExpenses,
    employee: state.employee, memberships: state.memberships, activeMembership: state.activeMembership,
    activeOrganization: state.activeOrganization, activeBranch: state.activeBranch, activeEmployee: state.activeEmployee,
    switching: state.switching, switchContext, enabledModules: modules, hasModule, canAccess,
    authStatus: state.authStatus, authError: state.authError, retryAuth,
    hasPassword: state.hasPassword,
    isPlatformAdmin: state.isPlatformAdmin,
    organizationModules: state.organizationModules,
    viewAsOrganization: state.viewAsOrganization,
    setViewAsOrganization,
  };
};

export const useHasPermission = (permission: string | string[]) => usePermissions().hasPermission(permission);
export const useHasRole = (roleName: RoleName | RoleName[]) => usePermissions().hasRole(roleName);
