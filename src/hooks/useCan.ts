import { usePermissions } from './usePermissions';

/**
 * Shortcut hook — returns true if the current user can access the permission.
 * Платформенный администратор обходит ролевую проверку, но не модульный
 * скоуп активной организации. Пока права загружаются — false.
 *
 * @example
 * const canViewPatients = useCan('patients.view');
 */
export function useCan(permission: string | string[]): boolean {
  const { canAccess, loading } = usePermissions();
  if (loading) return false;
  const perms = Array.isArray(permission) ? permission : [permission];
  return perms.some((p) => canAccess!(p));
}

/**
 * Returns a stable `can(permission)` checker function.
 * Useful when you need to check multiple permissions imperatively.
 * In Django mode, `can` uses canAccess (permission + module check).
 *
 * @example
 * const { can, loading } = useCanChecker();
 * if (can('finance.view')) { ... }
 */
export function useCanChecker() {
  const { canAccess, loading } = usePermissions();
  return {
    loading,
    can: (permission: string | string[]) => {
      if (loading) return false;
      const perms = Array.isArray(permission) ? permission : [permission];
      return perms.some((p) => canAccess!(p));
    },
  };
}
