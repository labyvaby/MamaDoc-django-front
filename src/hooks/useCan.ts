import { usePermissions } from './usePermissions';

/**
 * Shortcut hook — returns true if the current user has the given permission.
 * Superadmin always returns true. Returns false while permissions are loading.
 *
 * @example
 * const canViewPatients = useCan('patients.view');
 */
export function useCan(permission: string | string[]): boolean {
  const { hasPermission, loading } = usePermissions();
  if (loading) return false;
  return hasPermission(permission);
}

/**
 * Returns a stable `can(permission)` checker function.
 * Useful when you need to check multiple permissions imperatively.
 *
 * @example
 * const { can, loading } = useCanChecker();
 * if (can('finance.view')) { ... }
 */
export function useCanChecker() {
  const { hasPermission, isSuperAdmin, loading } = usePermissions();
  return {
    loading,
    can: (permission: string | string[]) => {
      if (loading) return false;
      if (isSuperAdmin()) return true;
      return hasPermission(permission);
    },
  };
}
