import { usePermissions } from './usePermissions';

/**
 * Shortcut hook — returns true if the current user can access the permission.
 * Superadmin always returns true. Returns false while permissions are loading.
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
  const { canAccess, isSuperAdmin, loading } = usePermissions();
  return {
    loading,
    can: (permission: string | string[]) => {
      if (loading) return false;
      if (isSuperAdmin()) return true;
      const perms = Array.isArray(permission) ? permission : [permission];
      return perms.some((p) => canAccess!(p));
    },
  };
}
