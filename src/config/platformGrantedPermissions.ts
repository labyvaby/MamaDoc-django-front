/**
 * Права, которые выдаёт и снимает только суперпользователь платформы:
 * клиника сама переключает модули своего пакета, включая ядро (решение
 * владельца 2026-09-26). На бэке — rbac.services.PLATFORM_GRANTED_PERMISSIONS:
 * администратор клиники не может их ни выдать, ни снять, сервер оставляет как
 * было. Поэтому в редакторах прав клиники их не показываем.
 */
export const PLATFORM_GRANTED_PERMISSION_CODES: ReadonlySet<string> = new Set([
  "tenancy.catalog.connect",
  "tenancy.catalog.disconnect",
]);

/** Показывать ли право в редакторе прав: платформенные — только суперпользователю. */
export function isPermissionEditable(code: string, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || !PLATFORM_GRANTED_PERMISSION_CODES.has(code);
}

/**
 * Право именно в этой организации. Сервер проверяет его в участии той
 * организации, с которой работает страница, без обхода для роли «superadmin»,
 * поэтому и здесь нет ни объединения прав по всем клиникам, ни обхода по имени роли.
 */
export function membershipGrants(
  membership: { permissions?: string[] } | null | undefined,
  code: string,
): boolean {
  return Boolean(membership?.permissions?.includes(code));
}
