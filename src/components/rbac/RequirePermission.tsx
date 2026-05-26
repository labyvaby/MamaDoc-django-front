import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { usePermissions } from '../../hooks/usePermissions';
import { AccessDenied } from './AccessDenied';

interface RequirePermissionProps {
  children: React.ReactNode;
  /** Одно или несколько прав (хотя бы одно, если requireAll = false) */
  permission: string | string[];
  /** Требовать все права одновременно */
  requireAll?: boolean;
  /** Кастомный fallback вместо стандартного AccessDenied */
  fallback?: React.ReactNode;
}

/**
 * Route / section guard на основе permission-кодов Django RBAC.
 *
 * @example
 * <RequirePermission permission="patients.view">
 *   <PatientsPage />
 * </RequirePermission>
 *
 * @example
 * <RequirePermission permission={['finance.view', 'finance.manage']} requireAll>
 *   <FinancePage />
 * </RequirePermission>
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({
  children,
  permission,
  requireAll = false,
  fallback,
}) => {
  const { loading, hasPermission, hasAllPermissions, isSuperAdmin } = usePermissions();

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Superadmin bypasses all permission checks
  if (isSuperAdmin()) {
    return <>{children}</>;
  }

  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = requireAll ? hasAllPermissions(perms) : hasPermission(perms);

  if (!hasAccess) {
    return fallback !== undefined ? <>{fallback}</> : <AccessDenied />;
  }

  return <>{children}</>;
};

export default RequirePermission;
