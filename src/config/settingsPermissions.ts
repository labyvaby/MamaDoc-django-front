/**
 * Permission codes that gate each settings section.
 *
 * This lightweight registry is shared by the settings layout and the main
 * sidebar so a section never disappears because those surfaces use different
 * access rules.
 */
export const SETTINGS_TAB_PERMISSIONS = {
  organization: "organization.view",
  branches: "branches.view",
  roles: "rbac.roles.view",
  memberships: "rbac.memberships.view",
  specializations: "staff.specializations.view",
  banks: "staff.banks.view",
  insurers: "finance.view",
  expenseCategories: "finance.expense.manage",
  diagnoses: "medical.diagnoses.manage",
  tasks: "tasks.manage",
  cleaning: "cleaning.manage",
  skud: "attendance.manage",
  announcements: "announcements.view",
} as const;

export type SettingsTabKey = keyof typeof SETTINGS_TAB_PERMISSIONS;
