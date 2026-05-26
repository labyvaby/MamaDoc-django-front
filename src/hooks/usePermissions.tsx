import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, switchAuthContext } from '../api';
import type {
  MeResponse,
  RbacMembership,
  RbacOrganization,
  RbacBranch,
  ActiveEmployee,
  SwitchContextPayload,
} from '../api/auth';
import { IS_DJANGO_BACKEND } from '../config/backend';
import { supabase } from '../utility/supabaseClient';
import type { Role, Permission, UserPermissions, RoleName, PermissionCheck } from '../types/rbac';

// Глобальное кэширование прав, чтобы исключить повторные запросы из разных мест
// и не триггерить рефетч при сворачивании/возврате вкладки.

type GlobalState = {
  role: Role | null;
  employee: any | null;
  permissions: Permission[];
  loading: boolean;
  loaded: boolean; // хотя бы одна загрузка уже была (успех/неуспех)
  lastFetchedAt: number; // timestamp последней попытки
  employeeId?: string | null;
  currentUserId?: string | null;
  // ── Django-only active context ──────────────────────────────────────────
  memberships: RbacMembership[];
  activeMembership: RbacMembership | null;
  activeOrganization: RbacOrganization | null;
  activeBranch: RbacBranch | null;
  activeEmployee: ActiveEmployee;
  switching: boolean;
};

let globalState: GlobalState = {
  role: null,
  employee: null,
  permissions: [],
  loading: true, // Начинаем с loading: true, чтобы не показывать контент до загрузки
  loaded: false,
  lastFetchedAt: 0,
  employeeId: null,
  currentUserId: null,
  memberships: [],
  activeMembership: null,
  activeOrganization: null,
  activeBranch: null,
  activeEmployee: null,
  switching: false,
};

let inFlight: Promise<void> | null = null;
const listeners = new Set<(s: GlobalState) => void>();
const COOLDOWN_MS = 10_000; // не чаще, чем раз в 10 секунд по принудительным событиям

const notify = () => {
  for (const fn of listeners) fn(globalState);
};

const setGlobal = (patch: Partial<GlobalState>) => {
  globalState = { ...globalState, ...patch };
  notify();
};

type RolePermissionsRow = { permissions?: Permission | Permission[] | null };

/**
 * Build a partial GlobalState patch from a Django /api/auth/me/ response.
 * Used both by the initial fetch and by switchContext().
 */
function buildStateFromMe(meData: MeResponse): Partial<GlobalState> {
  const { user, activeMembership, permissions: permCodes } = meData;

  const roleName: RoleName = user.isSuperuser
    ? 'superadmin'
    : activeMembership?.isOwner
    ? 'owner'
    : activeMembership?.role?.code
    ? (activeMembership.role.code as RoleName)
    : user.isStaff
    ? 'admin'
    : 'registrator';

  const role: Role = {
    id: String(activeMembership?.id ?? user.id),
    name: roleName,
    display_name: activeMembership?.role?.name ?? roleName,
    description: 'Django RBAC user',
    created_at: '',
    updated_at: '',
  };

  const permissions: Permission[] = permCodes.map((code) => ({
    id: code,
    name: code,
    display_name: code,
    description: '',
    resource: code.split('.')[0] ?? code,
    action: code.split('.')[1] ?? '',
    created_at: '',
  }));

  return {
    role,
    employee: {
      ...user,
      activeMembership,
      memberships: meData.memberships,
      activeEmployee: meData.activeEmployee ?? null,
    },
    permissions,
    loaded: true,
    loading: false,
    employeeId: String(user.id),
    currentUserId: String(user.id),
    memberships: meData.memberships ?? [],
    activeMembership: activeMembership ?? null,
    activeOrganization: meData.activeOrganization ?? null,
    activeBranch: meData.activeBranch ?? null,
    activeEmployee: meData.activeEmployee ?? null,
  };
}

/**
 * Switches active membership/branch via POST /api/auth/context/ and updates
 * the global permissions cache with the response. Throws on backend rejection
 * so callers can show an error toast without leaving the cache in a bad state.
 */
export async function switchContext(payload: SwitchContextPayload): Promise<MeResponse> {
  if (!IS_DJANGO_BACKEND) {
    throw new Error('switchContext is only available in Django backend mode');
  }

  setGlobal({ switching: true });
  try {
    const meData = await switchAuthContext(payload);
    setGlobal({
      ...buildStateFromMe(meData),
      switching: false,
      lastFetchedAt: Date.now(),
    });
    return meData;
  } catch (err) {
    setGlobal({ switching: false });
    throw err;
  }
}

const extractPermissions = (rolePermissions: RolePermissionsRow[] | null | undefined): Permission[] => {
  return rolePermissions?.flatMap((rp) => {
    const perms = rp?.permissions;
    if (!perms) return [] as Permission[];
    return Array.isArray(perms) ? perms : [perms];
  }) ?? [];
};

async function fetchPermissions(opts: { force?: boolean } = {}): Promise<void> {
  const { force = false } = opts;

  // Уже идёт запрос — дождёмся его
  if (inFlight) return inFlight;

  // Троттлинг даже для форсированных событиях (чтобы не спамить при Alt+Tab)
  const now = Date.now();
  if (!force && globalState.loaded && (now - globalState.lastFetchedAt < COOLDOWN_MS)) {
    return;
  }

  inFlight = (async () => {
    try {
      // Если это перезагрузка (уже loaded: true), не показываем loading
      // чтобы избежать "моргания" UI при переключении вкладок
      const showLoading = !globalState.loaded;
      setGlobal({ loading: showLoading, lastFetchedAt: Date.now() });

      if (IS_DJANGO_BACKEND) {
        const meData = (await getCurrentUser()) as MeResponse;
        setGlobal(buildStateFromMe(meData));
        return;
      }

      // 1) Текущая сессия (без отдельного запроса user)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData?.session?.user ?? null;

      // OPTIMIZATION: If user is same and data already loaded, don't refetch
      if (!force && globalState.loaded && globalState.currentUserId === user?.id) {
        setGlobal({ loading: false });
        return;
      }

      if (sessionError || !user) {
        setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true, currentUserId: null });
        return;
      }

      // 2) Загружаем сотрудника и права (Объединенный запрос)
      // Пытаемся сразу найти по auth_user_id. Если нет — ищем через таблицу связей.
      const buildSelect = () => `
        *,
        roles (
          id,
          name,
          display_name,
          description,
          created_at,
          updated_at,
          role_permissions (
            permissions (
              id,
              name,
              display_name,
              description,
              resource,
              action,
              created_at
            )
          )
        )
      `;

      let { data: employee, error: employeeError } = await supabase
        .from('Employees')
        .select(buildSelect())
        .eq('auth_user_id', user.id)
        .maybeSingle();

      // Fallback: search by email or phone from session user if not found by id
      if (!employee && !employeeError) {
        const filters = [];
        if (user.email) filters.push(`email.eq.${user.email}`);
        if (user.phone) filters.push(`phone.ilike.%${user.phone.slice(-9)}`);

        if (filters.length > 0) {
          const { data: fallbackEmp } = await supabase
            .from('Employees')
            .select(buildSelect())
            .or(filters.join(','))
            .maybeSingle();

          if (fallbackEmp) {
            employee = fallbackEmp as any;
          }
        }
      }

      if (!employee && !employeeError) {
        // Пытаемся через таблицу связей
        const { data: linkData } = await supabase
          .from('employee_auth_links')
          .select('employee_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (linkData?.employee_id) {
          const res = await supabase
            .from('Employees')
            .select(buildSelect())
            .eq('id', linkData.employee_id)
            .maybeSingle();
          employee = res.data as any;
          employeeError = res.error as any;
        }
      }

      if (employeeError || !employee || !(employee as any).roles) {
        // Нет записи сотрудника или роли — кэшируем отрицательный результат
        setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true, currentUserId: user.id });
        return;
      }

      const emp = employee as any;
      const userRole = emp.roles as unknown as Role & {
        role_permissions?: RolePermissionsRow[] | null;
      };

      const perms = extractPermissions(userRole.role_permissions ?? []);
      setGlobal({
        role: userRole,
        employee: emp, // Store full employee object
        permissions: perms,
        loading: false,
        loaded: true,
        employeeId: emp.id,
        currentUserId: user.id
      });
    } catch (error) {
      console.error('Ошибка загрузки прав доступа:', error);
      setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

let authSub: { unsubscribe: () => void } | null = null;
function ensureAuthSubscription() {
  if (IS_DJANGO_BACKEND) return;

  if (authSub) return;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    switch (event) {
      case 'SIGNED_IN':
        // Форсируем только если это новый пользователь (сменился user.id)
        // Если тот же пользователь (TOKEN_REFRESHED маскируется как SIGNED_IN) — не сбрасываем
        void supabase.auth.getSession().then(({ data }) => {
          const newUserId = data?.session?.user?.id ?? null;
          if (newUserId !== globalState.currentUserId) {
            setGlobal({ loaded: false, currentUserId: null });
            void fetchPermissions({ force: true });
          }
        });
        break;
      case 'USER_UPDATED':
        // При USER_UPDATED (например, смена фокуса может провоцировать проверку токена)
        // НЕ делаем force рефетч, если ID пользователя тот же.
        void fetchPermissions({ force: false });
        break;
      case 'SIGNED_OUT':
        // Очищаем данные; повторная загрузка пойдёт при следующем SIGNED_IN
        setGlobal({ role: null, employee: null, permissions: [], loading: false, loaded: true, currentUserId: null });
        break;
      case 'INITIAL_SESSION':
      case 'TOKEN_REFRESHED':
      default:
        // Игнорируем, чтобы не дёргать лишние рефетчи на фокусе/обновлении токена
        break;
    }
  });
  authSub = subscription;

  // После того как useAuthIdentitySync сделал linking, он диспатчит это событие.
  // Форсируем перезагрузку прав с новым auth_user_id.
  window.addEventListener('auth-identity-synced', () => {
    setGlobal({ loaded: false, currentUserId: null });
    void fetchPermissions({ force: true });
  });
}

/**
 * Хук для работы с правами доступа пользователя.
 * Использует глобальный кэш и троттлинг, чтобы исключить дубликаты.
 */
export const usePermissions = (): UserPermissions & PermissionCheck => {
  const [state, setState] = useState<GlobalState>(globalState);

  useEffect(() => {
    listeners.add(setState);
    ensureAuthSubscription();

    // Инициируем загрузку только если ещё не загружали (или был сброс)
    if (!globalState.loaded) {
      void fetchPermissions();
    }

    return () => {
      listeners.delete(setState);
    };
  }, []);

  // Хелперы
  const hasPermission = useCallback(
    (permission: string | string[]): boolean => {
      if (state.loading) return false;
      if (!state.permissions.length) return false;
      if (state.role?.name === 'superadmin') return true;
      const permissionsToCheck = Array.isArray(permission) ? permission : [permission];
      return permissionsToCheck.some((perm) => state.permissions.some((p) => p.name === perm));
    },
    [state.loading, state.permissions, state.role]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (state.loading) return false;
      if (!state.permissions.length) return false;
      if (state.role?.name === 'superadmin') return true;
      return perms.some((perm) => state.permissions.some((p) => p.name === perm));
    },
    [state.loading, state.permissions, state.role]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      if (state.loading) return false;
      if (!state.permissions.length) return false;
      if (state.role?.name === 'superadmin') return true;
      return perms.every((perm) => state.permissions.some((p) => p.name === perm));
    },
    [state.loading, state.permissions, state.role]
  );

  const hasRole = useCallback(
    (roleName: RoleName | RoleName[]): boolean => {
      if (state.loading) return false;
      if (!state.role) return false;

      const rolesToCheck = Array.isArray(roleName) ? roleName : [roleName];
      const currentRoleName = state.role.name?.toLowerCase().trim();

      return rolesToCheck.some(r => r.toLowerCase() === currentRoleName);
    },
    [state.loading, state.role]
  );

  const isSuperAdmin = useCallback(() => state.role?.name === 'superadmin', [state.role]);
  const isAdmin = useCallback(() => hasRole(['superadmin', 'admin']), [hasRole]);
  const isRegistrator = useCallback(() => hasRole(['receptionist', 'registrator']), [hasRole]);
  const isDoctor = useCallback(() => hasRole('doctor'), [hasRole]);

  const canManageEmployees = useCallback(() => hasRole(['superadmin', 'admin', 'receptionist', 'registrator']), [hasRole]);
  const canManageExpenses = useCallback(() => hasRole(['superadmin', 'admin', 'registrator', 'receptionist', 'manager']), [hasRole]);

  return {
    role: state.role,
    permissions: state.permissions,
    loading: state.loading,
    employeeId: state.employeeId,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isSuperAdmin,
    isAdmin,
    isRegistrator,
    isDoctor,
    isNurse: useCallback(() => hasRole('nurse'), [hasRole]),
    canManageEmployees,
    canManageExpenses,
    employee: state.employee,
    // Active Django context — null/empty in Supabase mode.
    memberships: state.memberships,
    activeMembership: state.activeMembership,
    activeOrganization: state.activeOrganization,
    activeBranch: state.activeBranch,
    activeEmployee: state.activeEmployee,
    switching: state.switching,
    switchContext,
  };
};

/** Быстрые хелперы */
export const useHasPermission = (permission: string | string[]): boolean => {
  const { hasPermission } = usePermissions();
  return hasPermission(permission);
};

export const useHasRole = (roleName: RoleName | RoleName[]): boolean => {
  const { hasRole } = usePermissions();
  return hasRole(roleName);
};
