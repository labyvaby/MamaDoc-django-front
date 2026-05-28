/**
 * Maps a Django permission code prefix to the corresponding module code.
 * Must mirror the backend module definitions in apps/tenancy/modules.py.
 */
const PREFIX_TO_MODULE: Record<string, string> = {
  patients: 'patients',
  appointments: 'appointments',
  staff: 'staff',
  // sidebar использует 'users.view' для раздела сотрудников → модуль staff
  users: 'staff',
  catalog: 'catalog',
  finance: 'finance',
  warehouse: 'warehouse',
  reports: 'reports',
  organization: 'organization',
  branches: 'organization',
  rbac: 'rbac',
  tenancy: 'rbac',
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
