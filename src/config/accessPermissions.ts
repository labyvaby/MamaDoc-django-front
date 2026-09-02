/**
 * Canonical permission requirements for Django pages and navigation.
 *
 * Keep route guards and sidebar visibility on this shared registry.  A user
 * who receives a permission must see the matching entry and be able to open
 * the page regardless of the role code chosen by an organization.
 */
export const PAGE_PERMISSIONS = {
  appointments: "appointments.view",
  // Page-visibility права трёх рабочих пространств приёмов: гейтят только
  // пункт меню и роут. Доступ к данным по-прежнему требует appointments.view,
  // поэтому эти права имеют смысл только вместе с ним.
  appointmentsRegistry: "appointments.registry.view",
  doctorRoom: "appointments.doctor_room.view",
  nurseRoom: "appointments.nurse_room.view",
  // Исторические реестры «Все приёмы» / «Все процедуры» permission-кода не
  // имеют: с 19.08.2026 они скрыты от всех, кроме суперадминистратора, и
  // гейтятся ролью (RequireSuperAdmin в App.tsx + isSuper в сайдбаре). Право
  // выдать нельзя — иначе организация вернула бы себе доступ через редактор
  // ролей.
  patients: "patients.view",
  employees: "staff.view",
  services: "catalog.view",
  expenses: ["finance.view", "finance.expense.view"],
  products: ["warehouse.view", "warehouse.sales.view"],
  warehouses: "warehouse.view",
  sales: ["warehouse.sales.view", "warehouse.view"],
  schedule: "schedule.view",
  attendance: "attendance.view",
  attendanceSettings: "attendance.manage",
  cashbox: "finance.view",
  reports: "reports.view",
  payroll: ["payroll.view", "payroll.view_own"],
  notifications: "notifications.manage",
  reviews: ["reviews.view", "reviews.manage"],
  bookings: ["bookings.view", "bookings.manage"],
  // Раздел «Чаты» — встроенный Chatwoot. Право выдаётся ролям в редакторе
  // ролей; сам аккаунт в Chatwoot заводит его администратор отдельно.
  chats: "chatwoot.view",
  tasks: "tasks.list",
  waitlist: ["waitlist.view", "waitlist.manage"],
  // Воронка продаж: смотреть доску даёт deals.list, настраивать — deals.manage.
  deals: ["deals.list", "deals.manage"],
  vaccinations: "vaccinations.view",
  achievements: "achievements.view",
  announcements: ["announcements.view", "announcements.manage"],
  conclusionPrint: "medical.conclusions.print",
  clients: "clients.view",
  pos: "pos.view",
  inventory: "warehouse.manage",
  ecommerce: "ecommerce.view",
  targets: "targets.view",
  messaging: "messaging.view",
} satisfies Record<string, string | string[]>;

export const SETTINGS_TAB_PERMISSIONS = {
  organization: "organization.view",
  branches: "branches.view",
  // Сайт-визитку настраивает тот же, кто правит организацию: конструктор
  // пишет в её themeConfig, отдельного кода прав на бэке нет.
  site: "organization.view",
  roles: "rbac.roles.view",
  memberships: "rbac.memberships.view",
  specializations: "staff.specializations.view",
  // Banks expose private employee requisites and use this permission in the
  // route/API.  There is no staff.banks.view permission in the registry.
  banks: "staff.private.view",
  insurers: "finance.view",
  cashlessMethods: "finance.view",
  expenseCategories: "finance.expense.manage",
  diagnoses: "medical.diagnoses.manage",
  // Своё право: бланки настраивает администратор, а читают их врачи по праву
  // на заключения (medical.conclusions.view) — отдельного права на чтение нет.
  // Шаблоны ролей выдают этот код там же, где medical.diagnoses.manage, так
  // что доступ у существующих ролей не меняется.
  conclusionForms: "medical.conclusion_forms.manage",
  tasks: "tasks.manage",
  deals: "deals.manage",
  cleaning: "cleaning.manage",
  skud: PAGE_PERMISSIONS.attendanceSettings,
  announcements: PAGE_PERMISSIONS.announcements,
  notifications: PAGE_PERMISSIONS.notifications,
  // Конструктор автоматизаций отправляет SMS/WhatsApp и на бэке гейтится тем
  // же notifications.manage, что и настройки уведомлений — своего кода прав
  // у модуля нет (docs/automations-api.md §2).
  automations: PAGE_PERMISSIONS.notifications,
  productAttributes: "warehouse.manage",
  // Витрина odoctor.kg. Право своё, а не общее с расписанием: за страницей
  // лежит учётная запись внешнего кабинета — ключ от чужой системы. Читать и
  // менять эти настройки бэк разрешает по одному и тому же коду, поэтому
  // «смотреть, но не править» на странице нет.
  odoctor: "odoctor.manage",
} satisfies Record<string, string | string[]>;

export type SettingsTabKey = keyof typeof SETTINGS_TAB_PERMISSIONS;
