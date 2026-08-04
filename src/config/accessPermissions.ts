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
  tasks: "tasks.list",
  vaccinations: "vaccinations.view",
  achievements: "achievements.view",
  announcements: ["announcements.view", "announcements.manage"],
  conclusionPrint: "medical.conclusions.print",
} satisfies Record<string, string | string[]>;

export const SETTINGS_TAB_PERMISSIONS = {
  organization: "organization.view",
  branches: "branches.view",
  roles: "rbac.roles.view",
  memberships: "rbac.memberships.view",
  specializations: "staff.specializations.view",
  // Banks expose private employee requisites and use this permission in the
  // route/API.  There is no staff.banks.view permission in the registry.
  banks: "staff.private.view",
  insurers: "finance.view",
  expenseCategories: "finance.expense.manage",
  diagnoses: "medical.diagnoses.manage",
  tasks: "tasks.manage",
  cleaning: "cleaning.manage",
  skud: PAGE_PERMISSIONS.attendanceSettings,
  announcements: PAGE_PERMISSIONS.announcements,
  notifications: PAGE_PERMISSIONS.notifications,
} satisfies Record<string, string | string[]>;

export type SettingsTabKey = keyof typeof SETTINGS_TAB_PERMISSIONS;
