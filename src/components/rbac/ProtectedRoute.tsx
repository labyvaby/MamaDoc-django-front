import React from 'react';
import { Navigate } from 'react-router';
import { useNotification } from "@refinedev/core";
import { usePermissions } from '../../hooks/usePermissions';
import { ROLE_HOME_PAGES, type RoleName } from '../../types/rbac';
import { CircularProgress, Box, Typography } from '@mui/material';
import { AccessDenied } from './AccessDenied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Разрешенные роли для доступа к маршруту */
  allowedRoles?: RoleName[];
  /** Запрещенные роли для доступа к маршруту */
  deniedRoles?: RoleName[];
  /** Требуемые permission-коды для доступа (Django RBAC) */
  requiredPermissions?: string[];
  /** Требовать все разрешения (по умолчанию false - хотя бы одно) */
  requireAll?: boolean;
  /** Куда редиректить при отсутствии доступа.
   *  Если не задан — показывается страница AccessDenied (не редирект). */
  redirectTo?: string;
}

/**
 * Компонент для защиты маршрутов на основе ролей и разрешений
 *
 * @example
 * <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
 *   <ExpensesPage />
 * </ProtectedRoute>
 *
 * @example
 * <ProtectedRoute requiredPermissions={['patients.create', 'patients.update']}>
 *   <AddPatientPage />
 * </ProtectedRoute>
 *
 * @example
 * <ProtectedRoute
 *   allowedRoles={['doctor']}
 *   requiredPermissions={['appointments.read']}
 *   redirectTo="/access-denied"
 * >
 *   <DoctorDashboard />
 * </ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  deniedRoles,
  requiredPermissions,
  requireAll = false,
  redirectTo = '/home',
}) => {
  const { hasRole, hasPermission, hasAllPermissions, loading, role: userRole } = usePermissions();
  const { open } = useNotification();

  // 0) Супер-админ всегда имеет доступ ко всему
  // Проверяем как по объекту роли, так и через hasRole (всемогущество)
  const isSuper = userRole?.name === 'superadmin';

  if (isSuper) {
    return <>{children}</>;
  }

  // Показываем загрузку пока проверяем права
  if (loading) {
    return (
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: theme.appLayout.fullPage.minHeight,
          gap: 2,
        })}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Проверка прав доступа...
        </Typography>
      </Box>
    );
  }

  // Функция для определения куда редиректить
  const getRedirectPath = () => {
    // Если явно передан redirectTo, используем его
    if (redirectTo !== '/home') return redirectTo;

    // Иначе пытаемся определить домашнюю страницу роли
    if (userRole?.name && ROLE_HOME_PAGES[userRole.name]) {
      return ROLE_HOME_PAGES[userRole.name];
    }

    // Фолбэк
    return '/home';
  };

  const handleAccessDenied = () => {
    // Если redirectTo явно задан — редиректим (обратная совместимость)
    if (redirectTo && redirectTo !== '/home') {
      return <Navigate to={redirectTo} replace />;
    }

    // Если есть роль — показываем AccessDenied (не редирект),
    // иначе это неавторизованный пользователь → редирект на home
    if (userRole) {
      open?.({
        type: "error",
        message: "Доступ запрещен",
        description: "У вас нет прав доступа к этому разделу",
      });
      return <AccessDenied />;
    }

    return <Navigate to={getRedirectPath()} replace />;
  };

  // Проверка запрещенных ролей (Супер-админ игнорирует запреты)
  if (!isSuper && deniedRoles && deniedRoles.length > 0) {
    if (hasRole(deniedRoles)) {
      return handleAccessDenied();
    }
  }

  // Проверка ролей
  if (allowedRoles && allowedRoles.length > 0) {
    if (!hasRole(allowedRoles)) {
      return handleAccessDenied();
    }
  }

  // Проверка разрешений
  if (requiredPermissions && requiredPermissions.length > 0) {
    if (requireAll) {
      // Требуем все разрешения
      if (!hasAllPermissions(requiredPermissions)) {
        return handleAccessDenied();
      }
    } else {
      // Требуем хотя бы одно разрешение
      if (!hasPermission(requiredPermissions)) {
        return handleAccessDenied();
      }
    }
  }

  // Доступ разрешен
  return <>{children}</>;
};
