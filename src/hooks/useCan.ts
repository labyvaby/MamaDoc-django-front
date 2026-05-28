import { usePermissions } from './usePermissions';
import { IS_DJANGO_BACKEND } from '../config/backend';

/**
 * Shortcut hook — returns true if the current user can access the given
 * permission. In Django mode uses canAccess (permission + module check).
 * In Supabase mode falls back to hasPermission only.
 * Superadmin always returns true. Returns false while permissions are loading.
 *
 * @example
 * const canViewPatients = useCan('patients.view');
 */
export function useCan(permission: string | string[]): boolean {
  const { hasPermission, canAccess, loading } = usePermissions();
  if (loading) return false;
  if (IS_DJANGO_BACKEND) {
    const perms = Array.isArray(permission) ? permission : [permission];
    return perms.some((p) => canAccess!(p));
  }
  return hasPermission(permission);
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
  const { hasPermission, canAccess, isSuperAdmin, loading } = usePermissions();
  return {
    loading,
    can: (permission: string | string[]) => {
      if (loading) return false;
      if (isSuperAdmin()) return true;
      if (IS_DJANGO_BACKEND) {
        const perms = Array.isArray(permission) ? permission : [permission];
        return perms.some((p) => canAccess!(p));
      }
      return hasPermission(permission);
    },
  };
}
