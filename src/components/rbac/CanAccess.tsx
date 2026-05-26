import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { RoleName } from '../../types/rbac';

interface CanAccessProps {
  children: React.ReactNode;
  /** Требуемые разрешения (хотя бы одно) */
  permissions?: string | string[];
  /** Требуемые роли (хотя бы одна) */
  roles?: RoleName | RoleName[];
  /** Требовать все разрешения вместо хотя бы одного */
  requireAll?: boolean;
  /** Что показать, если доступа нет */
  fallback?: React.ReactNode;
}

/**
 * Компонент для условного рендеринга на основе прав доступа
 *
 * @example
 * // Показать только пользователям с правом создания пациентов
 * <CanAccess permissions="patients.create">
 *   <Button>Добавить пациента</Button>
 * </CanAccess>
 *
 * @example
 * // Показать только администраторам
 * <CanAccess roles={['admin', 'superadmin']}>
 *   <AdminPanel />
 * </CanAccess>
 *
 * @example
 * // Требовать все разрешения
 * <CanAccess permissions={['patients.read', 'patients.update']} requireAll>
 *   <EditPatientButton />
 * </CanAccess>
 *
 * @example
 * // С fallback
 * <CanAccess permissions="expenses.read" fallback={<div>Нет доступа</div>}>
 *   <ExpensesList />
 * </CanAccess>
 */
export const CanAccess: React.FC<CanAccessProps> = ({
  children,
  permissions,
  roles,
  requireAll = false,
  fallback = null,
}) => {
  const { hasPermission, hasRole, hasAllPermissions, loading } = usePermissions();

  // Пока загружаются права, не показываем ничего
  if (loading) {
    return null;
  }

  // Проверка ролей
  if (roles) {
    if (!hasRole(roles)) {
      return <>{fallback}</>;
    }
  }

  // Проверка разрешений
  if (permissions) {
    const permsArray = Array.isArray(permissions) ? permissions : [permissions];

    if (requireAll) {
      // Требуем все разрешения
      if (!hasAllPermissions(permsArray)) {
        return <>{fallback}</>;
      }
    } else {
      // Требуем хотя бы одно разрешение
      if (!hasPermission(permsArray)) {
        return <>{fallback}</>;
      }
    }
  }

  // Если нет ни ролей, ни разрешений, показываем children
  return <>{children}</>;
};
