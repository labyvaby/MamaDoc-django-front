/**
 * Maps a Django permission code prefix to the corresponding module code.
 * Must mirror the backend module definitions in server/apps/rbac/module_mapping.py.
 */
const PREFIX_TO_MODULE: Record<string, string> = {
  patients: 'patients',
  appointments: 'appointments',
  medical: 'appointments',
  staff: 'staff',
  users: 'staff',
  catalog: 'catalog',
  finance: 'finance',
  warehouse: 'warehouse',
  payroll: 'payroll',
  attendance: 'attendance',
  schedule: 'schedule',
  reports: 'reports',
  organization: 'organization',
  branches: 'organization',
  rbac: 'rbac',
  tenancy: 'rbac',
  tasks: 'tasks',
  achievements: 'achievements',
  programs: 'programs',
  enrollments: 'programs',
  documents: 'documents',
  cleaning: 'cleaning',
  knowledge: 'knowledge',
  vaccinations: 'vaccinations',
  announcements: 'announcements',
  notifications: 'notifications',
  profigram: 'profigram',
};

/**
 * Returns the module code for the given permission code, or null if the
 * permission prefix has no associated module (e.g. internal/system permissions).
 *
 * @example
 * getModuleCodeForPermission('patients.view')   // → 'patients'
 * getModuleCodeForPermission('finance.manage')  // → 'finance'
 * getModuleCodeForPermission('unknown.action')  // → null
 */
export function getModuleCodeForPermission(permissionCode: string): string | null {
  const prefix = permissionCode.split('.')[0];
  if (!prefix) return null;
  return PREFIX_TO_MODULE[prefix] ?? null;
}
