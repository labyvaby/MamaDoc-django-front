import type { RoleName } from '../types/rbac';
import { PERMISSIONS } from '../types/rbac';

/**
 * Конфигурация маршрутов с правами доступа
 * Определяет, какие роли и разрешения требуются для каждого маршрута
 *
 * ⚠ СПРАВОЧНЫЙ ФАЙЛ: сейчас ни ROUTE_PERMISSIONS, ни canAccessRoute нигде
 * не подключены — реальное принуждение прав живёт в App.tsx через
 * <RequirePermission> / <RequireModule>. Матрица здесь поддерживается как
 * документация (на неё ссылается CLAUDE.md); при изменении гейтов в App.tsx
 * обновляйте и её. Не полагайтесь на этот файл как на защиту.
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
    path: '/appointments',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist', 'accountant'],
  },

  // Поиск пациентов - доступен всем кроме бухгалтера
  {
    path: '/patients',
    allowedRoles: ['superadmin', 'admin', 'doctor', 'receptionist'],
    requiredPermissions: [PERMISSIONS.PATIENTS_LIST],
  },

  // Расходы - для администраторов, бухгалтеров и регистраторов, а также врачей и медсестер
  {
    path: '/expenses',
    allowedRoles: ['superadmin', 'admin', 'accountant', 'registrator', 'receptionist', 'manager', 'doctor', 'nurse'],
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

  // Задачи/заявки
  {
    path: '/tasks',
    requiredPermissions: [PERMISSIONS.TASKS_LIST],
  },

  // Лист ожидания
  {
    path: '/waitlist',
    requiredPermissions: [PERMISSIONS.WAITLIST_VIEW, PERMISSIONS.WAITLIST_MANAGE],
  },

  // Воронка продаж
  {
    path: '/deals',
    requiredPermissions: [PERMISSIONS.DEALS_LIST, PERMISSIONS.DEALS_MANAGE],
  },

  // Достижения
  {
    path: '/achievements',
    requiredPermissions: [PERMISSIONS.ACHIEVEMENTS_VIEW],
  },

  // Документы организации
  {
    path: '/documents',
    requiredPermissions: [PERMISSIONS.DOCUMENTS_VIEW],
  },

  // Уборка (уборщице достаточно cleaning.report, админу — view/manage)
  {
    path: '/cleaning',
    requiredPermissions: [
      PERMISSIONS.CLEANING_REPORT,
      PERMISSIONS.CLEANING_VIEW,
      PERMISSIONS.CLEANING_MANAGE,
    ],
  },
  // Настройки уборки (зоны, ставка) — только manage
  {
    path: '/settings/cleaning',
    requiredPermissions: [PERMISSIONS.CLEANING_MANAGE],
  },
  {
    path: '/settings/announcements',
    requiredPermissions: ['announcements.view', 'announcements.manage'],
  },
  {
    path: '/settings/modules',
    requiredPermissions: ['tenancy.catalog.view'],
  },

  // База знаний (страница статьи /knowledge/:articleId — те же права)
  {
    path: '/knowledge',
    requiredPermissions: [PERMISSIONS.KNOWLEDGE_VIEW],
  },
  {
    path: '/knowledge/:articleId',
    requiredPermissions: [PERMISSIONS.KNOWLEDGE_VIEW],
  },

  // Рабочий стол застройщика (AIVIO)
  {
    path: '/realestate/dashboard',
    requiredPermissions: [PERMISSIONS.ESTATE_DASHBOARD_VIEW],
  },

  // Аналитика застройщика: отчёт отдела продаж (realty), сводная (estate_dashboard)
  {
    path: '/realestate/analytics',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/bi',
    requiredPermissions: [PERMISSIONS.ESTATE_DASHBOARD_VIEW],
  },

  // Продажи застройщика (realty): воронка, лиды, звонки, показы, брони, каталог, ипотека, партнёры, маркетинг
  {
    path: '/realestate/funnel',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/leads',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/calls',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/shows',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/deals',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/catalog',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/mortgage',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/partners',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },
  {
    path: '/realestate/marketing',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },

  // «Планы и мотивация» застройщика (группа «Персонал»): salary
  {
    path: '/realestate/motivation',
    requiredPermissions: [PERMISSIONS.SALARY_VIEW],
  },

  // «Мой день» застройщика: задачи CRM (realty)
  {
    path: '/realestate/today',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },

  // Квартиры и шахматка застройщика (модуль бэка realty)
  {
    path: '/realestate/chessboard',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
  },

  // Биллинг рассрочек застройщика: бэк пускает по treasury.view или realty.view
  {
    path: '/finance/billing',
    requiredPermissions: [PERMISSIONS.TREASURY_VIEW, PERMISSIONS.REALESTATE_VIEW],
  },

  // Стройка застройщика: графики, подрядчики и акты, стройконтроль (construction)
  {
    path: '/construction/schedule',
    requiredPermissions: [PERMISSIONS.CONSTRUCTION_VIEW],
  },
  {
    path: '/construction/contractors',
    requiredPermissions: [PERMISSIONS.CONSTRUCTION_VIEW],
  },
  {
    path: '/construction/quality',
    requiredPermissions: [PERMISSIONS.CONSTRUCTION_VIEW],
  },

  // Персонал застройщика: сотрудники и табель (personnel), зарплата (salary)
  {
    path: '/personnel/staff',
    requiredPermissions: [PERMISSIONS.PERSONNEL_VIEW],
  },
  {
    path: '/personnel/timesheet',
    requiredPermissions: [PERMISSIONS.PERSONNEL_VIEW],
  },
  {
    path: '/personnel/payroll',
    requiredPermissions: [PERMISSIONS.SALARY_VIEW],
  },
  {
    path: '/personnel/acs',
    requiredPermissions: ['attendance.view'],
  },

  // Эксплуатация застройщика: приёмка и сервис жильцов (estate_ops), приложение жильца (resident_app)
  {
    path: '/ops/handover',
    requiredPermissions: [PERMISSIONS.ESTATE_OPS_VIEW],
  },
  {
    path: '/ops/residents',
    requiredPermissions: [PERMISSIONS.ESTATE_OPS_VIEW],
  },
  {
    path: '/ops/mobileapp',
    requiredPermissions: [PERMISSIONS.RESIDENT_APP_VIEW],
  },

  // Сметы, снабжение, склад застройщика (supply)
  {
    path: '/supply/estimates',
    requiredPermissions: [PERMISSIONS.SUPPLY_VIEW],
  },
  {
    path: '/supply/procurement',
    requiredPermissions: [PERMISSIONS.SUPPLY_VIEW],
  },
  {
    path: '/supply/warehouse',
    requiredPermissions: [PERMISSIONS.SUPPLY_VIEW],
  },

  // Финансы застройщика: касса и банк, платёжный календарь, бюджеты, долги (treasury)
  {
    path: '/finance/cashbank',
    requiredPermissions: [PERMISSIONS.TREASURY_VIEW],
  },
  {
    path: '/finance/paycal',
    requiredPermissions: [PERMISSIONS.TREASURY_VIEW],
  },
  {
    path: '/finance/budget',
    requiredPermissions: [PERMISSIONS.TREASURY_VIEW],
  },
  {
    path: '/finance/receivables',
    requiredPermissions: [PERMISSIONS.TREASURY_VIEW],
  },

  // Документы застройщика: ЭДО, договоры, шаблоны, архив.
  // Не /docs/ — этот префикс на сервере занят Django (swagger/openapi): F5 давал 404.
  {
    path: '/edo',
    requiredPermissions: [PERMISSIONS.EDO_VIEW],
  },
  // «Документы (CRM)» — файлы сделок
  {
    path: '/realestate/documents',
    requiredPermissions: [PERMISSIONS.REALESTATE_VIEW],
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
