import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { usePermissions } from '../../hooks/usePermissions';
import { IS_DJANGO_BACKEND } from '../../config/backend';
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
 * В Django-режиме проверяет и permission, и включённость модуля (canAccess).
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
  const { loading, hasPermission, hasAllPermissions, canAccess, isSuperAdmin } = usePermissions();

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

  let hasAccess: boolean;
  if (IS_DJANGO_BACKEND && canAccess) {
    hasAccess = requireAll
      ? perms.every((p) => canAccess(p))
      : perms.some((p) => canAccess(p));
  } else {
    hasAccess = requireAll ? hasAllPermissions(perms) : hasPermission(perms);
  }

  if (!hasAccess) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <AccessDenied description="Модуль недоступен для вашей организации или у вас нет прав." />
    );
  }

  return <>{children}</>;
};

export default RequirePermission;
