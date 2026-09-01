import React from "react";
import { useQuery } from "@tanstack/react-query";

import { getRoles, rolesForActiveOrg, type RbacRole } from "../api/rbac";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { usePermissions } from "./usePermissions";

export interface UseOrgRolesResult {
  /** Роли активной организации без `superadmin`; пусто, если список недоступен. */
  roles: RbacRole[];
  /**
   * Список получен. Если `false`, вызывающий показывает свой запасной набор:
   * `/rbac/roles/` закрыт правом `rbac.roles.view`, а роли нужны и там, где у
   * пользователя только право своего модуля (например `tasks.manage`).
   */
  available: boolean;
  isLoading: boolean;
}

/**
 * Роли (группы сотрудников) активной организации — для выбора исполнителей,
 * адресатов и прочих привязок к группам.
 *
 * Списки ролей нельзя держать константой в коде: набор групп у организаций
 * разный, свои роли создаются в «Настройки → Роли», и захардкоженный перечень
 * предлагает выбрать то, чего в организации нет.
 */
export function useOrgRoles(enabled = true): UseOrgRolesResult {
  const { activeOrganization } = usePermissions();
  const orgId = activeOrganization?.id;

  const { data, isSuccess, isLoading } = useQuery<RbacRole[]>({
    // orgId в ключе и в запросе: без него суперюзеру/мультиорг-пользователю
    // прилетают чужие и задублированные роли (см. getRoles).
    queryKey: ["django", "rbac", "roles", orgId ?? null],
    queryFn: () => getRoles(orgId),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    // Нет права rbac.roles.view — будет 403; повторять запрос незачем.
    retry: false,
  });

  const roles = React.useMemo(
    () => rolesForActiveOrg(data ?? [], orgId).filter((r) => r.code !== "superadmin"),
    [data, orgId],
  );

  return { roles, available: isSuccess && roles.length > 0, isLoading };
}
