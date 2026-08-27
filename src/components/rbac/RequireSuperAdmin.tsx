import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { usePermissions } from '../../hooks/usePermissions';
import { AccessDenied } from './AccessDenied';

interface RequireSuperAdminProps {
  children: React.ReactNode;
  /** Кастомный fallback вместо стандартного AccessDenied */
  fallback?: React.ReactNode;
}

/**
 * Route-гейт «только суперадминистратор».
 *
 * Нужен там, где страницу нельзя открыть даже по выданному праву: ни одна роль
 * организации не должна её видеть. Сейчас так закрыты исторические реестры
 * «Все приёмы» и «Все процедуры» (пожелание заказчика 19.08.2026) — в отличие
 * от RequirePermission, здесь нет permission-кода, который организация могла бы
 * выдать себе в редакторе ролей.
 *
 * @example
 * <RequireSuperAdmin>
 *   <AppointmentsPage />
 * </RequireSuperAdmin>
 */
export const RequireSuperAdmin: React.FC<RequireSuperAdminProps> = ({
  children,
  fallback,
}) => {
  const { loading, isSuperAdmin } = usePermissions();

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

  if (!isSuperAdmin()) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <AccessDenied description="Раздел доступен только суперадминистратору." />
    );
  }

  return <>{children}</>;
};

export default RequireSuperAdmin;
