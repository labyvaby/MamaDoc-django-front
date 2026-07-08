import { usePermissions } from "./usePermissions";

/**
 * organizationId для API-запросов орг-скоупных модулей (tasks, achievements...).
 *
 * Бэк выводит организацию из membership сессии, но суперпользователю (и
 * мультиорг-аккаунту) требуется явный query-параметр organizationId — иначе
 * 400 «Суперпользователю необходимо указать organizationId» (см. паттерн
 * orgRequired на страницах expenses/cashbox/reports).
 */
export function useApiOrgId(): number | undefined {
  const { isSuperAdmin, memberships, activeOrganization } = usePermissions();
  const orgRequired = isSuperAdmin() || (memberships ?? []).length > 1;
  return orgRequired ? activeOrganization?.id ?? undefined : undefined;
}

export default useApiOrgId;
