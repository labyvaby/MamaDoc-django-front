import type { RoleName } from '../types/rbac';
import { PERMISSIONS } from '../types/rbac';

/**
 * Конфигурация маршрутов с правами доступа
 * Определяет, какие роли и разрешения требуются для каждого маршрута
 */

export interface RoutePermissionConfig {
  path: string;
  allowedRoles?: RoleName[];
  requiredPermissions?: string[];
  requireAll?: boolean;
}

export const ROUTE_PERMISSIONS: RoutePermissionConfig[] = [
  // Главная страница - доступна всем авторизованным
  {
    path: '/home',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist', 'accountant'],
  },

  // Поиск пациентов - доступен всем кроме бухгалтера
  {
    path: '/patient-search',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist'],
    requiredPermissions: [PERMISSIONS.PATIENTS_LIST],
  },

  // Расходы - для администраторов, бухгалтеров и регистраторов
  {
    path: '/expenses',
    allowedRoles: ['superadmin', 'admin', 'accountant', 'registrator', 'receptionist', 'manager'],
    requiredPermissions: [PERMISSIONS.EXPENSES_LIST],
  },

  // Сотрудники - только для администраторов
  {
    path: '/employees',
    allowedRoles: ['superadmin', 'admin'],
    requiredPermissions: [PERMISSIONS.EMPLOYEES_LIST],
  },

  // Услуги - доступны всем (чтение), редактирование только админам
  {
    path: '/services',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist', 'accountant'],
    requiredPermissions: [PERMISSIONS.SERVICES_LIST],
  },

  // График - доступен всем для просмотра
  {
    path: '/schedule',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist'],
    requiredPermissions: [PERMISSIONS.SCHEDULE_READ],
  },

  // Категории - только для администраторов
  {
    path: '/categories',
    allowedRoles: ['superadmin', 'admin'],
  },
];

/**
 * Получить конфигурацию прав для маршрута
 */
export const getRoutePermissions = (path: string): RoutePermissionConfig | undefined => {
  return ROUTE_PERMISSIONS.find((route) => path.startsWith(route.path));
};

/**
 * Проверить, имеет ли пользователь доступ к маршруту
 */
export const canAccessRoute = (
  path: string,
  userRole: RoleName | null,
  userPermissions: string[]
): boolean => {
  const config = getRoutePermissions(path);

  if (!config) {
    // Если маршрут не в конфигурации, разрешаем доступ
    return true;
  }

  // Проверка роли
  if (config.allowedRoles && userRole) {
    if (!config.allowedRoles.includes(userRole)) {
      return false;
    }
  }

  // Проверка разрешений
  if (config.requiredPermissions && config.requiredPermissions.length > 0) {
    if (config.requireAll) {
      // Требуются все разрешения
      return config.requiredPermissions.every((perm) => userPermissions.includes(perm));
    } else {
      // Требуется хотя бы одно разрешение
      return config.requiredPermissions.some((perm) => userPermissions.includes(perm));
    }
  }

  return true;
};
